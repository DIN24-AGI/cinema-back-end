import express from "express";
import { Pool } from "pg";
import dotenv from "dotenv";
import cors from "cors";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Add this to parse JSON bodies

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

// Test database connection on startup
pool
    .connect()
    .then(() => console.log("Connected to the database"))
    .catch((err) => console.error("Database connection error", err));

// Routes
app.use("/auth", authRouter);
app.use("/admin", adminRouter);

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

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
