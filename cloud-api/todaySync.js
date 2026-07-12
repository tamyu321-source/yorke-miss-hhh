const APP_STORAGE_PREFIX = 'first-meeting:';
const TODAY_UPDATED_KIND = 'today-updated-at';
const TODAY_SHARED_UPDATED_KIND = 'today-shared-updated-at';
const CHECKINS_REPAIR_KIND = 'checkins-repair-2026-07-12';
const CHECKINS_KEY = `${APP_STORAGE_PREFIX}checkins`;
const MOOD_HISTORY_KEY = `${APP_STORAGE_PREFIX}mood-history`;
const TODAY_SHARED_UPDATED_KEY = `${APP_STORAGE_PREFIX}${TODAY_SHARED_UPDATED_KIND}`;
const CHECKINS_REPAIR_KEY = `${APP_STORAGE_PREFIX}${CHECKINS_REPAIR_KIND}`;
const TODAY_DAILY_KINDS = [
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
  TODAY_UPDATED_KIND
];

export function mergeTodayFeaturePayload(existingData, incomingData) {
  const existingStorage = normalizeExistingLocalStorage(existingData?.localStorage);
  const incomingStorage = incomingData.localStorage;
  const localStorage = { ...existingStorage, ...incomingStorage };
  const dates = new Set([
    ...collectTodayDates(existingStorage),
    ...collectTodayDates(incomingStorage)
  ]);

  dates.forEach((date) => {
    const updatedAtKey = `${APP_STORAGE_PREFIX}${TODAY_UPDATED_KIND}:${date}`;
    const existingUpdatedAt = readTimestamp(existingStorage[updatedAtKey]);
    const incomingUpdatedAt = readTimestamp(incomingStorage[updatedAtKey]);
    const selectedStorage = incomingUpdatedAt >= existingUpdatedAt ? incomingStorage : existingStorage;
    Object.keys(localStorage).forEach((key) => {
      if (isTodayDailyKeyForDate(key, date)) delete localStorage[key];
    });
    Object.entries(selectedStorage).forEach(([key, value]) => {
      if (isTodayDailyKeyForDate(key, date)) localStorage[key] = value;
    });
  });

  const repairDone =
    existingStorage[CHECKINS_REPAIR_KEY] === 'done' ||
    incomingStorage[CHECKINS_REPAIR_KEY] === 'done';
  const requiredDates = repairDone ? [] : createDateRange('2026-05-21', '2026-07-12');
  localStorage[CHECKINS_KEY] = JSON.stringify(
    mergeCheckinDates(
      parseStoredStringArray(existingStorage[CHECKINS_KEY]),
      parseStoredStringArray(incomingStorage[CHECKINS_KEY]),
      requiredDates
    )
  );
  localStorage[MOOD_HISTORY_KEY] = JSON.stringify(
    mergeMoodHistoryEntries(
      parseStoredStringArray(existingStorage[MOOD_HISTORY_KEY]),
      parseStoredStringArray(incomingStorage[MOOD_HISTORY_KEY])
    )
  );
  localStorage[CHECKINS_REPAIR_KEY] = 'done';
  localStorage[TODAY_SHARED_UPDATED_KEY] = String(
    Math.max(
      readTimestamp(existingStorage[TODAY_SHARED_UPDATED_KEY]),
      readTimestamp(incomingStorage[TODAY_SHARED_UPDATED_KEY])
    )
  );

  return {
    ...incomingData,
    localStorage
  };
}

function normalizeExistingLocalStorage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, item]) => typeof key === 'string' && typeof item === 'string')
  );
}

function collectTodayDates(localStorage) {
  const prefix = `${APP_STORAGE_PREFIX}${TODAY_UPDATED_KIND}:`;
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter(isValidDateKey);
}

function isTodayDailyKeyForDate(key, date) {
  return TODAY_DAILY_KINDS.some((kind) => key === `${APP_STORAGE_PREFIX}${kind}:${date}`);
}

function readTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseStoredStringArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mergeCheckinDates(...sources) {
  return [...new Set(sources.flat().filter(isValidDateKey))].sort();
}

function mergeMoodHistoryEntries(...sources) {
  const entriesByDate = new Map();
  sources.flat().forEach((entry) => {
    const match = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(entry);
    if (!match || !isValidDateKey(match[1]) || !match[2].trim()) return;
    entriesByDate.set(match[1], `${match[1]}:${match[2]}`);
  });
  return [...entriesByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry);
}

function createDateRange(startKey, endKey) {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  const dates = [];
  for (let timestamp = start; timestamp <= end; timestamp += 24 * 60 * 60 * 1000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
