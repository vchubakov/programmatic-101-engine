import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/index.js';
import draftsRouter from './routes/drafts.js';
import topicsRouter from './routes/topics.js';
import scheduleRouter from './routes/schedule.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

initDb();

app.use('/api/drafts', draftsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
