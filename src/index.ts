import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { adminMoviesRouter } from "./routes/admin_movies";
import paymentsRouter from "./routes/payments";
import webhookRouter from "./routes/payments_webhook";
import { authenticate } from "./middleware/auth";

const app = express();

// Enable CORS for all routes
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? "https://lively-moss-05fbe2703.3.azurestaticapps.net"
        : "http://localhost:5173",
    credentials: true,
  })
);

app.post(
  "/payments/webhook",
  express.raw({ type: "application/json" }),
  webhookRouter
);

app.use(express.json());

app.use("/payments", paymentsRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/admin/movies", adminMoviesRouter);

app.get("/me", authenticate, (req, res) => res.json({ user: req.user }));

app.listen(3000, () =>
  console.log("🚀 API is running on http://localhost:3000")
);
