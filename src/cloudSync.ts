import type { AppExportData } from './backup';

const CLOUD_API_URL = (import.meta.env.VITE_CLOUD_API_URL ?? '').replace(/\/$/, '');
const CLOUD_SESSION_KEY = 'count-to-814:cloud-session';

type SessionResponse = {
  token: string;
};

type StateResponse = {
  data: AppExportData | null;
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
  const response = await cloudFetch<StateResponse>('/api/state', {
    method: 'GET',
    token
  });
  return response.data;
}

export async function saveCloudState(token: string, data: AppExportData) {
  await cloudFetch('/api/state', {
    method: 'PUT',
    token,
    body: JSON.stringify({ data })
  });
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
