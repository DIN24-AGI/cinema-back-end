import { Router } from "express";
import { pool } from "../db";
import { authenticate, requireSuper } from "../middleware/auth";

export const adminStatisticsRouter = Router();

// ----------------------
// RESERVATIONS
// ----------------------
// GET reservations grouped by payment
adminStatisticsRouter.get("/reservations", authenticate, requireSuper, async (req, res) => {
	const { start_date, end_date, status, cinema_uid } = req.query;

	try {
		let query = `
      SELECT 
        r.payment_uid,
        p.amount,
        p.currency,
        p.status as payment_status,
        p.created_at as payment_created_at,
        p.updated_at as payment_updated_at,
        MIN(r.created_at) as first_reservation_at,
        MAX(r.paid_at) as paid_at,
        MAX(r.expires_at) as expires_at,
        MAX(r.status) as reservation_status,
        MAX(r.user_email) as user_email,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'reservation_uid', r.uid,
            'seat_row', s.row,
            'seat_number', s.number,
            'showtime_start', sh.starts_at,
            'showtime_end', sh.ends_at,
            'adult_price', sh.adult_price,
            'child_price', sh.child_price,
            'movie_title', m.title,
            'hall_name', h.name,
            'cinema_name', c.name,
            'cinema_uid', c.uid
          ) ORDER BY s.row, s.number
        ) as reservations
      FROM reservation r
      JOIN seat s ON r.seat_uid = s.uid
      JOIN showtime sh ON r.showtime_uid = sh.uid
      JOIN movie m ON sh.movie_uid = m.uid
      JOIN hall h ON sh.hall_uid = h.uid
      JOIN cinema c ON h.cinema_uid = c.uid
      LEFT JOIN payment p ON r.payment_uid = p.uid
      WHERE 1=1
    `;

		const params: any[] = [];
		let paramIndex = 1;

		// Filter by date range (using created_at)
		if (start_date) {
			query += ` AND DATE(r.created_at) >= $${paramIndex++}`;
			params.push(start_date);
		}

		if (end_date) {
			query += ` AND DATE(r.created_at) <= $${paramIndex++}`;
			params.push(end_date);
		}

		// Filter by status
		if (status && typeof status === "string") {
			query += ` AND r.status = $${paramIndex++}`;
			params.push(status);
		}

		// Filter by cinema
		if (cinema_uid && typeof cinema_uid === "string") {
			query += ` AND c.uid = $${paramIndex++}`;
			params.push(cinema_uid);
		}

		query += ` 
      GROUP BY r.payment_uid, p.amount, p.currency, p.status, 
               p.created_at, p.updated_at
      ORDER BY p.created_at DESC
    `;

		const { rows } = await pool.query(query, params);
		res.json(rows);
	} catch (err) {
		console.error("Failed to fetch reservations:", err);
		res.status(500).json({ msg: "failed to fetch reservations" });
	}
});
