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
  const { rows } = await pool.query(
    "SELECT * FROM cinema",
  );
  res.json(rows);
});

// Get movies with optional filtering for cinema and date
// GET /movies?cinema_uid=...&date=YYYY-MM-DD
clientRouter.get("/movies", async (req, res) => {
  try {
    const { cinema_uid, date } = req.query;

    const params: any[] = [];
    const whereClauses: string[] = ["m.active = true"]; 

    if (cinema_uid && typeof cinema_uid === "string") {
      params.push(cinema_uid);
      whereClauses.push(`c.uid = $${params.length}`);
    }

    if (date && typeof date === "string") {
      params.push(date);
      whereClauses.push(`DATE(s.starts_at) = $${params.length}`);
    }

    const query = `
      SELECT 
        m.*,
        json_agg(
          json_build_object(
            'uid', s.uid,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'hall_name', h.name,
            'cinema_name', c.name
          ) ORDER BY s.starts_at
        ) FILTER (WHERE s.uid IS NOT NULL) AS showtimes
      FROM movie m
      LEFT JOIN showtime s ON s.movie_uid = m.uid
      LEFT JOIN hall h ON h.uid = s.hall_uid
      LEFT JOIN cinema c ON c.uid = h.cinema_uid
      ${whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : ""}
      GROUP BY m.uid
      ORDER BY m.title
    `;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch movies:", err);
    res.status(500).json({ msg: "Failed to fetch movies" });
  }
});



//Get movie by ID
clientRouter.get("/movies/:movie_uid", async (req, res) => {
  const { movie_uid } = req.params 
  const { rows } = await pool.query(
    "SELECT * FROM movie WHERE uid = $1", [ movie_uid, 
    
    ])
  if (rows.length === 0) return res.status(404).json( {msg: "Movie not found"})
  res.json(rows[0]);
});

// GET showtime with cinema and date
clientRouter.get("/showtimes", async (req, res) => {
  const { cinema_uid, date } = req.query;

  if (!cinema_uid) return res.status(400).json({ msg: "cinema_uid is required" });
  if (!date) return res.status(400).json({ msg: "date is required" });

  try {
    const query = `
      SELECT 
        s.uid,
        s.movie_uid,
        s.hall_uid,
        s.starts_at,
        s.ends_at,
        m.title AS movie_title,
        m.poster_url,
        h.name AS hall_name,
        c.name AS cinema_name
      FROM showtime s
      JOIN movie m ON s.movie_uid = m.uid
      JOIN hall h ON s.hall_uid = h.uid
      JOIN cinema c ON h.cinema_uid = c.uid
      WHERE c.uid = $1
        AND DATE(s.starts_at) = $2
      ORDER BY s.starts_at
    `;

    const params = [cinema_uid, date];
    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch showtimes:", err);
    res.status(500).json({ msg: "Failed to fetch showtimes" });
  }
});

//GET showitime by UID
clientRouter.get("/client/showtimes/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    const showtime = await pool.query(
      `SELECT s.*, m.title, m.poster_url, h.name AS hall_name
       FROM showtime s
       JOIN movie m ON s.movie_uid = m.uid
       JOIN hall h ON s.hall_uid = h.uid
       WHERE s.uid = $1`,
      [uid]
    );

    if (showtime.rows.length === 0) {
      return res.status(404).json({ message: "Showtime not found" });
    }

    res.json(showtime.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Fail to fetch"})
  }
});

// GET seats for a showtime
clientRouter.get("/client/seats", async (req, res) => {
  const { showtime_uid } = req.query;

  if (!showtime_uid) {
    return res.status(400).json({ error: "Missing showtime_uid" });
  }

  try {
    // 1. Get hall_uid for the showtime
    const showtimeRes = await pool.query(
      "SELECT hall_uid FROM showtime WHERE uid = $1",
      [showtime_uid]
    );

    if (showtimeRes.rows.length === 0) {
      return res.status(404).json({ error: "Showtime not found" });
    }

    const hall_uid = showtimeRes.rows[0].hall_uid;

    // 2. Get all seats for that hall
    const seatsRes = await pool.query(
      `
      SELECT 
        s.uid AS seat_uid,
        s.row,
        s.number,
        COALESCE(r.status, 'free') AS seat_status
      FROM seat s
      LEFT JOIN reservation r
        ON r.seat_uid = s.uid
        AND r.showtime_uid = $1
      WHERE s.hall_uid = $2
      ORDER BY s.row, s.number
      `,
      [showtime_uid, hall_uid]
    );

    res.json(seatsRes.rows);
  } catch (err) {
    console.error("Failed to fetch seats:", err);
    res.status(500).json({ error: "Failed to load seats" });
  }
});



export default clientRouter;
