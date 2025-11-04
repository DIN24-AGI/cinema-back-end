// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtUser } from '../types/jwt';

export interface AuthReq extends Request {
  user?: JwtUser;
}

export const authenticate = (req: AuthReq, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as JwtUser;
    next();
  } catch {
    res.sendStatus(401);
  }
};

export const requireSuper = (req: AuthReq, res: Response, next: NextFunction) =>
  req.user?.role === 'super' ? next() : res.sendStatus(403);
