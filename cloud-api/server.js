import crypto from 'node:crypto';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import express from 'express';

const app = express();
const firestore = new Firestore();

const PORT = Number(process.env.PORT ?? 8080);
const APP_PASSWORD = process.env.APP_PASSWORD ?? '';
const SESSION_SECRET = process.env.SESSION_SECRET ?? APP_PASSWORD;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const TOKEN_MAX_AGE_MS = Number(process.env.TOKEN_MAX_AGE_MS ?? 1000 * 60 * 60 * 24 * 30);
const FIRESTORE_COLLECTION = process.env.FIRESTORE_COLLECTION ?? 'count-to-814';
const FIRESTORE_DOCUMENT = process.env.FIRESTORE_DOCUMENT ?? 'app-state';

app.use(express.json({ limit: '15mb' }));
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  response.setHeader('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  next();
});

app.get('/healthz', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/session', (request, response) => {
  if (!APP_PASSWORD || !SESSION_SECRET) {
    response.status(500).json({ error: 'Server password is not configured.' });
    return;
  }

  if (request.body?.password !== APP_PASSWORD) {
    response.status(401).json({ error: 'Invalid password.' });
    return;
  }

  response.json({ token: createToken() });
});

app.get('/api/state', requireAuth, async (_request, response, next) => {
  try {
    const snapshot = await stateDocument().get();
    response.json({ data: snapshot.exists ? snapshot.data()?.data ?? null : null });
  } catch (error) {
    next(error);
  }
});

app.put('/api/state', requireAuth, async (request, response, next) => {
  try {
    const data = normalizeStatePayload(request.body?.data);
    await stateDocument().set(
      {
        data,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(400).json({ error: error instanceof Error ? error.message : 'Bad request.' });
});

app.listen(PORT, () => {
  console.log(`count-to-814 cloud API listening on ${PORT}`);
});

function stateDocument() {
  return firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOCUMENT);
}

function requireAuth(request, response, next) {
  const header = request.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!verifyToken(token)) {
    response.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  next();
}

function createToken() {
  const payload = base64UrlEncode(JSON.stringify({ iat: Date.now() }));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature !== sign(payload)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded.iat === 'number' && Date.now() - decoded.iat <= TOKEN_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function normalizeStatePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('State payload must be an object.');
  }

  if (!data.localStorage || typeof data.localStorage !== 'object' || Array.isArray(data.localStorage)) {
    throw new Error('State payload is missing localStorage.');
  }

  const localStorage = Object.fromEntries(
    Object.entries(data.localStorage)
      .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
      .map(([key, value]) => [key, value])
  );

  const photos = Array.isArray(data.photos)
    ? data.photos.filter(
        (photo) =>
          photo &&
          typeof photo.id === 'string' &&
          typeof photo.name === 'string' &&
          typeof photo.dataUrl === 'string'
      )
    : [];

  return {
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 2,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    localStorage,
    photos
  };
}
