import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, getDb } from './db/index.js';
import draftsRouter from './routes/drafts.js';
import topicsRouter from './routes/topics.js';
import scheduleRouter from './routes/schedule.js';
import settingsRouter from './routes/settings.js';
import educationRouter from './routes/education.js';
import newsRouter from './routes/news.js';
import personalRouter from './routes/personal.js';
import agentsRouter from './routes/agents.js';
import authRouter from './routes/auth.js';
import { startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : '*']
    : ['http://localhost:5173'];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

initDb();
startScheduler(getDb());

app.use('/auth', authRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/education', educationRouter);
app.use('/api/news', newsRouter);
app.use('/api/personal', personalRouter);
app.use('/api/agents', agentsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../client/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
