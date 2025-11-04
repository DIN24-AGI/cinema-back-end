import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const { rows } = await pool.query(
    'SELECT uid, role, password_hash FROM administrator WHERE email = $1',
    [email]
  );
  if (rows.length === 0) return res.status(401).json({ msg: 'wrong creds' });

  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ msg: 'wrong creds' });

  const token = jwt.sign(
    { sub: admin.uid, role: admin.role },
    process.env.JWT_SECRET!,
    { expiresIn: '60m' }
  );

  res.json({ token });
});
