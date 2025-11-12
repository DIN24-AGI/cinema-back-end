import express from "express";
import Stripe from "stripe";
import { pool } from "../db"; 

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});


// ===============================
//  Create Checkout Session
// ===============================
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { user_email, showtime_uid, seat_uids, amount, currency = "eur" } = req.body;

    if (!amount || amount <= 0 || !showtime_uid || !seat_uids?.length)
      return res.status(400).json({ error: "Invalid input data" });

    // 1) create payment record
    const result = await pool.query(
      `INSERT INTO payment (user_email, amount, currency, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING uid`,
      [user_email, amount, currency]
    );
    const payment_uid = result.rows[0].uid;

    // 2) create reservation(s)
    for (const seat_uid of seat_uids) {
      await pool.query(
        `INSERT INTO reservation (showtime_uid, seat_uid, user_email, price, status, expires_at, payment_uid)
         VALUES ($1, $2, $3, $4, 'reserved', NOW() + INTERVAL '15 minutes', $5)
         ON CONFLICT (showtime_uid, seat_uid) DO NOTHING;`,
        [showtime_uid, seat_uid, user_email, amount / seat_uids.length, payment_uid]
      );
    }

    // 3) create stripe session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: "Cinema tickets" },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_uid,
        showtime_uid,
        seat_uids: seat_uids.join(","),
        user_email,
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });

    // 4) save Stripe session id
    await pool.query(
      `UPDATE payment SET session_id = $1 WHERE uid = $2`,
      [session.id, payment_uid]
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});


// ===============================
//  Stripe Webhook
// ===============================
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return res.status(400).send("Webhook Error");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      

      if (!session.metadata || !session.metadata.payment_uid) {
            console.warn("Missing payment_uid in Stripe metadata", session.id);
            return res.status(200).json({ received: true });
            }

      const { payment_uid } = session.metadata;

      try {
        // 1) mark payment as paid
        await pool.query(
          `UPDATE payment SET status='paid', updated_at=NOW() WHERE uid=$1`,
          [payment_uid]
        );

        // 2) mark reservations as paid
        await pool.query(
          `UPDATE reservation
           SET status='paid', paid_at=NOW(), expires_at=NULL
           WHERE payment_uid=$1`,
          [payment_uid]
        );

        console.log(` Payment success for ${payment_uid}`);
      } catch (err) {
        console.error("Failed to update DB after payment:", err);
      }
    }

    res.json({ received: true });
  }
);

export default router;
