import crypto from 'node:crypto';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import express from 'express';
import { mergeTodayFeaturePayload } from './todaySync.js';

const app = express();
const firestore = new Firestore();

const PORT = Number(process.env.PORT ?? 8080);
const APP_PASSWORD = process.env.APP_PASSWORD ?? '';
const SESSION_SECRET = process.env.SESSION_SECRET ?? APP_PASSWORD;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const TOKEN_MAX_AGE_MS = Number(process.env.TOKEN_MAX_AGE_MS ?? 1000 * 60 * 60 * 24 * 30);
const FIRESTORE_COLLECTION = process.env.FIRESTORE_COLLECTION ?? 'count-to-814';
const FIRESTORE_DOCUMENT = process.env.FIRESTORE_DOCUMENT ?? 'app-state';
const JOURNEY_TABLE_KINDS = {
  meta: 'journey-meta',
  trip: 'journey-trip',
  day: 'journey-day',
  entry: 'journey-entry'
};
const FEATURE_ROUTES = [
  ['settings', '/api/settings'],
  ['today', '/api/today'],
  ['prepare', '/api/prepare'],
  ['memories', '/api/memories'],
  ['wishes', '/api/wishes'],
  ['period', '/api/period'],
  ['journey', '/api/journey'],
  ['misc', '/api/misc']
];
const MEMORY_PHOTO_KIND = 'memory-photo';

app.use(express.json({ limit: '15mb' }));
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
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

for (const [feature, path] of FEATURE_ROUTES) {
  app.get(path, requireAuth, async (_request, response, next) => {
    try {
      const snapshot = await featureDocument(feature).get();
      response.json({ data: snapshot.exists ? snapshot.data()?.data ?? null : null });
    } catch (error) {
      next(error);
    }
  });

  app.put(path, requireAuth, async (request, response, next) => {
    try {
      const data = normalizeFeaturePayload(request.body?.data, feature);
      const document = featureDocument(feature);
      if (feature === 'today') {
        await firestore.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(document);
          const mergedData = mergeTodayFeaturePayload(snapshot.data()?.data, data);
          transaction.set(
            document,
            {
              data: mergedData,
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        });
      } else {
        await document.set(
          {
            data,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

app.get('/api/memory-photos', requireAuth, async (_request, response, next) => {
  try {
    const snapshot = await firestore
      .collection(FIRESTORE_COLLECTION)
      .where('kind', '==', MEMORY_PHOTO_KIND)
      .get();
    const photos = snapshot.docs
      .map((document) => document.data()?.photo)
      .filter(
        (photo) =>
          photo &&
          typeof photo.id === 'string' &&
          typeof photo.name === 'string' &&
          typeof photo.dataUrl === 'string'
      );
    response.json({ photos });
  } catch (error) {
    next(error);
  }
});

app.get('/api/memory-photo-ids', requireAuth, async (_request, response, next) => {
  try {
    const snapshot = await firestore
      .collection(FIRESTORE_COLLECTION)
      .where('kind', '==', MEMORY_PHOTO_KIND)
      .get();
    const ids = snapshot.docs
      .map((document) => document.data()?.photo?.id)
      .filter((id) => typeof id === 'string');
    response.json({ ids });
  } catch (error) {
    next(error);
  }
});

app.put('/api/memory-photos', requireAuth, async (request, response, next) => {
  try {
    const photos = normalizeMemoryPhotos(request.body?.photos);
    const collection = firestore.collection(FIRESTORE_COLLECTION);
    const existing = await collection.where('kind', '==', MEMORY_PHOTO_KIND).get();
    const nextIds = new Set(photos.map((photo) => photo.id));
    const batch = firestore.batch();

    existing.docs.forEach((document) => {
      if (!nextIds.has(document.data()?.photo?.id)) {
        batch.delete(document.ref);
      }
    });

    photos.forEach((photo) => {
      batch.set(
        collection.doc(`${FIRESTORE_DOCUMENT}-memory-photo-${safeDocumentId(photo.id)}`),
        {
          kind: MEMORY_PHOTO_KIND,
          photo,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    await batch.commit();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/memory-photos/:id', requireAuth, async (request, response, next) => {
  try {
    const photo = normalizeMemoryPhoto(request.body?.photo);
    if (photo.id !== request.params.id) {
      throw new Error('Memory photo id does not match request path.');
    }

    await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`${FIRESTORE_DOCUMENT}-memory-photo-${safeDocumentId(photo.id)}`)
      .set(
        {
          kind: MEMORY_PHOTO_KIND,
          photo,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/memory-photos/:id', requireAuth, async (request, response, next) => {
  try {
    await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`${FIRESTORE_DOCUMENT}-memory-photo-${safeDocumentId(request.params.id)}`)
      .delete();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/journey/tables', requireAuth, async (_request, response, next) => {
  try {
    const collection = firestore.collection(FIRESTORE_COLLECTION);
    const [metaSnapshot, tripSnapshot, daySnapshot, entrySnapshot] = await Promise.all([
      collection.doc(`${FIRESTORE_DOCUMENT}-journey-meta`).get(),
      collection.where('kind', '==', JOURNEY_TABLE_KINDS.trip).get(),
      collection.where('kind', '==', JOURNEY_TABLE_KINDS.day).get(),
      collection.where('kind', '==', JOURNEY_TABLE_KINDS.entry).get()
    ]);

    if (!metaSnapshot.exists && tripSnapshot.empty && daySnapshot.empty && entrySnapshot.empty) {
      response.json({ data: null });
      return;
    }

    const meta = metaSnapshot.data()?.meta ?? {};
    response.json({
      data: {
        schemaVersion: typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 1,
        exportedAt: typeof meta.exportedAt === 'string' ? meta.exportedAt : new Date().toISOString(),
        activeTripId: typeof meta.activeTripId === 'string' ? meta.activeTripId : '',
        journeyUpdatedAt: typeof meta.journeyUpdatedAt === 'number' ? meta.journeyUpdatedAt : 0,
        trips: tripSnapshot.docs.map((document) => document.data()?.trip).filter(Boolean),
        days: daySnapshot.docs.map((document) => document.data()?.day).filter(Boolean),
        entries: entrySnapshot.docs.map((document) => document.data()?.entry).filter(Boolean)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/journey/tables', requireAuth, async (request, response, next) => {
  try {
    const tables = normalizeJourneyTables(request.body?.data);
    const collection = firestore.collection(FIRESTORE_COLLECTION);
    const existing = await Promise.all(
      Object.values(JOURNEY_TABLE_KINDS).map((kind) => collection.where('kind', '==', kind).get())
    );
    const operations = [];

    existing.forEach((snapshot) => {
      snapshot.docs.forEach((document) => operations.push((batch) => batch.delete(document.ref)));
    });

    operations.push((batch) =>
      batch.set(
        collection.doc(`${FIRESTORE_DOCUMENT}-journey-meta`),
        {
          kind: JOURNEY_TABLE_KINDS.meta,
          meta: {
            schemaVersion: tables.schemaVersion,
            exportedAt: tables.exportedAt,
            activeTripId: tables.activeTripId,
            journeyUpdatedAt: tables.journeyUpdatedAt
          },
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      )
    );

    tables.trips.forEach((trip) => {
      operations.push((batch) =>
        batch.set(
          collection.doc(`${FIRESTORE_DOCUMENT}-journey-trip-${safeDocumentId(trip.id)}`),
          {
            kind: JOURNEY_TABLE_KINDS.trip,
            trip,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    tables.days.forEach((day) => {
      operations.push((batch) =>
        batch.set(
          collection.doc(`${FIRESTORE_DOCUMENT}-journey-day-${safeDocumentId(`${day.tripId}-${day.id}`)}`),
          {
            kind: JOURNEY_TABLE_KINDS.day,
            day,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    tables.entries.forEach((entry) => {
      operations.push((batch) =>
        batch.set(
          collection.doc(`${FIRESTORE_DOCUMENT}-journey-entry-${safeDocumentId(`${entry.tripId}-${entry.dayId}-${entry.id}`)}`),
          {
            kind: JOURNEY_TABLE_KINDS.entry,
            entry,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await commitFirestoreOperations(operations);
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

function featureDocument(feature) {
  return firestore.collection(FIRESTORE_COLLECTION).doc(`${FIRESTORE_DOCUMENT}-${feature}`);
}

async function commitFirestoreOperations(operations) {
  const chunkSize = 450;
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = firestore.batch();
    operations.slice(index, index + chunkSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
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

function normalizeFeaturePayload(data, feature) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${feature} payload must be an object.`);
  }

  if (!data.localStorage || typeof data.localStorage !== 'object' || Array.isArray(data.localStorage)) {
    throw new Error(`${feature} payload is missing localStorage.`);
  }

  const localStorage = Object.fromEntries(
    Object.entries(data.localStorage)
      .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
      .map(([key, value]) => [key, value])
  );

  const payload = {
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 2,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    localStorage
  };

  return payload;
}

function normalizeJourneyTables(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Journey tables payload must be an object.');
  }

  return {
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    activeTripId: normalizeText(data.activeTripId, 160),
    journeyUpdatedAt: normalizeNumber(data.journeyUpdatedAt),
    trips: Array.isArray(data.trips) ? data.trips.map(normalizeJourneyTripRow).filter(Boolean).slice(0, 50) : [],
    days: Array.isArray(data.days) ? data.days.map(normalizeJourneyDayRow).filter(Boolean).slice(0, 400) : [],
    entries: Array.isArray(data.entries) ? data.entries.map(normalizeJourneyEntryRow).filter(Boolean).slice(0, 1200) : []
  };
}

function normalizeJourneyTripRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string') return null;
  return {
    id: normalizeText(row.id, 160),
    title: normalizeText(row.title, 220),
    startDate: normalizeText(row.startDate, 24),
    endDate: normalizeText(row.endDate, 24),
    createdAt: normalizeText(row.createdAt, 48),
    updatedAt: normalizeText(row.updatedAt, 48),
    sourceName: normalizeText(row.sourceName, 160),
    sortIndex: normalizeNumber(row.sortIndex)
  };
}

function normalizeJourneyDayRow(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    typeof row.id !== 'string' ||
    typeof row.tripId !== 'string'
  ) {
    return null;
  }
  return {
    id: normalizeText(row.id, 160),
    tripId: normalizeText(row.tripId, 160),
    dayLabel: normalizeText(row.dayLabel, 80),
    date: normalizeText(row.date, 24),
    city: normalizeText(row.city, 160),
    stay: normalizeText(row.stay, 220),
    sortIndex: normalizeNumber(row.sortIndex)
  };
}

function normalizeJourneyEntryRow(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    typeof row.id !== 'string' ||
    typeof row.tripId !== 'string' ||
    typeof row.dayId !== 'string'
  ) {
    return null;
  }
  return {
    id: normalizeText(row.id, 160),
    tripId: normalizeText(row.tripId, 160),
    dayId: normalizeText(row.dayId, 160),
    time: normalizeText(row.time, 24),
    endTime: normalizeText(row.endTime, 24),
    city: normalizeText(row.city, 160),
    plan: normalizeText(row.plan, 500),
    stay: normalizeText(row.stay, 220),
    transport: normalizeText(row.transport, 220),
    duration: normalizeText(row.duration, 120),
    note: normalizeText(row.note, 2000),
    done: Boolean(row.done),
    sortIndex: normalizeNumber(row.sortIndex)
  };
}

function normalizeText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMemoryPhotos(photos) {
  if (!Array.isArray(photos)) {
    throw new Error('Memory photos payload must be an array.');
  }

  return photos
    .map((photo) => {
      try {
        return normalizeMemoryPhoto(photo);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, 24)
}

function normalizeMemoryPhoto(photo) {
  if (
    !photo ||
    typeof photo.id !== 'string' ||
    typeof photo.name !== 'string' ||
    typeof photo.dataUrl !== 'string' ||
    !photo.dataUrl.startsWith('data:image/')
  ) {
    throw new Error('Memory photo payload is invalid.');
  }

  return {
    id: photo.id.slice(0, 120),
    name: photo.name.slice(0, 180),
    dataUrl: photo.dataUrl
  };
}

function safeDocumentId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 160) || 'photo';
}
