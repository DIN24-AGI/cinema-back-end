import express from "express";
import Stripe from "stripe";
import { pool } from "../db";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ===============================
//  Create Checkout Session
// ===============================
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { showtime_uid, seat_uids, amount, currency = "eur" } = req.body;

    if (!amount || amount <= 0 || !showtime_uid || !seat_uids?.length)
      return res.status(400).json({ error: "Invalid input data" });

    // 1) create payment record (email = null for now, Stripe will give it later)
    const result = await pool.query(
      `INSERT INTO payment (user_email, amount, currency, status)
       VALUES (NULL, $1, $2, 'pending')
       RETURNING uid`,
      [amount, currency]
    );
    const payment_uid = result.rows[0].uid;

    // 2) create reservation(s)
    for (const seat_uid of seat_uids) {
      await pool.query(
        `INSERT INTO reservation (showtime_uid, seat_uid, user_email, price, status, expires_at, payment_uid)
         VALUES ($1, $2, NULL, $3, 'reserved', NOW() + INTERVAL '15 minutes', $4)
         ON CONFLICT (showtime_uid, seat_uid) DO NOTHING;`,
        [showtime_uid, seat_uid, amount / seat_uids.length, payment_uid]
      );
    }

    // 3) create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: undefined, // Stripe collects email automatically
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

export default router;
