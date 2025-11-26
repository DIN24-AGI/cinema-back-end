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


export default clientRouter;
