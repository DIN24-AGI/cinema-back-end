import { Router } from "express";
import { pool } from "../db";

const clientRouter = Router();

// Get all cities
clientRouter.get("/cities", async (req, res) => {
	const { rows } = await pool.query("SELECT * FROM city ORDER BY name");
	res.json(rows);
});

// Get cinemas
clientRouter.get("/cinemas", async (req, res) => {
	const { rows } = await pool.query("SELECT * FROM cinema");
	res.json(rows);
});

// Get movies
clientRouter.get("/movies", async (req, res) => {
	const { rows } = await pool.query("SELECT * FROM movie");
	res.json(rows);
});

//Get movie by ID
clientRouter.get("/movies/:movie_uid", async (req, res) => {
	const { movie_uid } = req.params;
	const { rows } = await pool.query("SELECT * FROM movie WHERE uid = $1", [movie_uid]);
	if (rows.length === 0) return res.status(404).json({ msg: "Movie not found" });
	res.json(rows[0]);
});

// get showtimes by date
clientRouter.get("/showtimes", async (req, res) => {
	const { date, movie_uid, hall_uid } = req.query;

	try {
		let query = `
      SELECT s.*, 
             m.title as movie_title, 
             h.name as hall_name,
             c.name as cinema_name
      FROM showtime s
      JOIN movie m ON s.movie_uid = m.uid
      JOIN hall h ON s.hall_uid = h.uid
      JOIN cinema c ON h.cinema_uid = c.uid
      WHERE 1=1
    `;
		const params: any[] = [];
		let paramIndex = 1;

		if (date) {
			query += ` AND DATE(s.starts_at) = $${paramIndex++}`;
			params.push(date);
		}

		if (movie_uid) {
			query += ` AND s.movie_uid = $${paramIndex++}`;
			params.push(movie_uid);
		}

		if (hall_uid) {
			query += ` AND s.hall_uid = $${paramIndex++}`;
			params.push(hall_uid);
		}

		query += ` ORDER BY s.starts_at`;

		const { rows } = await pool.query(query, params);
		res.json(rows);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to fetch showtimes" });
	}
});

export default clientRouter;
