import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { authenticate, requireSuper } from './middleware/auth';
import { adminMoviesRouter } from './routes/admin_movies';
import paymentsRouter from './routes/payments';

const app = express();
app.use(express.json());

app.use('/payments', paymentsRouter);
app.use('/auth', authRouter);

app.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

app.use('/admin', adminRouter);
app.use('/admin/movies', adminMoviesRouter);

app.listen(3000, () => console.log('API is running on http://localhost:3000'));
