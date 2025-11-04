import { Router } from 'express';
import { pool } from '../db';
import { authenticate, requireSuper } from '../middleware/auth';

export const adminRouter = Router();

// ----------------------
// DASHBOARD
// ----------------------
adminRouter.get('/dashboard', authenticate, requireSuper, (req, res) => {
  res.json({
    data: "super admin dashboard, welcome! Hello from Igor, remember to drink enough water 🍷",
  });
});

// ----------------------
// CITIES
// ----------------------
adminRouter.get('/cities', authenticate, async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM city ORDER BY name');
  res.json(rows);
});

adminRouter.post('/cities', authenticate, requireSuper, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ msg: 'missing name' });

  const { rows } = await pool.query(
    'INSERT INTO city (uid, name) VALUES (gen_random_uuid(), $1) RETURNING *',
    [name]
  );
  res.status(201).json(rows[0]);
});

// ----------------------
// CINEMAS
// ----------------------
adminRouter.get('/cinemas/:city_uid', authenticate, async (req, res) => {
  const { city_uid } = req.params;
  const { rows } = await pool.query(
    'SELECT * FROM cinema WHERE city_uid = $1 ORDER BY name',
    [city_uid]
  );
  res.json(rows);
});

adminRouter.post('/cinemas', authenticate, requireSuper, async (req, res) => {
  const { city_uid, name, address } = req.body;
  if (!city_uid || !name)
    return res.status(400).json({ msg: 'missing fields' });

  const { rows } = await pool.query(
    `INSERT INTO cinema (uid, city_uid, name, address)
     VALUES (gen_random_uuid(), $1, $2, $3)
     RETURNING *`,
    [city_uid, name, address || null]
  );
  res.status(201).json(rows[0]);
});

// ----------------------
// HALLS
// ----------------------
adminRouter.get('/halls/:cinema_uid', authenticate, async (req, res) => {
  const { cinema_uid } = req.params;
  const { rows } = await pool.query(
    'SELECT * FROM hall WHERE cinema_uid = $1 ORDER BY name',
    [cinema_uid]
  );
  res.json(rows);
});

adminRouter.post('/halls', authenticate, requireSuper, async (req, res) => {
  const { cinema_uid, name, rows, cols } = req.body;
  if (!cinema_uid || !name || !rows || !cols)
    return res.status(400).json({ msg: 'missing fields' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create hall
    const { rows: inserted } = await client.query(
      `INSERT INTO hall (uid, cinema_uid, name, rows, cols)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [cinema_uid, name, rows, cols]
    );
    const hall = inserted[0];

    // Create seats
    const seatValues: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        seatValues.push(
          `(${[
            `gen_random_uuid()`,
            `$${paramIndex++}`,
            `$${paramIndex++}`,
            `$${paramIndex++}`,
          ].join(', ')})`
        );
        params.push(hall.uid, r, c);
      }
    }

    const insertSeatsSQL = `
      INSERT INTO seat (uid, hall_uid, row, number)
      VALUES ${seatValues.join(', ')};
    `;

    await client.query(insertSeatsSQL, params);

    await client.query('COMMIT');
    res.status(201).json({ ...hall, seats_created: rows * cols });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ msg: 'failed to create hall with seats' });
  } finally {
    client.release();
  }
});

