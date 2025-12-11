import { Router } from "express";
import { pool } from "../db";
import { authenticate, requireSuper } from "../middleware/auth";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export const adminRouter = Router();

// ----------------------
// DASHBOARD
// ----------------------
adminRouter.get("/dashboard", authenticate, requireSuper, (req, res) => {
	res.json({
		data: "super admin dashboard, welcome! Hello from Igor, remember to drink enough water 🍷",
	});
});

// ----------------------
// CITIES
// ----------------------
adminRouter.get("/cities", authenticate, async (_, res) => {
	const { rows } = await pool.query("SELECT * FROM city ORDER BY name");
	res.json(rows);
});

adminRouter.post("/cities", authenticate, requireSuper, async (req, res) => {
	const { name } = req.body;
	if (!name) return res.status(400).json({ msg: "missing name" });

	const { rows } = await pool.query("INSERT INTO city (uid, name) VALUES (gen_random_uuid(), $1) RETURNING *", [name]);
	res.status(201).json(rows[0]);
});

adminRouter.get("/cities/:city_uid", authenticate, async (req, res) => {
	const { city_uid } = req.params;
	const { rows } = await pool.query("SELECT * FROM city WHERE uid = $1", [city_uid]);
	if (rows.length === 0) return res.status(404).json({ msg: "city not found" });
	res.json(rows[0]);
});

adminRouter.delete("/cities/:city_uid", authenticate, requireSuper, async (req, res) => {
	const { city_uid } = req.params;
	await pool.query("DELETE FROM city WHERE uid = $1", [city_uid]);
	res.json({ msg: "city deleted" });
});

// ----------------------
// CINEMAS
// ----------------------
adminRouter.get("/cinemas/by-city/:city_uid", authenticate, async (req, res) => {
	const { city_uid } = req.params;
	const { rows } = await pool.query("SELECT * FROM cinema WHERE city_uid = $1 ORDER BY name", [city_uid]);
	res.json(rows);
});

adminRouter.post("/cinemas", authenticate, requireSuper, async (req, res) => {
	const { city_uid, name, address, phone } = req.body;

	console.log("Request body:", req.body);
	console.log("Extracted values:", { city_uid, name, address, phone });

	if (!city_uid || !name) return res.status(400).json({ msg: "missing fields" });

	const { rows } = await pool.query(
		`INSERT INTO cinema (uid, city_uid, name, address, phone)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)
     RETURNING *`,
		[city_uid, name, address || null, phone || null]
	);

	res.status(201).json(rows[0]);
});

adminRouter.get("/cinemas", authenticate, async (_, res) => {
	const { rows } = await pool.query("SELECT * FROM cinema ORDER BY name");
	res.json(rows);
});

adminRouter.get("/cinemas/:cinema_uid", authenticate, async (req, res) => {
	const { cinema_uid } = req.params;
	const { rows } = await pool.query("SELECT * FROM cinema WHERE uid = $1", [cinema_uid]);
	if (rows.length === 0) return res.status(404).json({ msg: "cinema not found" });
	res.json(rows[0]);
});

adminRouter.put("/cinemas/:cinema_uid", authenticate, requireSuper, async (req, res) => {
	const { cinema_uid } = req.params;
	const { name, address, phone, active } = req.body;

	const fields: string[] = [];
	const values: any[] = [];
	let i = 1;

	if (name) {
		fields.push(`name = $${i++}`);
		values.push(name);
	}
	if (address) {
		fields.push(`address = $${i++}`);
		values.push(address);
	}
	if (phone) {
		fields.push(`phone = $${i++}`);
		values.push(phone);
	}
	if (typeof active === "boolean") {
		fields.push(`active = $${i++}`);
		values.push(active);
	}

	if (fields.length === 0) return res.status(400).json({ msg: "no fields to update" });

	values.push(cinema_uid);

	const { rows } = await pool.query(`UPDATE cinema SET ${fields.join(", ")} WHERE uid = $${i} RETURNING *`, values);

	if (rows.length === 0) return res.status(404).json({ msg: "cinema not found" });
	res.json(rows[0]);
});

adminRouter.delete("/cinemas/:cinema_uid", authenticate, requireSuper, async (req, res) => {
	const { cinema_uid } = req.params;
	await pool.query("DELETE FROM cinema WHERE uid = $1", [cinema_uid]);
	res.json({ msg: "cinema deleted" });
});

adminRouter.patch("/cinemas/:cinema_uid/activate", authenticate, requireSuper, async (req, res) => {
	const { cinema_uid } = req.params;
	const { active } = req.body;
	if (typeof active !== "boolean") return res.status(400).json({ msg: "active must be boolean" });

	const { rows } = await pool.query("UPDATE cinema SET active = $1 WHERE uid = $2 RETURNING *", [active, cinema_uid]);
	if (rows.length === 0) return res.status(404).json({ msg: "cinema not found" });
	res.json(rows[0]);
});

// ----------------------
// HALLS
// ----------------------
adminRouter.get("/halls/:cinema_uid", authenticate, async (req, res) => {
	const { cinema_uid } = req.params;
	const { rows } = await pool.query("SELECT * FROM hall WHERE cinema_uid = $1 ORDER BY name", [cinema_uid]);
	res.json(rows);
});

adminRouter.post("/halls", authenticate, requireSuper, async (req, res) => {
	const { cinema_uid, name, rows, cols, active } = req.body;
	if (!cinema_uid || !name || !rows || !cols || active === null) return res.status(400).json({ msg: "missing fields" });

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		// Create hall
		const { rows: inserted } = await client.query(
			`INSERT INTO hall (uid, cinema_uid, name, rows, cols, active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING *`,
			[cinema_uid, name, rows, cols, active]
		);
		const hall = inserted[0];

		// Create seats
		const seatValues: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		for (let r = 1; r <= rows; r++) {
			for (let c = 1; c <= cols; c++) {
				seatValues.push(
					`(${[`gen_random_uuid()`, `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`].join(", ")})`
				);
				params.push(hall.uid, r, c);
			}
		}

		const insertSeatsSQL = `
      INSERT INTO seat (uid, hall_uid, row, number)
      VALUES ${seatValues.join(", ")};
    `;

		await client.query(insertSeatsSQL, params);

		await client.query("COMMIT");
		res.status(201).json({ ...hall, seats_created: rows * cols });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(err);
		res.status(500).json({ msg: "failed to create hall with seats" });
	} finally {
		client.release();
	}
});

// ----------------------
// ACTIVATE / DEACTIVATE HALL
// ----------------------
adminRouter.patch("/halls/:hall_uid/activate", authenticate, requireSuper, async (req, res) => {
	const { hall_uid } = req.params;
	const { active } = req.body;

	if (typeof active !== "boolean") return res.status(400).json({ msg: "active must be boolean" });

	try {
		const { rows } = await pool.query("UPDATE hall SET active = $1, updated_at = NOW() WHERE uid = $2 RETURNING *", [
			active,
			hall_uid,
		]);

		if (rows.length === 0) return res.status(404).json({ msg: "hall not found" });

		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to update hall active state" });
	}
});

// ----------------------
// GET SINGLE HALL
// ----------------------
adminRouter.get("/hall/:hall_uid", authenticate, async (req, res) => {
	const { hall_uid } = req.params;

	try {
		const { rows } = await pool.query("SELECT * FROM hall WHERE uid = $1", [hall_uid]);
		if (rows.length === 0) return res.status(404).json({ msg: "hall not found" });
		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to fetch hall" });
	}
});

// ----------------------
// UPDATE HALL
// ----------------------
adminRouter.put("/halls/:hall_uid", authenticate, requireSuper, async (req, res) => {
	const { hall_uid } = req.params;
	const { name, rows, cols, active } = req.body;

	const fields: string[] = [];
	const values: any[] = [];
	let i = 1;

	if (name) {
		fields.push(`name = $${i++}`);
		values.push(name);
	}
	if (rows) {
		fields.push(`rows = $${i++}`);
		values.push(rows);
	}
	if (cols) {
		fields.push(`cols = $${i++}`);
		values.push(cols);
	}
	if (typeof active === "boolean") {
		fields.push(`active = $${i++}`);
		values.push(active);
	}

	if (fields.length === 0) return res.status(400).json({ msg: "no fields to update" });

	values.push(hall_uid);

	try {
		const { rows: updated } = await pool.query(
			`UPDATE hall SET ${fields.join(", ")}, updated_at = NOW()
       WHERE uid = $${i} RETURNING *`,
			values
		);

		if (updated.length === 0) return res.status(404).json({ msg: "hall not found" });

		res.json(updated[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to update hall" });
	}
});

// DELETE and RECREATE seats for a hall
adminRouter.post("/halls/:hall_uid/recreate-seats", authenticate, requireSuper, async (req, res) => {
	const { hall_uid } = req.params;

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		// Get hall details
		const { rows: hallRows } = await client.query("SELECT * FROM hall WHERE uid = $1", [hall_uid]);
		if (hallRows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(404).json({ msg: "hall not found" });
		}

		const hall = hallRows[0];
		const { rows: numRows, cols: numCols } = hall;

		// Delete existing seats
		await client.query("DELETE FROM seat WHERE hall_uid = $1", [hall_uid]);

		// Create new seats
		const seatValues: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		for (let r = 1; r <= numRows; r++) {
			for (let c = 1; c <= numCols; c++) {
				seatValues.push(
					`(${[`gen_random_uuid()`, `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`].join(", ")})`
				);
				params.push(hall_uid, r, c);
			}
		}

		const insertSeatsSQL = `
      INSERT INTO seat (uid, hall_uid, row, number)
      VALUES ${seatValues.join(", ")};
    `;

		await client.query(insertSeatsSQL, params);

		await client.query("COMMIT");
		res.json({
			msg: "seats recreated successfully",
			seats_created: numRows * numCols,
			hall_uid: hall_uid,
		});
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(err);
		res.status(500).json({ msg: "failed to recreate seats" });
	} finally {
		client.release();
	}
});

// ----------------------
// DELETE HALL
// ----------------------
adminRouter.delete("/halls/:hall_uid", authenticate, requireSuper, async (req, res) => {
	const { hall_uid } = req.params;

	try {
		const { rowCount } = await pool.query("DELETE FROM hall WHERE uid = $1", [hall_uid]);
		if (rowCount === 0) return res.status(404).json({ msg: "hall not found" });

		res.json({ msg: "hall deleted" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to delete hall" });
	}
});

// =========================
// GET SEATS BY HALL
// =========================
adminRouter.get("/hall/:hall_uid/seats", authenticate, async (req, res) => {
	const { hall_uid } = req.params;

	try {
		const { rows } = await pool.query(
			`SELECT uid, row, number, active
       FROM seat
       WHERE hall_uid = $1
       ORDER BY row, number`,
			[hall_uid]
		);

		if (rows.length === 0) return res.status(404).json({ msg: "no seats found or hall not found" });

		res.json(rows);
	} catch (err) {
		console.error("Failed to fetch seats:", err);
		res.status(500).json({ msg: "failed to fetch seats" });
	}
});

////Showtime needed to create
/// can not check reservations payments etc before we have showtime
adminRouter.post("/showtimes", authenticate, requireSuper, async (req, res) => {
	const { movie_uid, hall_uid, starts_at, ends_at, adult_price, child_price } = req.body;
	if (!movie_uid || !hall_uid || !starts_at || !ends_at) {
		return res.status(400).json({ msg: "missing fields" });
	}

	// Validate prices if provided
	const ap = adult_price !== undefined ? Number(adult_price) : null;
	const cp = child_price !== undefined ? Number(child_price) : null;
	if ((ap !== null && (Number.isNaN(ap) || ap < 0)) || (cp !== null && (Number.isNaN(cp) || cp < 0))) {
		return res.status(400).json({ msg: "invalid price values" });
	}

	try {
		const { rows } = await pool.query(
			`INSERT INTO showtime (uid, movie_uid, hall_uid, starts_at, ends_at, adult_price, child_price)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
			[movie_uid, hall_uid, starts_at, ends_at, ap, cp]
		);
		res.status(201).json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to create showtime" });
	}
});

// ----------------------
// SHOWTIMES
// ----------------------

// GET showtimes by date
adminRouter.get("/showtimes", authenticate, async (req, res) => {
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

// GET single showtime
adminRouter.get("/showtimes/:showtime_uid", authenticate, async (req, res) => {
	const { showtime_uid } = req.params;

	try {
		const { rows } = await pool.query(
			`SELECT s.*, 
              m.title as movie_title, 
              h.name as hall_name,
              c.name as cinema_name
       FROM showtime s
       JOIN movie m ON s.movie_uid = m.uid
       JOIN hall h ON s.hall_uid = h.uid
       JOIN cinema c ON h.cinema_uid = c.uid
       WHERE s.uid = $1`,
			[showtime_uid]
		);

		if (rows.length === 0) return res.status(404).json({ msg: "showtime not found" });

		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to fetch showtime" });
	}
});

// PATCH (update) showtime
adminRouter.patch("/showtimes/:showtime_uid", authenticate, requireSuper, async (req, res) => {
	const { showtime_uid } = req.params;
	const { movie_uid, hall_uid, starts_at, ends_at } = req.body;

	const fields: string[] = [];
	const values: any[] = [];
	let i = 1;

	if (movie_uid) {
		fields.push(`movie_uid = $${i++}`);
		values.push(movie_uid);
	}
	if (hall_uid) {
		fields.push(`hall_uid = $${i++}`);
		values.push(hall_uid);
	}
	if (starts_at) {
		fields.push(`starts_at = $${i++}`);
		values.push(starts_at);
	}
	if (ends_at) {
		fields.push(`ends_at = $${i++}`);
		values.push(ends_at);
	}

	if (fields.length === 0) return res.status(400).json({ msg: "no fields to update" });

	values.push(showtime_uid);

	try {
		const { rows } = await pool.query(
			`UPDATE showtime 
         SET ${fields.join(", ")}, updated_at = NOW()
         WHERE uid = $${i}
         RETURNING *`,
			values
		);

		if (rows.length === 0) return res.status(404).json({ msg: "showtime not found" });

		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to update showtime" });
	}
});

// DELETE showtime
adminRouter.delete("/showtimes/:showtime_uid", authenticate, requireSuper, async (req, res) => {
	const { showtime_uid } = req.params;

	try {
		const { rowCount } = await pool.query("DELETE FROM showtime WHERE uid = $1", [showtime_uid]);

		if (rowCount === 0) return res.status(404).json({ msg: "showtime not found" });

		res.json({ msg: "showtime deleted" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to delete showtime" });
	}
});

adminRouter.patch("/showtimes/:showtime_uid/price", authenticate, requireSuper, async (req, res) => {
	const { showtime_uid } = req.params;
	const { adult_price, child_price } = req.body;

	// If empty body
	if (adult_price === undefined && child_price === undefined) {
		return res.status(400).json({ msg: "no fields to update" });
	}

	try {
		const fields = [];
		const values = [];
		let i = 1;

		if (adult_price !== undefined) {
			fields.push(`adult_price = $${i++}`);
			values.push(adult_price);
		}

		if (child_price !== undefined) {
			fields.push(`child_price = $${i++}`);
			values.push(child_price);
		}

		values.push(showtime_uid);

		const sql = `
        UPDATE showtime
        SET ${fields.join(", ")},
            updated_at = NOW()
        WHERE uid = $${i}
        RETURNING *;
      `;

		const { rows } = await pool.query(sql, values);

		if (rows.length === 0) {
			return res.status(404).json({ msg: "showtime not found" });
		}

		res.json({
			msg: "showtime updated",
			showtime: rows[0],
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to update showtime prices" });
	}
});

// add new admin
adminRouter.post("/users", authenticate, requireSuper, async (req, res) => {
	try {
		const { email, password, role } = req.body;

		if (!email || !password) return res.status(400).json({ msg: "Email & password required" });

		const password_hash = await bcrypt.hash(password, 10);
		const uid = uuidv4();
		const params = [uid, email, password_hash, role === "super" ? "super" : "regular"];
		const { rows } = await pool.query(
			"INSERT INTO administrator (uid, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *",
			params
		);
		res.status(201).json({
			msg: "Administrator created successfully",
			admin: rows[0],
		});
	} catch (err: any) {
		console.error("Failed to create admin:", err);
		res.status(500).json({ msg: "Failed to create admin" });
	}
});

//get users
adminRouter.get("/users", authenticate, requireSuper, async (req, res) => {
	const { rows } = await pool.query("SELECT * from administrator");
	res.json(rows);
});

//update user's role
adminRouter.put("/users/:uid", authenticate, requireSuper, async (req, res) => {
	try {
		const { uid } = req.params;
		const { role } = req.body;

		if (!role || !["super", "regular"].includes(role)) {
			return res.status(400).json({ msg: "Invalid role value" });
		}

		const query = `
      UPDATE administrator
      SET role = $1
      WHERE uid = $2
      RETURNING uid, email, role
    `;

		const { rows } = await pool.query(query, [role, uid]);

		if (rows.length === 0) {
			return res.status(404).json({ msg: "User not found" });
		}

		res.json({
			msg: "Role updated successfully",
			user: rows[0],
		});
	} catch (err) {
		console.error("Failed to update user:", err);
		res.status(500).json({ msg: "Failed to update user" });
	}
});

//delete user
adminRouter.delete("/users/:uid", authenticate, requireSuper, async (req, res) => {
	try {
		const { uid } = req.params;

		const query = `
      DELETE FROM administrator
      WHERE uid = $1
      RETURNING uid
    `;

		const { rows } = await pool.query(query, [uid]);

		if (rows.length === 0) {
			return res.status(404).json({ msg: "User not found" });
		}

		res.json({ msg: "User deleted successfully" });
	} catch (err) {
		console.error("Failed to delete user:", err);
		res.status(500).json({ msg: "Failed to delete user" });
	}
});

// ----------------------
// UPDATE SEAT ACTIVE STATUS
// ----------------------
adminRouter.patch("/seats/:seat_uid/activate", authenticate, requireSuper, async (req, res) => {
	const { seat_uid } = req.params;
	const { active } = req.body;

	if (typeof active !== "boolean") {
		return res.status(400).json({ msg: "active must be boolean" });
	}

	try {
		const { rows } = await pool.query("UPDATE seat SET active = $1 WHERE uid = $2 RETURNING *", [active, seat_uid]);

		if (rows.length === 0) {
			return res.status(404).json({ msg: "seat not found" });
		}

		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "failed to update seat active status" });
	}
});
