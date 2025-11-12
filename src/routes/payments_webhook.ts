import express from "express";
import Stripe from "stripe";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// IMPORTANT: use raw body to verify webhook signature
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return res.status(400).send(`Webhook Error`);
    }

    // Handle relevant Stripe events
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Your business logic here:
      // 1) Retrieve metadata (order_id / showtime_id / seat_ids / user_id)
      // 2) Mark payment as successful in the database
      // 3) Confirm seat reservation and issue a ticket
      // 4) Store session.id / payment_intent for transaction history
      console.log("Payment success for session:", session.id, session.metadata);
    }

    // Optionally handle other event types
    res.json({ received: true });
  }
);

export default router;
