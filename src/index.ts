import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { adminMoviesRouter } from './routes/admin_movies';
import paymentsRouter from './routes/payments';
import webhookRouter from './routes/payments_webhook';
import { authenticate } from './middleware/auth';

const app = express();


app.post(
  '/payments/webhook',
  express.raw({ type: 'application/json' }),
  webhookRouter
);

app.use(express.json()); 

app.use('/payments', paymentsRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/admin/movies', adminMoviesRouter);

app.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

app.listen(3000, () => console.log('🚀 API is running on http://localhost:3000'));
