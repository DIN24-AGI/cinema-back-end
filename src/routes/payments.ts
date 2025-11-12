import express from "express";
import Stripe from "stripe";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

router.post("/create-checkout-session", async (req, res) => {
  try {
    // for example showtime_id, seats[]
    const { movieTitle, amount, currency = "eur", metadata } = req.body;

    // Validate input
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: movieTitle ?? "Cinema ticket" },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
     
      metadata: {
        ...(metadata || {}), // example: showtime_id, seat_ids,
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export default router;
