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
    console.error(" Webhook signature verification failed:", err);
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const payment_uid = session.metadata?.payment_uid;
    const email = session.customer_details?.email ?? null;

    console.log(" Stripe webhook received:");
    console.log("   payment_uid =", payment_uid);
    console.log("   email       =", email);

    if (!payment_uid) {
      console.warn(" Missing payment_uid in metadata");
      return res.json({ received: true });
    }

    try {
      // Update payment
      await pool.query(
        `UPDATE payment 
         SET status='paid',
             updated_at=NOW(),
             user_email=$2
         WHERE uid=$1`,
        [payment_uid, email]
      );

      // Update reservations
      await pool.query(
        `UPDATE reservation
         SET status='paid',
             user_email=$2,
             paid_at=NOW(),
             expires_at=NULL
         WHERE payment_uid=$1`,
        [payment_uid, email]
      );

      console.log(`Payment processed: ${payment_uid}`);
    } catch (e) {
      console.error(" Failed to update DB", e);
      return res.status(500).send("DB Error");
    }
  }

  res.json({ received: true });
};

export default webhookHandler;
