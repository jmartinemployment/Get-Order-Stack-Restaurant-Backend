import express from 'express';
import cors from 'cors';
import { config } from './app.config';
import menuRoutes from './app.routes';

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/restaurant', menuRoutes);

export default app;
