import type { AppExportData } from './backup';
import {
  applyJourneyTablesToExportData,
  createJourneyTablesFromExportData,
  type JourneyCloudTables
} from './journey/journeyTables';

const CLOUD_API_URL = (import.meta.env.VITE_CLOUD_API_URL ?? '').replace(/\/$/, '');
const CLOUD_SESSION_KEY = 'count-to-814:cloud-session';
const APP_STORAGE_PREFIX = 'first-meeting:';

export type CloudFeature = 'settings' | 'today' | 'prepare' | 'memories' | 'wishes' | 'period' | 'journey' | 'misc';

type CloudFeaturePayload = {
  schemaVersion: number;
  exportedAt: string;
  localStorage: Record<string, string>;
  photos?: AppExportData['photos'];
};

type SessionResponse = {
  token: string;
};

type StateResponse = {
  data: AppExportData | null;
};

type FeatureResponse = {
  data: CloudFeaturePayload | null;
};

type MemoryPhotosResponse = {
  photos: AppExportData['photos'];
};

type MemoryPhotoIdsResponse = {
  ids: string[];
};

type JourneyTablesResponse = {
  data: JourneyCloudTables | null;
};

const CLOUD_FEATURES: CloudFeature[] = [
  'settings',
  'today',
  'prepare',
  'memories',
  'wishes',
  'period',
  'journey',
  'misc'
];

const CLOUD_FEATURE_PATHS: Record<CloudFeature, string> = {
  settings: '/api/settings',
  today: '/api/today',
  prepare: '/api/prepare',
  memories: '/api/memories',
  wishes: '/api/wishes',
  period: '/api/period',
  journey: '/api/journey',
  misc: '/api/misc'
};

const FEATURE_KINDS: Record<Exclude<CloudFeature, 'misc'>, string[]> = {
  settings: ['settings', 'settings-updated-at', 'onboarding-seen', 'intro-seen'],
  today: [
    'task',
    'message',
    'mood',
    'secret',
    'secret-mailed',
    'fortune-title',
    'fortune-line',
    'question-answer',
    'radar-choice',
    'ritual-opened',
    'ritual-complete',
    'today-updated-at',
    'checkins',
    'mood-history'
  ],
  prepare: ['suitcase', 'meeting-checklist'],
  memories: [
    'meeting-moments',
    'capsule-notes',
    'flipped-capsules',
    'hidden-cards',
    'secret-code',
    'custom-secret-codes',
    'memory-photo-layouts',
    'memory-photo-wall-scale'
  ],
  wishes: ['wishes'],
  period: ['period-records', 'period-privacy-mode'],
  journey: ['journey-trips', 'active-journey-trip', 'journey-updated-at']
};

export function isCloudSyncConfigured() {
  return Boolean(CLOUD_API_URL);
}

export function restoreCloudSession() {
  return localStorage.getItem(CLOUD_SESSION_KEY) ?? '';
}

export function rememberCloudSession(token: string) {
  localStorage.setItem(CLOUD_SESSION_KEY, token);
}

export function clearCloudSession() {
  localStorage.removeItem(CLOUD_SESSION_KEY);
}

export async function requestCloudSession(password: string) {
  const response = await cloudFetch<SessionResponse>('/api/session', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
  rememberCloudSession(response.token);
  return response.token;
}

export async function fetchCloudState(token: string) {
  let legacyData: AppExportData | null = null;

  try {
    const response = await cloudFetch<StateResponse>('/api/state', {
      method: 'GET',
      token
    });
    legacyData = response.data;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  try {
    const responses = await Promise.all(
      CLOUD_FEATURES.map(async (feature) => {
        const response = await cloudFetch<FeatureResponse>(CLOUD_FEATURE_PATHS[feature], {
          method: 'GET',
          token
        });
        return [feature, response.data] as const;
      })
    );
    const featureData = Object.fromEntries(responses) as Partial<Record<CloudFeature, CloudFeaturePayload | null>>;
    if (Object.values(featureData).some(Boolean)) {
      let merged = mergeFeaturePayloads(featureData, legacyData);
      merged.photos = await fetchMemoryPhotos(token, merged.photos);
      merged = await fetchJourneyTables(token, merged);
      return merged;
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  return legacyData;
}

export async function saveCloudState(token: string, data: AppExportData, features?: CloudFeature[]) {
  const payloads = partitionCloudState(data);
  const featuresToSave = features?.length ? Array.from(new Set(features)) : CLOUD_FEATURES;

  try {
    await Promise.all(
      featuresToSave.map((feature) =>
        cloudFetch(CLOUD_FEATURE_PATHS[feature], {
          method: 'PUT',
          token,
          body: JSON.stringify({ data: payloads[feature] })
        })
      )
    );
    if (featuresToSave.includes('memories')) {
      await saveMemoryPhotos(token, data.photos);
    }
    if (featuresToSave.includes('journey')) {
      await saveJourneyTables(token, data);
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await cloudFetch('/api/state', {
      method: 'PUT',
      token,
      body: JSON.stringify({ data })
    });
  }
}

function partitionCloudState(data: AppExportData): Record<CloudFeature, CloudFeaturePayload> {
  const createdAt = new Date().toISOString();
  const payloads = Object.fromEntries(
    CLOUD_FEATURES.map((feature) => [
      feature,
      {
        schemaVersion: data.schemaVersion,
        exportedAt: data.exportedAt || createdAt,
        localStorage: {}
      }
    ])
  ) as Record<CloudFeature, CloudFeaturePayload>;

  Object.entries(data.localStorage).forEach(([key, value]) => {
    payloads[classifyStorageKey(key)].localStorage[key] = value;
  });

  payloads.memories.photos = [];
  return payloads;
}

function mergeFeaturePayloads(
  payloads: Partial<Record<CloudFeature, CloudFeaturePayload | null>>,
  base: AppExportData | null = null
): AppExportData {
  const localStorage: Record<string, string> = { ...(base?.localStorage ?? {}) };
  let schemaVersion = base?.schemaVersion ?? 2;
  let exportedAt = base?.exportedAt ?? '';
  let photos = base?.photos ?? [];

  CLOUD_FEATURES.forEach((feature) => {
    const payload = payloads[feature];
    if (!payload) return;

    schemaVersion = Math.max(schemaVersion, payload.schemaVersion || 2);
    if (!exportedAt || payload.exportedAt > exportedAt) exportedAt = payload.exportedAt;
    Object.assign(localStorage, payload.localStorage);
    if (feature === 'memories') {
      photos = payload.photos ?? [];
    }
  });

  return {
    schemaVersion,
    exportedAt: exportedAt || new Date().toISOString(),
    localStorage,
    photos
  };
}

function classifyStorageKey(key: string): CloudFeature {
  if (!key.startsWith(APP_STORAGE_PREFIX)) return 'misc';

  const kind = key.slice(APP_STORAGE_PREFIX.length).split(':')[0] ?? '';
  for (const [feature, kinds] of Object.entries(FEATURE_KINDS) as Array<[Exclude<CloudFeature, 'misc'>, string[]]>) {
    if (kinds.includes(kind)) return feature;
  }

  return kind === 'memory-photos' ? 'memories' : 'misc';
}

async function fetchMemoryPhotos(token: string, fallbackPhotos: AppExportData['photos']) {
  try {
    const response = await cloudFetch<MemoryPhotosResponse>('/api/memory-photos', {
      method: 'GET',
      token
    });
    return Array.isArray(response.photos) ? response.photos : fallbackPhotos;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return fallbackPhotos;
  }
}

async function saveMemoryPhotos(token: string, photos: AppExportData['photos']) {
  try {
    const response = await cloudFetch<MemoryPhotoIdsResponse>('/api/memory-photo-ids', {
      method: 'GET',
      token
    });
    const remoteIds = new Set(Array.isArray(response.ids) ? response.ids.filter((id) => typeof id === 'string') : []);
    const nextIds = new Set(photos.map((photo) => photo.id));

    await Promise.all(
      photos.map((photo) =>
        cloudFetch(`/api/memory-photos/${encodeURIComponent(photo.id)}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({ photo })
        })
      )
    );

    await Promise.all(
      [...remoteIds]
        .filter((id) => !nextIds.has(id))
        .map((id) =>
          cloudFetch(`/api/memory-photos/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            token
          })
        )
    );
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  await cloudFetch('/api/memory-photos', {
    method: 'PUT',
    token,
    body: JSON.stringify({ photos })
  });
}

async function fetchJourneyTables(token: string, data: AppExportData) {
  try {
    const response = await cloudFetch<JourneyTablesResponse>('/api/journey/tables', {
      method: 'GET',
      token
    });
    return applyJourneyTablesToExportData(data, response.data);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return data;
  }
}

async function saveJourneyTables(token: string, data: AppExportData) {
  try {
    await cloudFetch('/api/journey/tables', {
      method: 'PUT',
      token,
      body: JSON.stringify({ data: createJourneyTablesFromExportData(data) })
    });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && error.message.startsWith('Cloud request failed: 404');
}

async function cloudFetch<T = unknown>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  if (!CLOUD_API_URL) {
    throw new Error('Cloud API is not configured.');
  }

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(`${CLOUD_API_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cloud request failed: ${response.status}${detail ? ` ${detail}` : ''}`);
  }

  return (await response.json()) as T;
}
