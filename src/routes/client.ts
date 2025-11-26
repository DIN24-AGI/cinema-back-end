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

// Get movies for a cinema
clientRouter.get("/movies", async (req, res) => {
  const { cinemaId, date } = req.query;
  // join movie -> showing -> hall -> cinema
  const { rows } = await pool.query(
    `SELECT m.*, s.start_time, h.name AS hall_name, c.name AS cinema_name
     FROM movie m
     JOIN showing s ON s.movie_id = m.id
     JOIN hall h ON h.uid = s.hall_uid
     JOIN cinema c ON c.uid = h.cinema_uid
     WHERE h.cinema_uid = $1
     AND ($2::date IS NULL OR s.start_time::date = $2::date)`,
    [cinemaId, date || null]
  );
  res.json(rows);
});

export default clientRouter;
