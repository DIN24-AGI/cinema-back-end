import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import http from "http";

dotenv.config();

import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { adminMoviesRouter } from "./routes/admin_movies";
import paymentsRouter from "./routes/payments";
import webhookHandler from "./routes/payments_webhook";
import { authenticate } from "./middleware/auth";
import clientRouter from "./routes/client";
import { initSeatsWSS } from "./ws/seats";   
import path from "path";

if (!process.env.JWT_SECRET) {
	console.error("JWT_SECRET missing");
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.warn("DATABASE_URL missing (using local PG vars if set)");
}

const app = express();
const port = process.env.PORT || 3000;

// CORS
const allowedOrigins = [
	process.env.FRONTEND_URL,
	"https://lively-moss-05fbe2703.3.azurestaticapps.net",
	"https://orange-wave-0372a7903.3.azurestaticapps.net",
	"http://localhost:5173",
	"http://localhost:5174",
].filter(Boolean) as string[];

app.use(
	cors({
		origin: (origin, cb) => {
			if (!origin) return cb(null, true);
			if (allowedOrigins.includes(origin)) return cb(null, true);
			return cb(new Error(`Not allowed by CORS: ${origin}`));
		},
		credentials: true,
	})
);

// Stripe webhook BEFORE json()
app.post("/payments/webhook", express.raw({ type: "application/json" }), webhookHandler);

// JSON body parser
app.use(express.json());

// DB pool
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
pool
	.connect()
	.then((c) => {
		c.release();
		console.log("DB connected");
	})
	.catch((err) => {
		console.error("DB connection error", err);
	});

// Routes
app.use("/payments", paymentsRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/admin/movies", adminMoviesRouter);
app.use("/api", clientRouter);
app.use("/api/client", clientRouter);
app.use("/tickets", express.static(path.join(__dirname, "public", "tickets")));
app.get("/", (_req, res) => res.json({ service: "cinema-back-end", env: process.env.NODE_ENV }));

app.get("/me", authenticate, (req, res) => res.json({ user: req.user }));

app.get("/api/test", (_req, res) => res.json({ message: "API is working!", environment: process.env.NODE_ENV }));

app.get("/api/db-health", async (_req, res) => {
	try {
		const r = await pool.query("SELECT NOW() as now, version() as version");
		res.json({
			status: "healthy",
			timestamp: r.rows[0].now,
			database: r.rows[0].version,
			environment: process.env.NODE_ENV,
		});
	} catch (e) {
		res.status(500).json({ status: "unhealthy", error: (e as Error).message });
	}
});


// Graceful shutdown
process.on("SIGTERM", async () => {
	console.log("SIGTERM received. Closing pool.");
	await pool.end();
	process.exit(0);
});

// ==== HTTP + WebSocket server ====
const server = http.createServer(app);

// initialize WebSocket seats hub
initSeatsWSS(server);

server.listen(port, () => console.log(`API listening on ${port}`));
