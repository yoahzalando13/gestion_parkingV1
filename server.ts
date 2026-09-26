import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { webRouter } from './src-node/routes/web.js';
import { apiRouter } from './src-node/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: 'parking-secret-key-12345',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  })
);

// Mount API routes
app.use('/api', apiRouter);

// Mount Web routes
app.use('/', webRouter);

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint API introuvable', path: req.path });
  }
  res.status(404).render('error', {
    status: 404,
    message: 'Page introuvable',
    details: `L'URL demandée (${req.originalUrl}) n'existe pas.`
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
  }
  res.status(500).render('error', {
    status: 500,
    message: 'Erreur interne du serveur',
    details: err.message || String(err)
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Système de gestion de parking démarré sur http://${HOST}:${PORT}`);
});
