import { Router } from 'express';
import { pool } from '../db';
import { authenticate, requireSuper } from '../middleware/auth';

export const adminMoviesRouter = Router();

// 🎬 POST /admin/movies — create movie
adminMoviesRouter.post('/', authenticate, requireSuper, async (req, res) => {
  const { title, duration_minutes, description, poster_url, release_year, shows_allowed, shows_left } = req.body;

  if (!title || !duration_minutes)
    return res.status(400).json({ msg: 'missing required fields' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO movie (uid, title, duration_minutes, description, poster_url, release_year, shows_allowed, shows_left)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, duration_minutes, description, poster_url, release_year, shows_allowed, shows_left]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to create movie' });
  }
});


// 🎥 GET /admin/movies — list with optional filters
adminMoviesRouter.get('/', authenticate, requireSuper, async (req, res) => {
  const { search = '', page = 1, limit = 20, active } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM movie
       WHERE ($1 = '' OR title ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR active = $2::boolean)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [search, active ?? null, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to list movies' });
  }
});


// 🎞 GET /admin/movies/:uid — get one
adminMoviesRouter.get('/:uid', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;

  try {
    const { rows } = await pool.query('SELECT * FROM movie WHERE uid = $1', [uid]);
    if (rows.length === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to get movie' });
  }
});


// ✏️ PUT /admin/movies/:uid — full update
adminMoviesRouter.put('/:uid', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;
  const { title, duration_minutes, description, poster_url, release_year, shows_allowed, shows_left } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE movie SET
        title=$1, duration_minutes=$2, description=$3, poster_url=$4,
        release_year=$5, shows_allowed=$6, shows_left=$7, updated_at=NOW()
       WHERE uid=$8 RETURNING *`,
      [title, duration_minutes, description, poster_url, release_year, shows_allowed, shows_left, uid]
    );

    if (rows.length === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to update movie' });
  }
});


// 🩹 PATCH /admin/movies/:uid — partial update
adminMoviesRouter.patch('/:uid', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;
  const fields = Object.keys(req.body);
  if (!fields.length)
    return res.status(400).json({ msg: 'no fields provided' });

  const updates = fields.map((key, i) => `${key}=$${i + 1}`).join(', ');
  const values = [...Object.values(req.body), uid];

  try {
    const { rows } = await pool.query(
      `UPDATE movie SET ${updates}, updated_at=NOW() WHERE uid=$${fields.length + 1} RETURNING *`,
      values
    );

    if (rows.length === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to patch movie' });
  }
});


// 🗑 DELETE /admin/movies/:uid — soft delete
adminMoviesRouter.delete('/:uid', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;

  try {
    const { rowCount } = await pool.query(
      'UPDATE movie SET active=false, deleted_at=NOW(), updated_at=NOW() WHERE uid=$1',
      [uid]
    );

    if (rowCount === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json({ msg: 'movie soft-deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to delete movie' });
  }
});


// 🔁 POST /admin/movies/:uid/restore — restore
adminMoviesRouter.post('/:uid/restore', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;

  try {
    const { rowCount } = await pool.query(
      'UPDATE movie SET active=true, deleted_at=NULL, updated_at=NOW() WHERE uid=$1',
      [uid]
    );

    if (rowCount === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json({ msg: 'movie restored' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to restore movie' });
  }
});


// 📸 POST /admin/movies/:uid/poster — upload via URL
adminMoviesRouter.post('/:uid/poster', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;
  const { poster_url } = req.body;

  if (!poster_url)
    return res.status(400).json({ msg: 'poster_url is required' });

  try {
    const { rowCount } = await pool.query(
      'UPDATE movie SET poster_url=$1, updated_at=NOW() WHERE uid=$2',
      [poster_url, uid]
    );

    if (rowCount === 0)
      return res.status(404).json({ msg: 'movie not found' });

    res.json({ msg: 'poster updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to update poster' });
  }
});
// HARD DELETE 
adminMoviesRouter.delete('/:uid/hard', authenticate, requireSuper, async (req, res) => {
  const { uid } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM movie WHERE uid=$1', [uid]);
    if (rowCount === 0)
      return res.status(404).json({ msg: 'movie not found' });
    res.json({ msg: 'movie hard-deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to hard-delete movie' });
  }
});

