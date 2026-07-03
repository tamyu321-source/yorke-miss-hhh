import type { JourneyEntry, JourneyImportRow, JourneyPlanDay, JourneyTrip } from '../types';
import {
  DAY_MS,
  emptyJourneyDraftRow,
  JOURNEY_AUTO_TIME_SLOTS,
  JOURNEY_COLUMN_ALIASES,
  JOURNEY_IMPORT_HEADERS
} from '../data/appData';
import { addDays, clamp, formatDateKey } from '../utils/dateJourney';

export function parseJourneyRowsFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('沒有找到可匯入的表格內容。');

  const matrix = lines.map((line) => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(',')) return parseCsvLine(line);
    const wideSplit = line.split(/\s{2,}/).filter(Boolean);
    if (wideSplit.length >= 4) return wideSplit;
    return parseLooseJourneyLine(line);
  });
  return parseJourneyRowsFromMatrix(matrix);
}

export function parseJourneyRowsFromMatrix(matrix: Array<Array<string | number | boolean | Date | null>>) {
  const cleaned = matrix
    .map((row) => row.map((cell) => normalizeImportCell(cell)))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) throw new Error('沒有找到可匯入的表格內容。');

  const headerIndex = cleaned.findIndex((row) => row.some((cell) => /day|日期|城市|行程|住宿|交通|備註/i.test(cell)));
  const hasHeader = headerIndex >= 0;
  const headers = hasHeader ? cleaned[headerIndex] : JOURNEY_IMPORT_HEADERS;
  const rows = (hasHeader ? cleaned.slice(headerIndex + 1) : cleaned).map((row, index) => mapJourneyImportRow(headers, row, index));
  const validRows = rows.filter((row) => row.date || row.city || row.plan || row.stay || row.transport || row.note);
  if (!validRows.length) throw new Error('沒有解析到行程列，請確認表格至少包含日期、城市或行程。');
  return validRows;
}

export function mapJourneyImportRow(headers: string[], row: string[], index: number): JourneyImportRow {
  const mapped: JourneyImportRow = { ...emptyJourneyDraftRow };
  const hasUsefulHeader = headers.some((header) => findJourneyFieldByHeader(header));

  if (hasUsefulHeader) {
    headers.forEach((header, columnIndex) => {
      const field = findJourneyFieldByHeader(header);
      if (field) mapped[field] = row[columnIndex] ?? '';
    });
  } else {
    mapped.dayLabel = row[0] ?? `Day ${index + 1}`;
    mapped.date = row[1] ?? '';
    mapped.city = row[2] ?? '';
    mapped.plan = row[3] ?? '';
    mapped.stay = row[4] ?? '';
    mapped.transport = row[5] ?? '';
    mapped.duration = row[6] ?? '';
    mapped.note = row.slice(7).filter(Boolean).join(' ');
  }

  if (!mapped.dayLabel) mapped.dayLabel = `Day ${index + 1}`;
  return mapped;
}

export function findJourneyFieldByHeader(header: string) {
  const normalized = header.trim().toLowerCase();
  return (Object.keys(JOURNEY_COLUMN_ALIASES) as Array<keyof JourneyImportRow>).find((field) =>
    JOURNEY_COLUMN_ALIASES[field].some((alias) => normalized === alias.toLowerCase() || normalized.includes(alias.toLowerCase()))
  );
}

export function parseLooseJourneyLine(line: string) {
  const match = /^(day\s*\d+|第?\s*\d+\s*天)?\s*(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?)?\s*(.*)$/i.exec(line);
  if (!match) return [line];
  const rest = match[3]?.trim() ?? '';
  return [match[1] ?? '', match[2] ?? '', '', rest];
}

export function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function buildJourneyTripFromRows(rows: JourneyImportRow[], sourceName: string, fallbackStartDate = new Date()): JourneyTrip {
  const days: JourneyPlanDay[] = [];
  let lastDate: Date | null = null;

  rows.forEach((row) => {
    const fallbackDate = lastDate ? addDays(lastDate, 1) : fallbackStartDate;
    const normalizedDate = normalizeImportedDate(row.date, fallbackDate) || formatDateKey(fallbackDate);
    lastDate = parseDateToDay(normalizedDate);
    const dayLabel = row.dayLabel || `Day ${days.length + 1}`;
    const existingDay = days.find((day) => day.dayLabel === dayLabel || day.date === normalizedDate);
    const targetDay =
      existingDay ??
      createJourneyDay(days.length + 1, normalizedDate, {
        dayLabel,
        city: row.city,
        stay: row.stay
      });

    if (!existingDay) days.push(targetDay);
    if (row.city && !targetDay.city) targetDay.city = row.city;
    if (row.stay && !targetDay.stay) targetDay.stay = row.stay;
    targetDay.entries.push(...createJourneyEntriesFromRow(row, targetDay.entries.length));
  });

  const sortedDays = renumberJourneyDays(days.sort((left, right) => parseDateToDay(left.date).getTime() - parseDateToDay(right.date).getTime()));
  const startDate = sortedDays[0]?.date ?? formatDateKey(fallbackStartDate);
  const endDate = sortedDays[sortedDays.length - 1]?.date ?? startDate;
  const title = createJourneyTitleFromDays(sortedDays, sourceName);

  return {
    id: createLocalId('trip'),
    title,
    startDate,
    endDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceName,
    days: sortedDays
  };
}

export function createDefaultJourneyTrip(): JourneyTrip {
  return buildJourneyTripFromRows(
    [
      { dayLabel: 'Day 1', date: '2026-11-19', city: '布拉格', plan: '抵達、天文鐘、舊城廣場、查理大橋夜景', stay: '布拉格', transport: '飛機 + 市區交通', duration: '', note: '11/18 18:15 - 06:25、11/19 00:05 - 08:15' },
      { dayLabel: 'Day 2', date: '2026-11-20', city: '布拉格 -> 克拉科夫', plan: '中央廣場、聖母聖殿、老城區', stay: '克拉科夫', transport: 'RegioJet', duration: '約 6.5 - 7hr', note: '早班車' },
      { dayLabel: 'Day 3', date: '2026-11-21', city: '克拉科夫', plan: '奧斯威辛集中營', stay: '克拉科夫', transport: '巴士', duration: '約 1.5hr', note: '需要預約時段' },
      { dayLabel: 'Day 4', date: '2026-11-22', city: '克拉科夫', plan: '瓦維爾城堡、鹽礦', stay: '克拉科夫', transport: '', duration: '', note: '還不知道要幹嘛的一天' },
      { dayLabel: 'Day 5', date: '2026-11-23', city: '克拉科夫 -> 華沙', plan: '老城、皇家城堡', stay: '華沙', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 6', date: '2026-11-24', city: '華沙', plan: '自由探索與補圖', stay: '華沙', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 7', date: '2026-11-25', city: '華沙 -> 格但斯克', plan: '想去哪你說看看', stay: '格但斯克', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 8', date: '2026-11-26', city: '格但斯克', plan: '還沒研究', stay: '格但斯克', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 9', date: '2026-11-27', city: '格但斯克 -> 布拉格', plan: '返回布拉格', stay: '布拉格', transport: '飛機', duration: '約 1.5hr', note: '' },
      { dayLabel: 'Day 10', date: '2026-11-28', city: '布拉格', plan: '城堡、聖維特教堂、黃金巷', stay: '布拉格', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 11', date: '2026-11-29', city: '布拉格', plan: '可以睡覺睡整天嗎？好哇！', stay: '布拉格', transport: '', duration: '', note: '' },
      { dayLabel: 'Day 12', date: '2026-11-30', city: '布拉格 -> 台灣', plan: '掰掰歐洲', stay: '-', transport: '飛機', duration: '約 15hr', note: '' }
    ],
    '範例旅程'
  );
}

export function createJourneyTitleFromDays(days: JourneyPlanDay[], sourceName: string) {
  const routeCities = days
    .flatMap((day) => day.city.split(/(?:->|→|到)/g))
    .map((city) => city.trim())
    .filter(Boolean);
  const startCity = routeCities[0] ?? '';
  const endCity = routeCities[routeCities.length - 1] ?? '';
  if (startCity && endCity && startCity !== endCity) return `${startCity}到${endCity}旅程`;
  if (startCity) return `${startCity}旅程`;
  return sourceName.replace(/\.[^.]+$/, '') || '匯入旅程';
}

export function createJourneyDay(dayNumber: number, date: string, patch: Partial<JourneyPlanDay> = {}): JourneyPlanDay {
  return {
    id: createLocalId('day'),
    dayLabel: patch.dayLabel || `Day ${dayNumber}`,
    date,
    city: patch.city ?? '',
    stay: patch.stay ?? '',
    entries: patch.entries ?? []
  };
}

export function createJourneyEntriesFromRow(row: JourneyImportRow, existingCount = 0, existingTime = '', existingEndTime = '') {
  const items = splitJourneyPlanItems(row.plan);
  const plans = items.length ? items : [row.plan || row.transport || row.note || '待安排'];
  const noteIndex = row.transport || /抵達|到達|出發|返回|飛機|火車|巴士/.test(plans[0] ?? '') ? 0 : plans.length - 1;
  return plans.map((plan, index) => {
    const note = plans.length === 1 || index === noteIndex ? row.note : '';
    return createJourneyEntry(
      {
        ...row,
        plan,
        transport: index === 0 ? row.transport : '',
        duration: index === 0 ? row.duration : '',
        note
      },
      plans.length === 1 && existingTime ? existingTime : suggestJourneyTime(row, plan, index, plans.length, existingCount),
      plans.length === 1 && existingEndTime ? existingEndTime : ''
    );
  });
}

export function autoScheduleJourneyDay(day: JourneyPlanDay): JourneyPlanDay {
  const entries = day.entries.flatMap((entry, index) =>
    createJourneyEntriesFromRow(
      {
        dayLabel: day.dayLabel,
        date: day.date,
        city: entry.city || day.city,
        plan: entry.plan,
        stay: entry.stay || day.stay,
        transport: entry.transport,
        duration: entry.duration,
        note: entry.note
      },
      index,
      entry.time,
      entry.endTime
    )
  );
  return {
    ...day,
    entries: entries.length ? entries : [createJourneyEntry({ ...emptyJourneyDraftRow, dayLabel: day.dayLabel, date: day.date, city: day.city, stay: day.stay, plan: '待安排' }, '09:30')]
  };
}

export function splitJourneyPlanItems(plan: string) {
  return plan
    .split(/[、，,；;／\/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function suggestJourneyTime(row: JourneyImportRow, plan: string, index: number, total: number, existingCount: number) {
  const text = `${row.city} ${row.transport} ${row.duration} ${row.note} ${plan}`;
  const notedTime = extractLastClockTime(row.note);
  if (index === 0 && notedTime && /抵達|到達|降落|機場/.test(text)) return notedTime;
  if (index === 0 && /早班|RegioJet|火車|巴士|客運|飛機|機場|出發|返回|掰掰|->|→/.test(text)) {
    if (/早班/.test(text)) return '08:00';
    return '08:30';
  }
  if (/夜景|夜|晚餐|晚上/.test(plan)) return '18:30';
  if (/睡覺|自由|補圖|還沒研究|想去哪|待安排/.test(plan)) return index === 0 ? '11:00' : JOURNEY_AUTO_TIME_SLOTS[Math.min(existingCount + index, JOURNEY_AUTO_TIME_SLOTS.length - 1)];
  if (total === 1 && /集中營|預約/.test(text)) return '09:00';
  return JOURNEY_AUTO_TIME_SLOTS[Math.min(existingCount + index, JOURNEY_AUTO_TIME_SLOTS.length - 1)];
}

export function extractLastClockTime(value: string) {
  const matches = [...value.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)];
  const match = matches[matches.length - 1];
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function createJourneyEntry(row: JourneyImportRow, time = '', endTime = ''): JourneyEntry {
  const safeEndTime = endTime || suggestJourneyEndTime(time, row.duration);
  return {
    id: createLocalId('entry'),
    time,
    endTime: safeEndTime,
    city: row.city,
    plan: row.plan,
    stay: row.stay,
    transport: row.transport,
    duration: row.duration,
    note: row.note,
    done: false
  };
}

export function normalizeJourneyTrip(value: Partial<JourneyTrip> | null | undefined, fallbackStartDate = new Date()): JourneyTrip | null {
  if (!value || typeof value !== 'object') return null;
  const days = Array.isArray(value.days)
    ? value.days
        .map((day, index): JourneyPlanDay | null => {
          if (!day || typeof day !== 'object') return null;
          const fallbackDate = addDays(fallbackStartDate, index);
          const date = normalizeImportedDate(day.date ?? '', fallbackDate) || formatDateKey(fallbackDate);
          return {
            id: typeof day.id === 'string' ? day.id : createLocalId('day'),
            dayLabel: typeof day.dayLabel === 'string' && day.dayLabel ? day.dayLabel : `Day ${index + 1}`,
            date,
            city: typeof day.city === 'string' ? day.city : '',
            stay: typeof day.stay === 'string' ? day.stay : '',
            entries: Array.isArray(day.entries)
              ? day.entries.map(normalizeJourneyEntry).filter((entry): entry is JourneyEntry => Boolean(entry))
              : []
          };
        })
        .filter((day): day is JourneyPlanDay => Boolean(day))
    : [];
  const safeDays = renumberJourneyDays(days.length ? days : [createJourneyDay(1, formatDateKey(fallbackStartDate))]);
  const storedTitle = typeof value.title === 'string' && value.title.trim() ? value.title.trim() : '';
  const title = storedTitle.includes('->') ? createJourneyTitleFromDays(safeDays, value.sourceName ?? '匯入旅程') : storedTitle || '未命名旅程';
  return {
    id: typeof value.id === 'string' ? value.id : createLocalId('trip'),
    title,
    startDate: safeDays[0].date,
    endDate: safeDays[safeDays.length - 1].date,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    sourceName: typeof value.sourceName === 'string' ? value.sourceName : '未知來源',
    days: safeDays
  };
}

export function normalizeJourneyEntry(entry: Partial<JourneyEntry> | null | undefined): JourneyEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const time = typeof entry.time === 'string' ? entry.time : '';
  return {
    id: typeof entry.id === 'string' ? entry.id : createLocalId('entry'),
    time,
    endTime: typeof entry.endTime === 'string' ? entry.endTime : suggestJourneyEndTime(time, typeof entry.duration === 'string' ? entry.duration : ''),
    city: typeof entry.city === 'string' ? entry.city : '',
    plan: typeof entry.plan === 'string' ? entry.plan : '',
    stay: typeof entry.stay === 'string' ? entry.stay : '',
    transport: typeof entry.transport === 'string' ? entry.transport : '',
    duration: typeof entry.duration === 'string' ? entry.duration : '',
    note: typeof entry.note === 'string' ? entry.note : '',
    done: Boolean(entry.done)
  };
}

export function renumberJourneyDays(days: JourneyPlanDay[]) {
  return days.map((day, index) => ({
    ...day,
    dayLabel: day.dayLabel || `Day ${index + 1}`
  }));
}

export function getNearestJourneyTrip(trips: JourneyTrip[], from: Date) {
  return [...trips].sort((left, right) => {
    const leftStart = parseDateToDay(left.startDate).getTime();
    const rightStart = parseDateToDay(right.startDate).getTime();
    const fromTime = from.getTime();
    const leftDistance = leftStart >= fromTime ? leftStart - fromTime : Math.abs(parseDateToDay(left.endDate).getTime() - fromTime) + DAY_MS * 365;
    const rightDistance = rightStart >= fromTime ? rightStart - fromTime : Math.abs(parseDateToDay(right.endDate).getTime() - fromTime) + DAY_MS * 365;
    return leftDistance - rightDistance;
  })[0];
}

export function normalizeImportedDate(value: string, fallback: Date) {
  const text = value.trim();
  if (!text) return '';
  const normalized = text.replace(/[.]/g, '/');
  let year = fallback.getFullYear();
  let month = 0;
  let day = 0;
  const full = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  const short = /^(\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  if (full) {
    year = Number(full[1]);
    month = Number(full[2]);
    day = Number(full[3]);
  } else if (short) {
    month = Number(short[1]);
    day = Number(short[2]);
    const candidate = new Date(year, month - 1, day);
    if (candidate.getTime() < addDays(fallback, -180).getTime()) year += 1;
  } else {
    return '';
  }
  const maxDay = new Date(year, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateToDay(value: string, fallbackDate = new Date()) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date(fallbackDate);
  return new Date(year, month - 1, day);
}

export function formatJourneyDateLabel(value: string) {
  const date = parseDateToDay(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function parseJourneyEntryDateTime(date: string, time: string, index: number) {
  const day = parseDateToDay(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (match) {
    day.setHours(clamp(Number(match[1]), 0, 23), clamp(Number(match[2]), 0, 59), 0, 0);
    return day;
  }
  day.setHours(9 + Math.min(index, 8), 0, 0, 0);
  return day;
}

export function parseJourneyEntryEndDateTime(date: string, endTime: string, start: Date) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(endTime.trim());
  if (!match) return new Date(start.getTime() + 90 * 60 * 1000);
  const end = parseDateToDay(date);
  end.setHours(clamp(Number(match[1]), 0, 23), clamp(Number(match[2]), 0, 59), 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

export function parseTimeSortValue(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  return clamp(Number(match[1]), 0, 23) * 60 + clamp(Number(match[2]), 0, 59);
}

export function suggestJourneyEndTime(time: string, duration: string) {
  const startMinutes = parseTimeSortValue(time);
  if (startMinutes === Number.MAX_SAFE_INTEGER) return '';
  const durationMinutes = parseJourneyDurationMinutes(duration) || 90;
  const endMinutes = (startMinutes + durationMinutes) % (24 * 60);
  return formatClockMinutes(endMinutes);
}

export function parseJourneyDurationMinutes(duration: string) {
  const hourMatch = /(\d+(?:\.\d+)?)\s*(?:h|hr|小時|hour)/i.exec(duration);
  if (hourMatch) return Math.max(15, Math.round(Number(hourMatch[1]) * 60));
  const minuteMatch = /(\d+)\s*(?:m|min|分鐘)/i.exec(duration);
  if (minuteMatch) return Math.max(15, Number(minuteMatch[1]));
  return 0;
}

export function formatClockMinutes(totalMinutes: number) {
  const minutes = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function getJourneyEntrySectionId(entry: JourneyEntry) {
  const minutes = parseTimeSortValue(entry.time);
  if (minutes === Number.MAX_SAFE_INTEGER) return 'unscheduled';
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 18 * 60) return 'afternoon';
  return 'evening';
}

export function normalizeImportCell(value: string | number | boolean | Date | null) {
  if (value instanceof Date) return formatDateKey(value);
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
