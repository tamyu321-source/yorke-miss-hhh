import {
  CHECKINS_REPAIR_END_DATE,
  CHECKINS_REPAIR_START_DATE
} from './data/appData';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MOOD_HISTORY_PATTERN = /^(\d{4}-\d{2}-\d{2}):(.+)$/;

export function parseStoredStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function mergeCheckinDates(...sources: string[][]) {
  const dates = new Set<string>();
  sources.flat().forEach((date) => {
    if (isValidDateKey(date)) dates.add(date);
  });
  return [...dates].sort();
}

export function createRequiredCheckinDates() {
  return createDateKeyRange(CHECKINS_REPAIR_START_DATE, CHECKINS_REPAIR_END_DATE);
}

export function mergeMoodHistoryEntries(...sources: string[][]) {
  const entriesByDate = new Map<string, string>();
  sources.flat().forEach((entry) => {
    const match = MOOD_HISTORY_PATTERN.exec(entry);
    if (!match || !isValidDateKey(match[1]) || !match[2].trim()) return;
    entriesByDate.set(match[1], `${match[1]}:${match[2]}`);
  });
  return [...entriesByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry);
}

function createDateKeyRange(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function isValidDateKey(value: string) {
  const parsed = parseDateKey(value);
  return Boolean(parsed && formatDateKey(parsed) === value);
}

function parseDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-');
}
