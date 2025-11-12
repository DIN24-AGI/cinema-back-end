import express from "express";
import Stripe from "stripe";
import { pool } from "../db";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

// must use raw body for signature verification
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
      const payment_uid = session.metadata?.payment_uid;

      if (!payment_uid) {
        console.warn("Missing payment_uid in metadata", session.id);
        return res.json({ received: true });
      }

      try {
        // update payment
        await pool.query(
          `UPDATE payment SET status='paid', updated_at=NOW() WHERE uid=$1`,
          [payment_uid]
        );

        // update reservations
        await pool.query(
          `UPDATE reservation
           SET status='paid', paid_at=NOW(), expires_at=NULL
           WHERE payment_uid=$1`,
          [payment_uid]
        );

        console.log(` Payment confirmed for ${payment_uid}`);
      } catch (err) {
        console.error("Failed to update DB after payment:", err);
      }
    }

    res.json({ received: true });
  }
);

export default router;
