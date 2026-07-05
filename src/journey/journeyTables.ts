import type { AppExportData } from '../backup';
import { JOURNEY_UPDATED_KIND } from '../data/appData';
import { storageKey } from '../storage';
import type { JourneyEntry, JourneyPlanDay, JourneyTrip } from '../types';
import { normalizeJourneyTrip } from './journeyPlanner';

export const JOURNEY_TABLE_SCHEMA_VERSION = 1;

export type JourneyCloudTripRow = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string;
  sortIndex: number;
};

export type JourneyCloudDayRow = {
  id: string;
  tripId: string;
  dayLabel: string;
  date: string;
  city: string;
  stay: string;
  sortIndex: number;
};

export type JourneyCloudEntryRow = JourneyEntry & {
  tripId: string;
  dayId: string;
  sortIndex: number;
};

export type JourneyCloudTables = {
  schemaVersion: number;
  exportedAt: string;
  activeTripId: string;
  journeyUpdatedAt: number;
  trips: JourneyCloudTripRow[];
  days: JourneyCloudDayRow[];
  entries: JourneyCloudEntryRow[];
};

const JOURNEY_TRIPS_KEY = storageKey('journey-trips');
const ACTIVE_JOURNEY_TRIP_KEY = storageKey('active-journey-trip');
const JOURNEY_UPDATED_AT_KEY = storageKey(JOURNEY_UPDATED_KIND);

export function createJourneyTablesFromExportData(data: AppExportData): JourneyCloudTables {
  const trips = parseJourneyTrips(data.localStorage[JOURNEY_TRIPS_KEY]);
  const activeTripId = data.localStorage[ACTIVE_JOURNEY_TRIP_KEY] ?? trips[0]?.id ?? '';
  const journeyUpdatedAt = getJourneyUpdatedAt(data, trips);

  return {
    schemaVersion: JOURNEY_TABLE_SCHEMA_VERSION,
    exportedAt: data.exportedAt || new Date().toISOString(),
    activeTripId,
    journeyUpdatedAt,
    trips: trips.map((trip, sortIndex) => ({
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      sourceName: trip.sourceName,
      sortIndex
    })),
    days: trips.flatMap((trip) =>
      trip.days.map((day, sortIndex) => ({
        id: day.id,
        tripId: trip.id,
        dayLabel: day.dayLabel,
        date: day.date,
        city: day.city,
        stay: day.stay,
        sortIndex
      }))
    ),
    entries: trips.flatMap((trip) =>
      trip.days.flatMap((day) =>
        day.entries.map((entry, sortIndex) => ({
          ...entry,
          tripId: trip.id,
          dayId: day.id,
          sortIndex
        }))
      )
    )
  };
}

export function applyJourneyTablesToExportData(data: AppExportData, tables: JourneyCloudTables | null): AppExportData {
  const trips = createJourneyTripsFromTables(tables);
  if (!tables || !trips.length) return data;

  const localStorage = {
    ...data.localStorage,
    [JOURNEY_TRIPS_KEY]: JSON.stringify(trips),
    [ACTIVE_JOURNEY_TRIP_KEY]: tables.activeTripId || trips[0].id,
    [JOURNEY_UPDATED_AT_KEY]: String(tables.journeyUpdatedAt || Date.parse(tables.exportedAt) || Date.now())
  };

  return {
    ...data,
    exportedAt: maxIsoDate(data.exportedAt, tables.exportedAt),
    localStorage
  };
}

function parseJourneyTrips(raw: string | undefined) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((trip) => normalizeJourneyTrip(trip))
      .filter((trip): trip is JourneyTrip => Boolean(trip));
  } catch {
    return [];
  }
}

function createJourneyTripsFromTables(tables: JourneyCloudTables | null) {
  if (!tables?.trips?.length) return [];

  const daysByTrip = groupBy(tables.days ?? [], (day) => day.tripId);
  const entriesByDay = groupBy(tables.entries ?? [], (entry) => `${entry.tripId}:${entry.dayId}`);

  return [...tables.trips]
    .sort(bySortIndex)
    .map((trip): Partial<JourneyTrip> => ({
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      sourceName: trip.sourceName,
      days: [...(daysByTrip.get(trip.id) ?? [])].sort(bySortIndex).map((day): JourneyPlanDay => ({
        id: day.id,
        dayLabel: day.dayLabel,
        date: day.date,
        city: day.city,
        stay: day.stay,
        entries: [...(entriesByDay.get(`${trip.id}:${day.id}`) ?? [])].sort(bySortIndex).map((entry) => ({
          id: entry.id,
          time: entry.time,
          endTime: entry.endTime,
          city: entry.city,
          plan: entry.plan,
          stay: entry.stay,
          transport: entry.transport,
          duration: entry.duration,
          note: entry.note,
          done: entry.done
        }))
      }))
    }))
    .map((trip) => normalizeJourneyTrip(trip))
    .filter((trip): trip is JourneyTrip => Boolean(trip));
}

function getJourneyUpdatedAt(data: AppExportData, trips: JourneyTrip[]) {
  const stored = Number(data.localStorage[JOURNEY_UPDATED_AT_KEY]);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const tripTimes = trips
    .map((trip) => Date.parse(trip.updatedAt))
    .filter((timestamp) => Number.isFinite(timestamp));
  return tripTimes.length ? Math.max(...tripTimes) : Date.parse(data.exportedAt) || Date.now();
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return groups;
}

function bySortIndex(left: { sortIndex: number }, right: { sortIndex: number }) {
  return left.sortIndex - right.sortIndex;
}

function maxIsoDate(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}
