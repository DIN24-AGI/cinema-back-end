import { Router } from 'express';
import { authenticate, requireSuper } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.get('/dashboard', authenticate, requireSuper, (req, res) => {
  
  res.json({ data: "super admin dashboard, welcome! Hello from Igor, remember to drink enough water" });
});
