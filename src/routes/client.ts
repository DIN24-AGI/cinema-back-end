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
  const { cinema_uid, date, hall_uid } = req.query;

  if (!cinema_uid)
    return res.status(400).json({ msg: "cinema_uid is required" });

  if (!date)
    return res.status(400).json({ msg: "date is required" });

  try {
    let query = `
      SELECT 
        s.uid,
        s.movie_uid,
        s.hall_uid,
        s.starts_at,
        s.ends_at,
        s.adult_price,
        s.child_price,
        m.title AS movie_title,
        m.poster_url,
        h.name AS hall_name,
        c.name AS cinema_name
      FROM showtime s
      JOIN movie  m ON s.movie_uid = m.uid
      JOIN hall   h ON s.hall_uid = h.uid
      JOIN cinema c ON h.cinema_uid = c.uid
      WHERE c.uid = $1
        AND DATE(s.starts_at) = $2
    `;

    const params: any[] = [cinema_uid, date];
    let paramIndex = 3;

    if (hall_uid) {
      query += ` AND h.uid = $${paramIndex++}`;
      params.push(hall_uid);
    }

    query += ` ORDER BY s.starts_at`;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch showtimes:", err);
    res.status(500).json({ msg: "failed to fetch showtimes" });
  }
});


// ============================
// GET seats with reservation status
// ============================

clientRouter.get("/seats", async (req, res) => {
  const { showtime_uid } = req.query;

  if (!showtime_uid)
    return res.status(400).json({ msg: "showtime_uid is required" });

  try {
    const { rows } = await pool.query(
      `
      SELECT 
        s.uid AS seat_uid,
        s.row,
        s.number,
        s.active AS seat_active,
        r.status AS reservation_status,
        r.expires_at,
        CASE
          WHEN s.active = FALSE THEN 'blocked'
          WHEN r.status = 'paid' THEN 'sold'
          WHEN r.status = 'reserved' AND r.expires_at > NOW() THEN 'reserved'
          ELSE 'free'
        END AS seat_status
      FROM seat s
      LEFT JOIN reservation r
        ON r.seat_uid = s.uid 
       AND r.showtime_uid = $1
      WHERE s.hall_uid = (
        SELECT hall_uid 
        FROM showtime 
        WHERE uid = $1
      )
      ORDER BY s.row, s.number;
      `,
      [showtime_uid]
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch seats:", err);
    res.status(500).json({ msg: "failed to fetch seats" });
  }
});

clientRouter.get("/showtimes/:showtime_uid", async (req, res) => {
  const { showtime_uid } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT 
        s.uid,
        s.movie_uid,
        s.hall_uid,
        s.starts_at,
        s.ends_at,
        s.adult_price,
        s.child_price,
        m.title AS movie_title,
        m.poster_url,
        m.duration_minutes,
        h.name AS hall_name,
        c.name AS cinema_name
      FROM showtime s
      JOIN movie  m ON s.movie_uid = m.uid
      JOIN hall   h ON s.hall_uid  = h.uid
      JOIN cinema c ON h.cinema_uid = c.uid
      WHERE s.uid = $1
      `,
      [showtime_uid]
    );

    if (rows.length === 0)
      return res.status(404).json({ msg: "showtime not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("Failed to fetch showtime:", err);
    res.status(500).json({ msg: "failed to fetch showtime" });
  }
});



export default clientRouter;
