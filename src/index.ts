import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { adminMoviesRouter } from "./routes/admin_movies";
import paymentsRouter from "./routes/payments";
import webhookRouter from "./routes/payments_webhook";
import { authenticate } from "./middleware/auth";

const app = express();
const port = process.env.PORT || 3000;

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

// PostgreSQL connection setup
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

app.post("/payments/webhook", express.raw({ type: "application/json" }), webhookRouter);

app.use(express.json());

app.use("/payments", paymentsRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/admin/movies", adminMoviesRouter);

app.get("/me", authenticate, (req, res) => res.json({ user: req.user }));

// Health check endpoints
app.get("/api/test", (req, res) => {
	res.json({
		message: "API is working!",
		environment: process.env.NODE_ENV,
	});
});

app.get("/api/db-health", async (req, res) => {
	try {
		const result = await pool.query("SELECT NOW() as now, version() as version");
		res.json({
			status: "healthy",
			timestamp: result.rows[0].now,
			database: result.rows[0].version,
			environment: process.env.NODE_ENV,
		});
	} catch (error) {
		res.status(500).json({
			status: "unhealthy",
			error: error instanceof Error ? error.message : "Unknown error",
			environment: process.env.NODE_ENV,
		});
	}
});

// Use the 'port' variable instead of hardcoded 3000
app.listen(port, () => console.log(`🚀 API is running on http://localhost:${port}`));
