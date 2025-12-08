import { Request, Response } from "express";
import Stripe from "stripe";
import { pool } from "../db";
import { sendTicketEmail } from "../utils/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const webhookHandler = async (req: Request, res: Response) => {
  console.log("\n===================== WEBHOOK HIT =====================");

  const sig = req.headers["stripe-signature"] as string | undefined;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  let event: Stripe.Event;

  console.log("Signature header:", sig);
  console.log("Using endpoint secret:", endpointSecret);

  try {
    console.log("Constructing Stripe event...");
    event = stripe.webhooks.constructEvent(req.body, sig!, endpointSecret);
    console.log("Stripe event constructed OK:", event.type);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).send("Webhook Error");
  }

  // Only handle checkout completion
  if (event.type === "checkout.session.completed") {
    console.log("\n------ CHECKOUT SESSION COMPLETED ------");

    const session = event.data.object as Stripe.Checkout.Session;

    console.log("Raw session object:", JSON.stringify(session, null, 2));

    const payment_uid = session.metadata?.payment_uid;
    const email = session.customer_details?.email ?? null;
    const showtime_uid = session.metadata?.showtime_uid ?? "unknown";
    const seat_uids = session.metadata?.seat_uids ?? "unknown";

    console.log("Parsed values:");
    console.log("  payment_uid  =", payment_uid);
    console.log("  email        =", email);
    console.log("  showtime_uid =", showtime_uid);
    console.log("  seat_uids    =", seat_uids);

    if (!payment_uid) {
      console.warn(" payment_uid is missing in metadata");
      return res.json({ received: true });
    }

    try {
      console.log("\n--- Updating payment in DB ---");
      const updatePayment = await pool.query(
        `UPDATE payment 
         SET status='paid',
             updated_at=NOW(),
             user_email=$2
         WHERE uid=$1
         RETURNING *`,
        [payment_uid, email]
      );
      console.log("Payment update result:", updatePayment.rows);

      console.log("\n--- Updating reservations in DB ---");
      const updateReservation = await pool.query(
        `UPDATE reservation
         SET status='paid',
             user_email=$2,
             paid_at=NOW(),
             expires_at=NULL
         WHERE payment_uid=$1
         RETURNING *`,
        [payment_uid, email]
      );
      console.log("Reservation update result:", updateReservation.rows);

      console.log(`✔ Payment processed successfully: ${payment_uid}`);

      // ===================================================
      // SEND EMAIL
      // ===================================================
      console.log("\n--- Attempting to send email ---");

      if (!email) {
        console.log("⚠ Cannot send email: email is NULL");
      } else {
        const html = `
          <h2>Your Cinema Ticket is Confirmed 🎟</h2>
          <p>Thank you for your purchase!</p>
          <p><strong>Order ID:</strong> ${payment_uid}</p>
          <p><strong>Showtime:</strong> ${showtime_uid}</p>
          <p><strong>Seats:</strong> ${seat_uids}</p>
        `;

        try {
          await sendTicketEmail(email, "Your Cinema Tickets", html);
          console.log(`Email successfully sent to: ${email}`);
        } catch (emailErr) {
          console.error("EMAIL SEND ERROR:", emailErr);
        }
      }

    } catch (dbErr) {
      console.error("DATABASE ERROR:", dbErr);
      return res.status(500).send("DB or email Error");
    }
  }

  res.json({ received: true });
};

export default webhookHandler;
