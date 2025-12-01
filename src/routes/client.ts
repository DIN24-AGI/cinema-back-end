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

// Get movies 
clientRouter.get("/movies", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM movie")
  res.json(rows);
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


export default clientRouter;
