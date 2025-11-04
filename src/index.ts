import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { authRouter } from './routes/auth';
import { authenticate, requireSuper } from './middleware/auth';

const app = express();
app.use(express.json());

app.use('/auth', authRouter);

app.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

app.post('/cinemas', authenticate, requireSuper, (req, res) => {

  res.json({ msg: 'cinema created (stub)' });
});

app.listen(3000, () => console.log(' API is running on http://localhost:3000'));
