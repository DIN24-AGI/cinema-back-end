import { Request, Response } from "express";
import Stripe from "stripe";
import { pool } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const payment_uid = session.metadata?.payment_uid;

    if (payment_uid) {
      try {
        await pool.query(
          `UPDATE payment SET status='paid', updated_at=NOW() WHERE uid=$1`,
          [payment_uid]
        );
        await pool.query(
          `UPDATE reservation
           SET status='paid', paid_at=NOW(), expires_at=NULL
           WHERE payment_uid=$1`,
          [payment_uid]
        );
        console.log(`Payment confirmed for ${payment_uid}`);
      } catch (e) {
        console.error("Failed to update DB after payment:", e);
      }
    } else {
      console.warn("Missing payment_uid in metadata", session.id);
    }
  }

  res.json({ received: true });
};

export default webhookHandler;
