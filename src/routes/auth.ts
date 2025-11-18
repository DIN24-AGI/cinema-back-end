import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { authenticate, AuthReq } from '../middleware/auth';

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

authRouter.put('/change-password', authenticate, async (req: AuthReq, res) => {
  const { old_password, new_password } = req.body;

  if (!old_password || !new_password) {
    return res.status(400).json({ msg: 'missing fields' });
  }

  try {

    const adminUid = req.user!.sub;

    const { rows } = await pool.query(
      'SELECT uid, password_hash FROM administrator WHERE uid = $1',
      [adminUid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ msg: 'admin not found' });
    }

    const admin = rows[0];


    const match = await bcrypt.compare(old_password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ msg: 'wrong old password' });
    }

    const hashed = await bcrypt.hash(new_password, 10);

    await pool.query(
      `UPDATE administrator
       SET password_hash = $1, updated_at = NOW()
       WHERE uid = $2`,
      [hashed, adminUid]
    );

    res.json({ msg: 'password updated' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'failed to change password' });
  }
});

