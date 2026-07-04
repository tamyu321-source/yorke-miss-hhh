<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch, type CSSProperties } from 'vue';
import { createWorker } from 'tesseract.js';
import * as XLSX from 'xlsx';
import { appViewContextKey } from './appViewContext';
import { createExportData, downloadJsonBackup, parseImportData, type AppExportData } from './backup';
import { downloadCalendar } from './calendar';
import AppShellEffects from './components/AppShellEffects.vue';
import BottomNav from './components/BottomNav.vue';
import PasswordGate from './components/PasswordGate.vue';
import {
  clearCloudSession,
  fetchCloudState,
  isCloudSyncConfigured,
  requestCloudSession,
  restoreCloudSession,
  saveCloudState,
  type CloudFeature
} from './cloudSync';
import { loadStoredPhotos, mergePhotos, savePhotos } from './photoDb';
import { checkForAppUpdate as checkServiceWorkerUpdate, refreshForWaitingServiceWorker } from './pwa';
import { restoreAppLocalStorage, storageKey } from './storage';
import CountdownView from './views/CountdownView.vue';
import JourneyView from './views/JourneyView.vue';
import MemoriesView from './views/MemoriesView.vue';
import PeriodView from './views/PeriodView.vue';
import PrepareView from './views/PrepareView.vue';
import TodayView from './views/TodayView.vue';
import type {
  ActiveTab,
  AppSettings,
  BurstParticle,
  CountdownUnit,
  Countdown,
  FlightContentZone,
  FlightLandingEffect,
  FlightZoneId,
  HiddenCardItem,
  JourneyEditableEntryField,
  JourneyImportRow,
  JourneyPanelMode,
  JourneyScheduleSection,
  JourneyTrip,
  MemoryCapsuleNote,
  MemoryPhoto,
  PeriodRecord,
  PlaneDragState,
  Sparkle,
  ThemeId,
  WishItem
} from './types';

import {
  DAY_MS, OPENING_DURATION_MS, OPENING_RETURN_DURATION_MS, OPENING_SKIP_DURATION_MS,
  OPENING_REDUCED_DURATION_MS, SETTINGS_UPDATED_KIND, THEME_CHROME_COLORS,
  JOURNEY_AUTO_TIME_SLOTS, BOY_NAME,
  GIRL_NAME, defaultSettings, themeOptions,
  suitcaseItems,
  moodOptions, secretWhispers, fortuneDeck, timelineEvents,
  defaultSecretCodes, hiddenCardLines, dailyQuestions, radarChoices,
  meetingChecklistItems, meetingMomentItems
} from './data/appData';
import {
  addDays,
  clamp,
  createJourneyDays,
  formatDateKey,
  formatMonthDay,
  getCheckinStreak,
  getClosenessLabel,
  getCountdown,
  normalizeClockTime,
  normalizeDateSetting,
  parseClockTime,
  parseDateSetting,
  pick,
  startOfDay
} from './utils/dateJourney';
import {
  autoScheduleJourneyDay,
  buildJourneyTripFromRows,
  createDefaultJourneyTrip,
  createJourneyDay,
  createJourneyEntry,
  createLocalId,
  formatJourneyDateLabel,
  getJourneyEntrySectionId,
  getNearestJourneyTrip,
  normalizeImportedDate,
  normalizeJourneyTrip,
  parseDateToDay,
  parseJourneyEntryDateTime,
  parseJourneyEntryEndDateTime,
  parseJourneyRowsFromMatrix,
  parseJourneyRowsFromText,
  parseTimeSortValue,
  renumberJourneyDays
} from './journey/journeyPlanner';

const MAP_VIEWBOX_WIDTH = 320;
const MAP_VIEWBOX_HEIGHT = 190;
const PLANE_RETURN_DESTINATION_DELAY_MS = 120;
const PLANE_RETURN_HOME_DELAY_MS = 980;
const PLANE_RETURN_RESET_DELAY_MS = 2_040;
const mapBounds = {
  minLon: 116.6,
  maxLon: 123.4,
  minLat: 21.5,
  maxLat: 32.2
};

type GeoPoint = readonly [lon: number, lat: number];
type MapWeatherKind = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'wind';
type WeatherStationId = 'tainan' | 'shanghai' | 'wuxi';

type MapWeatherSnapshot = {
  kind: MapWeatherKind;
  label: string;
  temperature: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  source: 'live' | 'fallback';
  updatedAt: string;
};

function projectGeoPoint(lat: number, lon: number, width: number, height: number) {
  const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * width;
  const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * height;
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10
  };
}

function projectMapPoint(lat: number, lon: number) {
  return projectGeoPoint(lat, lon, MAP_VIEWBOX_WIDTH, MAP_VIEWBOX_HEIGHT);
}

function projectGeoPathInBox(points: readonly GeoPoint[], width: number, height: number, close = true) {
  const commands = points.map(([lon, lat], index) => {
    const point = projectGeoPoint(lat, lon, width, height);
    return `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`;
  });
  return `${commands.join(' ')}${close ? ' Z' : ''}`;
}

function projectGeoPath(points: readonly GeoPoint[], close = true) {
  return projectGeoPathInBox(points, MAP_VIEWBOX_WIDTH, MAP_VIEWBOX_HEIGHT, close);
}

const mapCityPins = [
  { id: 'tainan', label: '台南', caption: '22.9999°N, 120.2270°E', lat: 22.9999, lon: 120.2270, kind: 'start', weatherStationId: 'tainan' },
  { id: 'shanghai', label: '上海', caption: '31.2304°N, 121.4737°E', lat: 31.2304, lon: 121.4737, kind: 'end', weatherStationId: 'shanghai' },
  { id: 'wuxi', label: '無錫', caption: '31.4912°N, 120.3119°E', lat: 31.4912, lon: 120.3119, kind: 'hub', weatherStationId: 'wuxi' }
] as const;
const mapRouteStops = [
  { id: 'taiwan-strait', label: '台灣海峽', lat: 24.4, lon: 119.4 },
  { id: 'east-china-sea', label: '東海', lat: 28.5, lon: 121.9 }
] as const;
const weatherStations = [
  { id: 'tainan', label: '台南', shortLabel: '台南', lat: 22.9999, lon: 120.2270, side: 'south' },
  { id: 'shanghai', label: '上海', shortLabel: '上海', lat: 31.2304, lon: 121.4737, side: 'delta' },
  { id: 'wuxi', label: '無錫', shortLabel: '無錫', lat: 31.4912, lon: 120.3119, side: 'delta' }
] as const;
const chinaCoastPoints: readonly GeoPoint[] = [
  [116.6, 32.2],
  [121.9, 32.2],
  [121.5, 31.3],
  [121.9, 30.8],
  [121.2, 30.3],
  [121.7, 29.8],
  [121.2, 29.2],
  [120.8, 28.5],
  [120.9, 27.7],
  [120.4, 27.0],
  [119.8, 26.4],
  [119.6, 25.9],
  [119.0, 25.4],
  [118.3, 24.7],
  [117.7, 24.1],
  [117.1, 23.4],
  [116.6, 22.9],
  [116.6, 32.2]
];
const taiwanOutlinePoints: readonly GeoPoint[] = [
  [121.88, 25.28],
  [122.02, 24.92],
  [121.93, 24.43],
  [121.75, 23.93],
  [121.58, 23.42],
  [121.34, 22.93],
  [121.08, 22.47],
  [120.86, 21.98],
  [120.62, 21.90],
  [120.42, 22.13],
  [120.22, 22.58],
  [120.04, 23.16],
  [120.10, 23.72],
  [120.25, 24.18],
  [120.48, 24.62],
  [120.78, 24.92],
  [121.18, 25.15],
  [121.54, 25.30],
  [121.88, 25.28]
];
const yangtzeDeltaBlockPoints: readonly GeoPoint[] = [
  [119.72, 32.16],
  [120.66, 32.34],
  [121.84, 32.14],
  [122.46, 31.58],
  [122.18, 30.86],
  [121.08, 30.36],
  [120.02, 30.58],
  [119.58, 31.18],
  [119.72, 32.16]
];
const mapLandMasses = [
  {
    id: 'china-coast',
    label: '中國東南沿海',
    path: projectGeoPath(chinaCoastPoints)
  },
  {
    id: 'taiwan',
    label: '台灣',
    path: projectGeoPath(taiwanOutlinePoints)
  }
] as const;
const mapIslandMarkers = [
  { id: 'penghu', label: '澎湖', radius: 3.2, ...projectMapPoint(23.57, 119.58) },
  { id: 'kinmen', label: '金門', radius: 2.4, ...projectMapPoint(24.44, 118.32) },
  { id: 'matsu', label: '馬祖', radius: 2.1, ...projectMapPoint(26.16, 119.95) },
  { id: 'zhoushan', label: '舟山', radius: 3.0, ...projectMapPoint(30.02, 122.10) }
] as const;
const mapWeatherRegions = [
  {
    id: 'yangtze-delta',
    label: '上海 / 無錫天氣帶',
    path: projectGeoPath(yangtzeDeltaBlockPoints)
  }
] as const;

const mapGridLines = [
  { id: 'lat-24', d: `M0 ${projectMapPoint(24, mapBounds.minLon).y} H${MAP_VIEWBOX_WIDTH}`, label: '24°N' },
  { id: 'lat-28', d: `M0 ${projectMapPoint(28, mapBounds.minLon).y} H${MAP_VIEWBOX_WIDTH}`, label: '28°N' },
  { id: 'lat-32', d: `M0 ${projectMapPoint(32, mapBounds.minLon).y} H${MAP_VIEWBOX_WIDTH}`, label: '32°N' },
  { id: 'lon-118', d: `M${projectMapPoint(mapBounds.minLat, 118).x} 0 V${MAP_VIEWBOX_HEIGHT}`, label: '118°E' },
  { id: 'lon-120', d: `M${projectMapPoint(mapBounds.minLat, 120).x} 0 V${MAP_VIEWBOX_HEIGHT}`, label: '120°E' },
  { id: 'lon-122', d: `M${projectMapPoint(mapBounds.minLat, 122).x} 0 V${MAP_VIEWBOX_HEIGHT}`, label: '122°E' }
] as const;
const mapWaterWaveLines = Array.from({ length: 4 }, (_, index) => {
  const y = 43 + index * 36;
  const amplitude = 5.5 + (index % 2) * 1.6;
  const direction = index % 2 === 0 ? 1 : -1;
  return {
    id: `map-water-wave-${index}`,
    d: `M-46 ${y} C18 ${y - amplitude * direction}, 62 ${y + amplitude * 0.82 * direction}, 116 ${y} S214 ${y - amplitude * 0.72 * direction}, 366 ${y + amplitude * 0.42 * direction}`,
    delay: `-${index * 4_200}ms`,
    duration: `${18 + index * 2}s`,
    opacity: `${0.34 + index * 0.045}`,
    strokeWidth: `${1.25 + index * 0.12}`,
    dash: `${116 + index * 18} ${228 + index * 28}`
  };
});
const mapRouteStart = projectMapPoint(mapCityPins[0].lat, mapCityPins[0].lon);
const mapRouteEnd = projectMapPoint(mapCityPins[1].lat, mapCityPins[1].lon);
const mapRouteControlStart = projectMapPoint(25.1, 120.25);
const mapRouteControlEnd = projectMapPoint(29.1, 122.15);
const flightRoutePath = `M${mapRouteStart.x} ${mapRouteStart.y} C${mapRouteControlStart.x} ${mapRouteControlStart.y}, ${mapRouteControlEnd.x} ${mapRouteControlEnd.y}, ${mapRouteEnd.x} ${mapRouteEnd.y}`;

function getRoutePoint(progressValue: number) {
  const t = clamp(progressValue, 0, 1);
  const mt = 1 - t;
  return {
    x:
      mt ** 3 * mapRouteStart.x +
      3 * mt ** 2 * t * mapRouteControlStart.x +
      3 * mt * t ** 2 * mapRouteControlEnd.x +
      t ** 3 * mapRouteEnd.x,
    y:
      mt ** 3 * mapRouteStart.y +
      3 * mt ** 2 * t * mapRouteControlStart.y +
      3 * mt * t ** 2 * mapRouteControlEnd.y +
      t ** 3 * mapRouteEnd.y
  };
}

function toMapPercent(point: { x: number; y: number }) {
  return {
    x: (point.x / MAP_VIEWBOX_WIDTH) * 100,
    y: (point.y / MAP_VIEWBOX_HEIGHT) * 100
  };
}

function getMapPointStyle(point: { x: number; y: number }, extra?: CSSProperties): CSSProperties {
  const percent = toMapPercent(point);
  return {
    left: `${percent.x}%`,
    top: `${percent.y}%`,
    ...extra
  };
}

const flightZoneLabels: Record<FlightZoneId, string> = {
  route: '回到航線',
  sky: '高空巡航',
  sea: '海面低飛',
  tainan: '台南起飛',
  shanghai: '城市夜降',
  wuxi: '湖城掠降',
  harbor: '跑道降落',
  strait: '海峽穿越',
  'east-sea': '東海流光',
  taiwan: '島嶼掠影',
  coast: '海岸貼飛',
  navigation: '導航擦撞',
  memory: '回憶星爆',
  countdown: '倒數衝擊'
};

const flightContentLabels: Record<FlightContentZone, string> = {
  map: '航圖',
  countdown: '倒數區',
  navigation: '底部導航',
  today: '今日頁',
  journey: '行程頁',
  period: '週期頁',
  memories: '回憶頁',
  prepare: '準備頁',
  surface: '頁面空域'
};

const weatherKindPriority: Record<MapWeatherKind, number> = {
  storm: 6,
  rain: 5,
  fog: 4,
  wind: 3,
  cloudy: 2,
  sunny: 1
};

function createWeatherSnapshot(
  kind: MapWeatherKind,
  label: string,
  source: MapWeatherSnapshot['source'],
  temperature: number | null = null,
  windSpeed: number | null = null,
  precipitation: number | null = null
): MapWeatherSnapshot {
  return {
    kind,
    label,
    temperature,
    windSpeed,
    precipitation,
    source,
    updatedAt: new Date().toISOString()
  };
}

function getFallbackWeather(stationId: WeatherStationId): MapWeatherSnapshot {
  const month = new Date().getMonth() + 1;
  if (stationId === 'tainan') {
    return month >= 5 && month <= 10
      ? createWeatherSnapshot('rain', '午後雲雨', 'fallback', 29, 16, 0.6)
      : createWeatherSnapshot('sunny', '晴朗微風', 'fallback', 24, 12, 0);
  }
  if (stationId === 'wuxi') {
    return month >= 6 && month <= 9
      ? createWeatherSnapshot('cloudy', '湖面雲光', 'fallback', 28, 14, 0.1)
      : createWeatherSnapshot('fog', '薄霧湖城', 'fallback', 15, 10, 0);
  }
  return month >= 6 && month <= 9
    ? createWeatherSnapshot('wind', '江風雲帶', 'fallback', 28, 20, 0.1)
    : createWeatherSnapshot('cloudy', '城市雲幕', 'fallback', 17, 14, 0);
}

function createFallbackWeatherMap(): Record<WeatherStationId, MapWeatherSnapshot> {
  return {
    tainan: getFallbackWeather('tainan'),
    shanghai: getFallbackWeather('shanghai'),
    wuxi: getFallbackWeather('wuxi')
  };
}

function getWeatherKindFromCode(weatherCode: number, windSpeed: number, precipitation: number): MapWeatherKind {
  if ([95, 96, 99].includes(weatherCode)) return 'storm';
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || precipitation > 0.25) return 'rain';
  if ([45, 48].includes(weatherCode)) return 'fog';
  if (windSpeed >= 28) return 'wind';
  if (weatherCode >= 2 && weatherCode <= 3) return 'cloudy';
  return 'sunny';
}

function getWeatherLabel(kind: MapWeatherKind) {
  if (kind === 'storm') return '雷雨閃光';
  if (kind === 'rain') return '雨線流動';
  if (kind === 'fog') return '霧面漫開';
  if (kind === 'wind') return '風帶掠過';
  if (kind === 'cloudy') return '雲層漂移';
  return '晴光閃爍';
}

function createPlaneDragState(): PlaneDragState {
  return {
    dragging: false,
    returning: false,
    returnPhase: 'idle',
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    screenX: 0,
    screenY: 0,
    homeX: 0,
    homeY: 0,
    zone: 'route',
    contentZone: 'surface',
    lat: mapCityPins[0].lat,
    lon: mapCityPins[0].lon
  };
}

const now = ref(new Date());
const taskCompleted = ref(false);
const dailyMessage = ref('');
const selectedMoodId = ref('');
const secretRevealed = ref(false);
const secretMailed = ref(false);
const suitcaseChecked = ref<string[]>([]);
const flippedCapsules = ref<number[]>([]);
const sparkles = ref<Sparkle[]>([]);
const radarScanned = ref(false);
const checkins = ref<string[]>([]);
const fortuneTitle = ref('');
const fortuneLine = ref('');
const moodHistory = ref<string[]>([]);
const planeDrag = ref<PlaneDragState>(createPlaneDragState());
const flightLandingEffect = ref<FlightLandingEffect | null>(null);
const viewportSize = ref({ width: window.innerWidth, height: window.innerHeight });
const mapWeather = ref<Record<WeatherStationId, MapWeatherSnapshot>>(createFallbackWeatherMap());
const secretCodeInput = ref('');
const secretCodeUnlocked = ref(false);
const secretCodeMessage = ref('');
const memoryPhotos = ref<MemoryPhoto[]>([]);
const memoryCapsuleNotes = ref<MemoryCapsuleNote[]>([]);
const editingCapsuleIndex = ref<number | null>(null);
const capsuleEditText = ref('');
const dailyAnswer = ref('');
const radarChoiceId = ref('');
const meetingChecklist = ref<string[]>([]);
const activeTab = ref<ActiveTab>('countdown');
const capsuleShowAll = ref(false);
const isOnline = ref(navigator.onLine);
const installReady = ref(false);
const installedDisplayMode = ref(false);
const customSecretCodes = ref<string[]>([]);
const newSecretCode = ref('');
const hiddenCards = ref<HiddenCardItem[]>([]);
const hiddenCardTitleDraft = ref('');
const hiddenCardTextDraft = ref('');
const editingHiddenCardId = ref('');
const importMessage = ref('');
const pendingImport = ref<AppExportData | null>(null);
const importMode = ref<'merge' | 'replace'>('merge');
const settings = ref<AppSettings>({ ...defaultSettings });
const settingsDraft = ref<AppSettings>({ ...defaultSettings });
const previewTheme = ref<ThemeId | ''>('');
const onboardingVisible = ref(false);
const ritualOpened = ref(false);
const ritualComplete = ref(false);
const shareCopied = ref(false);
const updateReady = ref(false);
const wishes = ref<WishItem[]>([]);
const newWish = ref('');
const meetingMoments = ref<string[]>([]);
const periodRecords = ref<PeriodRecord[]>([]);
const newPeriodStartDate = ref('');
const newPeriodEndDate = ref('');
const newPeriodNote = ref('');
const newPeriodFlow = ref<PeriodRecord['flow']>('medium');
const newPeriodPainLevel = ref(2);
const newPeriodSymptoms = ref<string[]>([]);
const newPeriodMoods = ref<string[]>([]);
const newPeriodCare = ref<string[]>([]);
const periodMessage = ref('');
const editingPeriodRecordId = ref('');
const periodCalendarOffset = ref(0);
const periodPrivacyMode = ref(false);
const sceneTilt = ref({ x: 0, y: 0 });
const introActive = ref(true);
const introClosing = ref(false);
const introMode = ref<'first' | 'returning'>('first');
const flipUnits = ref<CountdownUnit[]>([]);
const burstParticles = ref<BurstParticle[]>([]);
const themeTransition = ref(false);
const packingItems = ref<string[]>([]);
const milestoneFlash = ref(false);
const secretPressing = ref(false);
const appUnlocked = ref(false);
const passwordInput = ref('');
const passwordStatus = ref('');
const passwordBusy = ref(false);
const passwordSuccess = ref(false);
const cloudLoadingActive = ref(false);
const localDataMode = ref(false);
const cloudToken = ref('');
const cloudStatus = ref('尚未同步');
const cloudSyncBusy = ref(false);
const cloudSyncConfigured = isCloudSyncConfigured();
const localPreviewMode = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const journeyTrips = ref<JourneyTrip[]>([]);
const activeJourneyTripId = ref('');
const activeJourneyDayId = ref('');
const journeyImportText = ref('');
const journeyImportMessage = ref('');
const journeyImportBusy = ref(false);
const journeyOcrProgress = ref(0);
const journeyNewTripTitle = ref('');
const journeyNewDayDate = ref('');
const journeyPanelMode = ref<JourneyPanelMode>('schedule');
const audioUnlocked = ref(false);
const bgmPlaying = ref(false);

let timer: number | undefined;
let secretPressTimer: number | undefined;
let planeResetTimer: number | undefined;
let planeReturnTimer: number | undefined;
let planeHomeReturnTimer: number | undefined;
let introTimer: number | undefined;
let passwordSuccessTimer: number | undefined;
let themeTransitionTimer: number | undefined;
let themePreviewTimer: number | undefined;
let milestoneTimer: number | undefined;
let weatherTimer: number | undefined;
let cloudSyncTimer: number | undefined;
let pendingCloudSync = false;
let pendingCloudFeatures = new Set<CloudFeature>();
let deferredInstallPrompt: Event | null = null;
let refreshingForUpdate = false;
let sparkleId = 0;
let burstId = 0;
let flightLandingId = 0;
let previousProgressMilestone = 0;
let lastCloudSnapshot = '';
let loadingCloudSnapshot = false;
let cloudLoadRequestId = 0;
let localCloudFallbackRequested = false;
let audioContext: AudioContext | null = null;
let bgmGain: GainNode | null = null;
let bgmFilter: BiquadFilterNode | null = null;
let bgmDelay: DelayNode | null = null;
let bgmDelayGain: GainNode | null = null;
let bgmFeedbackGain: GainNode | null = null;
let bgmTimer: number | undefined;
let flightLandingTimer: number | undefined;
let bgmOscillators: OscillatorNode[] = [];
let bgmAudio: HTMLAudioElement | null = null;
let bgmAudioFadeTimer: number | undefined;
let themeStingerAudio: HTMLAudioElement | null = null;

const TODAY_UPDATED_KIND = 'today-updated-at';
const TODAY_STORAGE_KINDS = [
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
  'ritual-complete'
];

const todayStart = computed(() => startOfDay(now.value));
const configuredStartDate = computed(() => {
  const [year, month, day] = parseDateSetting(settings.value.startDate);
  const [hours, minutes] = parseClockTime(settings.value.startTime, defaultSettings.startTime);
  return new Date(year, month - 1, day, hours, minutes, 0);
});
const configuredStartDay = computed(() => startOfDay(configuredStartDate.value));
const rawDayIndex = computed(() => Math.floor((todayStart.value.getTime() - configuredStartDay.value.getTime()) / DAY_MS));
const unlockedCount = computed(() => {
  if (todayStart.value.getTime() < configuredStartDay.value.getTime()) return 0;
  return Math.min(rawDayIndex.value + 1, journeyDays.value.length);
});
const targetDate = computed(() => {
  const [year, month, day] = parseDateSetting(settings.value.targetDate, defaultSettings.targetDate);
  const [hours, minutes] = parseClockTime(settings.value.targetTime, defaultSettings.targetTime);
  return new Date(year, month - 1, day, hours, minutes, 0);
});
const journeyDays = computed(() => createJourneyDays(configuredStartDay.value, targetDate.value));
const currentDayIndex = computed(() => clamp(rawDayIndex.value, 0, journeyDays.value.length - 1));
const targetDayStart = computed(() => startOfDay(targetDate.value));
const isMeetingDay = computed(() => todayStart.value.getTime() >= targetDayStart.value.getTime());
const countdown = computed<Countdown>(() => getCountdown(now.value, targetDate.value));
const daysUntilMeeting = computed(() => Math.ceil(Math.max(targetDate.value.getTime() - now.value.getTime(), 0) / DAY_MS));
const isArrivalMode = computed(() => !isMeetingDay.value && daysUntilMeeting.value <= 7);
const progress = computed(() => {
  const total = targetDate.value.getTime() - configuredStartDate.value.getTime();
  const elapsed = now.value.getTime() - configuredStartDate.value.getTime();
  if (total <= 0) return 1;
  return clamp(elapsed / total, 0, 1);
});
const progressPercent = computed(() => Math.round(progress.value * 100));
const deltaWeather = computed(() => {
  const candidates = [mapWeather.value.shanghai, mapWeather.value.wuxi];
  return candidates.reduce((selected, current) =>
    weatherKindPriority[current.kind] > weatherKindPriority[selected.kind] ? current : selected
  );
});
const mapCityMarkers = computed(() =>
  mapCityPins.map((city) => {
    const point = projectMapPoint(city.lat, city.lon);
    const weather = mapWeather.value[city.weatherStationId];
    return {
      ...city,
      weather,
      point,
      dotStyle: getMapPointStyle(point),
      labelStyle: getMapPointStyle(point, {
        transform:
          city.kind === 'start'
            ? 'translate(-108%, -96%)'
            : city.kind === 'hub'
              ? 'translate(-68%, -168%)'
              : 'translate(38%, -52%)'
      })
    };
  })
);
const mapWeatherRegionMarkers = computed(() =>
  mapWeatherRegions.map((region) => ({
    ...region,
    weather: deltaWeather.value
  }))
);
const mapWeatherMarkers = computed(() =>
  weatherStations.map((station) => {
    const point = projectMapPoint(station.lat, station.lon);
    return {
      ...station,
      point,
      weather: mapWeather.value[station.id]
    };
  })
);
const mapRouteStopMarkers = computed(() =>
  mapRouteStops.map((stop) => {
    const point = projectMapPoint(stop.lat, stop.lon);
    return {
      ...stop,
      style: getMapPointStyle(point, {
        transform: stop.id === 'taiwan-strait' ? 'translate(-150%, -100%)' : 'translate(130%, 150%)'
      })
    };
  })
);
const flightOverlayLandMasses = computed(() =>
  mapLandMasses.map((land) => ({
    ...land,
    path: projectGeoPathInBox(
      land.id === 'taiwan' ? taiwanOutlinePoints : chinaCoastPoints,
      viewportSize.value.width,
      viewportSize.value.height
    )
  }))
);
const flightOverlayIslandMarkers = computed(() =>
  mapIslandMarkers.map((island) => ({
    ...island,
    ...projectGeoPoint(
      island.id === 'penghu' ? 23.57 : island.id === 'kinmen' ? 24.44 : island.id === 'matsu' ? 26.16 : 30.02,
      island.id === 'penghu' ? 119.58 : island.id === 'kinmen' ? 118.32 : island.id === 'matsu' ? 119.95 : 122.1,
      viewportSize.value.width,
      viewportSize.value.height
    ),
    radius: island.radius + 1.6
  }))
);
const flightOverlayGridLines = computed(() => {
  const width = viewportSize.value.width;
  const height = viewportSize.value.height;
  return [
    { id: 'lat-24', d: `M0 ${projectGeoPoint(24, mapBounds.minLon, width, height).y} H${width}`, label: '24°N' },
    { id: 'lat-28', d: `M0 ${projectGeoPoint(28, mapBounds.minLon, width, height).y} H${width}`, label: '28°N' },
    { id: 'lat-32', d: `M0 ${projectGeoPoint(32, mapBounds.minLon, width, height).y} H${width}`, label: '32°N' },
    { id: 'lon-118', d: `M${projectGeoPoint(mapBounds.minLat, 118, width, height).x} 0 V${height}`, label: '118°E' },
    { id: 'lon-120', d: `M${projectGeoPoint(mapBounds.minLat, 120, width, height).x} 0 V${height}`, label: '120°E' },
    { id: 'lon-122', d: `M${projectGeoPoint(mapBounds.minLat, 122, width, height).x} 0 V${height}`, label: '122°E' }
  ];
});
const flightOverlayCityMarkers = computed(() =>
  mapCityPins.map((city) => ({
    ...city,
    point: projectGeoPoint(city.lat, city.lon, viewportSize.value.width, viewportSize.value.height),
    weather: mapWeather.value[city.weatherStationId]
  }))
);
const flightOverlayWeatherRegions = computed(() =>
  mapWeatherRegions.map((region) => ({
    ...region,
    path: projectGeoPathInBox(
      region.id === 'yangtze-delta' ? yangtzeDeltaBlockPoints : yangtzeDeltaBlockPoints,
      viewportSize.value.width,
      viewportSize.value.height
    ),
    weather: deltaWeather.value
  }))
);
const flightOverlayWeatherMarkers = computed(() =>
  weatherStations.map((station) => ({
    ...station,
    point: projectGeoPoint(station.lat, station.lon, viewportSize.value.width, viewportSize.value.height),
    weather: mapWeather.value[station.id]
  }))
);
const flightOverlayWaterWaveLines = computed(() => {
  const width = Math.max(1, viewportSize.value.width);
  const height = Math.max(1, viewportSize.value.height);
  const count = clamp(Math.ceil(height / 180), 4, 6);
  const spacing = height / (count + 1);
  return Array.from({ length: count }, (_, index) => {
    const y = spacing * (index + 1) + (index % 2 === 0 ? spacing * 0.08 : spacing * -0.05);
    const amplitude = Math.max(12, Math.min(24, height * (0.017 + (index % 3) * 0.003)));
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      id: `flight-water-wave-${index}`,
      d: `M${width * -0.18} ${y} C${width * 0.06} ${y - amplitude * direction}, ${width * 0.2} ${y + amplitude * 0.78 * direction}, ${width * 0.38} ${y} S${width * 0.72} ${y - amplitude * 0.72 * direction}, ${width * 0.9} ${y} S${width * 1.08} ${y + amplitude * 0.46 * direction}, ${width * 1.2} ${y - amplitude * 0.18 * direction}`,
      delay: `-${index * 5_100}ms`,
      duration: `${20 + index * 1.8}s`,
      opacity: `${0.2 + index * 0.035}`,
      strokeWidth: `${1.45 + index * 0.1}`,
      dash: `${Math.round(width * 0.16)} ${Math.round(width * 0.31)}`
    };
  });
});
const flightOverlayRoutePath = computed(() => {
  const start = projectGeoPoint(mapCityPins[0].lat, mapCityPins[0].lon, viewportSize.value.width, viewportSize.value.height);
  const controlStart = projectGeoPoint(25.1, 120.25, viewportSize.value.width, viewportSize.value.height);
  const controlEnd = projectGeoPoint(29.1, 122.15, viewportSize.value.width, viewportSize.value.height);
  const end = projectGeoPoint(mapCityPins[1].lat, mapCityPins[1].lon, viewportSize.value.width, viewportSize.value.height);
  return `M${start.x} ${start.y} C${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
});
const flightOverlayViewBox = computed(() => `0 0 ${Math.max(1, viewportSize.value.width)} ${Math.max(1, viewportSize.value.height)}`);
const activeRoutePoint = computed(() => getRoutePoint(progress.value));
const activeRoutePercent = computed(() => toMapPercent(activeRoutePoint.value));
const planeInGlobalFlight = computed(() => planeDrag.value.dragging || planeDrag.value.returning);
const showFlightGeoOverlay = computed(
  () => planeDrag.value.dragging || (planeDrag.value.returning && planeDrag.value.returnPhase === 'destination')
);
const flightMapClass = computed(() => ({
  'milestone-wave': milestoneFlash.value,
  'is-plane-excursion': planeInGlobalFlight.value
}));
const planeFlightClass = computed(() => ({
  dragging: planeDrag.value.dragging,
  returning: planeDrag.value.returning,
  [`return-${planeDrag.value.returnPhase}`]: planeDrag.value.returning,
  'global-flight': planeInGlobalFlight.value,
  [`zone-${planeDrag.value.zone}`]: true
}));
const flightOverlayClass = computed(() => ({
  [`zone-${planeDrag.value.zone}`]: true,
  [`content-${planeDrag.value.contentZone}`]: true
}));
const planeZoneLabel = computed(() => flightZoneLabels[planeDrag.value.zone]);
const planeGeoReadout = computed(
  () =>
    `${flightZoneLabels[planeDrag.value.zone]} / ${flightContentLabels[planeDrag.value.contentZone]} / ${planeDrag.value.lat.toFixed(2)}°N, ${planeDrag.value.lon.toFixed(2)}°E`
);
const planeZoneHintStyle = computed<CSSProperties>(() => ({
  left: `${planeDrag.value.screenX}px`,
  top: `${planeDrag.value.screenY}px`
}));
const planeHomeStyle = computed(() => ({
  left: `${activeRoutePercent.value.x}%`,
  top: `${activeRoutePercent.value.y}%`
}));
const planeStyle = computed(() => {
  if (planeInGlobalFlight.value) {
    return {
      left: `${planeDrag.value.screenX}px`,
      top: `${planeDrag.value.screenY}px`
    };
  }
  return {
    left: `calc(${activeRoutePercent.value.x}% + ${planeDrag.value.offsetX}px)`,
    top: `calc(${activeRoutePercent.value.y}% + ${planeDrag.value.offsetY}px)`
  };
});
const planeTrailStyle = computed(() => {
  return {
    left: `${activeRoutePercent.value.x}%`,
    top: `${activeRoutePercent.value.y}%`,
    width: `${Math.max(42, progressPercent.value * 1.05)}px`
  };
});
const routeFillStyle = computed(() => ({
  width: `${progressPercent.value}%`
}));
const draftStartDate = computed(() => {
  const [year, month, day] = parseDateSetting(settingsDraft.value.startDate);
  const [hours, minutes] = parseClockTime(settingsDraft.value.startTime, defaultSettings.startTime);
  return new Date(year, month - 1, day, hours, minutes, 0);
});
const draftTargetDate = computed(() => {
  const [year, month, day] = parseDateSetting(settingsDraft.value.targetDate, defaultSettings.targetDate);
  const [hours, minutes] = parseClockTime(settingsDraft.value.targetTime, defaultSettings.targetTime);
  return new Date(year, month - 1, day, hours, minutes, 0);
});
const targetOffsetMax = computed(() => Math.max(30, Math.ceil((draftTargetDate.value.getTime() - draftStartDate.value.getTime()) / DAY_MS) + 30));
const targetOffsetDays = computed({
  get() {
    return clamp(Math.round((startOfDay(draftTargetDate.value).getTime() - startOfDay(draftStartDate.value).getTime()) / DAY_MS), 1, targetOffsetMax.value);
  },
  set(value: number) {
    const nextDate = addDays(startOfDay(draftStartDate.value), Number(value));
    settingsDraft.value.targetDate = formatDateKey(nextDate);
  }
});
const targetTimelineStyle = computed(() => ({
  width: `${clamp((targetOffsetDays.value / targetOffsetMax.value) * 100, 0, 100)}%`
}));
const dateKey = computed(() => formatDateKey(todayStart.value));
const todayJourney = computed(() => journeyDays.value[currentDayIndex.value]);
const todayNote = computed(() =>
  isMeetingDay.value
    ? `等待結束，故事正式開始。${BOY_NAME} 和 ${GIRL_NAME}，終於可以見面了。❤️`
    : todayJourney.value.note
);
const todayTask = computed(() => todayJourney.value.task);
const selectedMood = computed(() => moodOptions.find((mood) => mood.id === selectedMoodId.value));
const selectedMoodLine = computed(() => selectedMood.value?.line ?? '今天的心情還沒有命名，先留一點空白也很好。');
const closenessLabel = computed(() => getClosenessLabel(progressPercent.value));
const secretWhisper = computed(() => pick(secretWhispers, currentDayIndex.value * 5));
const isScamRadarDay = computed(() => dateKey.value === '2026-04-19' || dateKey.value === '2026-04-20');
const radarResult = computed(() =>
  dateKey.value === '2026-04-19'
    ? '可疑程度 87%，但可愛程度也很高。建議小笨蛋粽子繼續觀察。'
    : '可疑程度 62%，真心訊號開始變強。防詐雷達暫時不拉警報。'
);
const savedMessageLine = computed(() =>
  dailyMessage.value.trim() ? dailyMessage.value.trim() : '今天還沒有寄出紙飛機留言。'
);
const suitcaseProgress = computed(() => Math.round((suitcaseChecked.value.length / suitcaseItems.length) * 100));
const checkedInToday = computed(() => checkins.value.includes(dateKey.value));
const checkinStreak = computed(() => getCheckinStreak(checkins.value, todayStart.value));
const fortuneReady = computed(() => Boolean(fortuneTitle.value && fortuneLine.value));
const moodBottleDots = computed(() =>
  moodHistory.value.slice(-42).map((entry, index) => ({
    id: `${entry}-${index}`,
    moodId: entry.split(':')[1] ?? 'sunny',
    left: `${8 + ((index * 17) % 82)}%`,
    bottom: `${8 + Math.floor(index / 7) * 12}%`
  }))
);
const timelineProgressStyle = computed(() => ({
  width: `${progressPercent.value}%`
}));
const preparationStats = computed(() => {
  const messageBoost = dailyMessage.value.trim() ? 18 : 0;
  const taskBoost = taskCompleted.value ? 22 : 0;
  const moodBoost = selectedMoodId.value ? 14 : 0;
  const suitcaseBoost = Math.round(suitcaseProgress.value * 0.35);
  const secretBoost = secretRevealed.value ? 11 : 0;
  const checkinBoost = checkedInToday.value ? 9 : 0;

  return [
    { label: '精神', value: clamp(32 + taskBoost + moodBoost + checkinBoost, 0, 100) },
    { label: '勇氣', value: clamp(28 + secretBoost + messageBoost + checkinStreak.value * 3, 0, 100) },
    { label: '期待', value: clamp(36 + suitcaseBoost + messageBoost + Math.round(progress.value * 18), 0, 100) }
  ];
});
const hiddenCardLine = computed(() => pick(hiddenCardLines, currentDayIndex.value * 3));
const todayQuestion = computed(() => pick(dailyQuestions, currentDayIndex.value * 5));
const radarChoiceResult = computed(() => radarChoices.find((choice) => choice.id === radarChoiceId.value)?.result ?? '');
const meetingChecklistProgress = computed(() =>
  Math.round((meetingChecklist.value.length / meetingChecklistItems.length) * 100)
);
const arrivalSteps = computed(() => [
  { label: '行李', done: suitcaseProgress.value >= 80 },
  { label: '心情', done: Boolean(selectedMoodId.value) },
  { label: '想說的話', done: Boolean(dailyMessage.value.trim()) },
  { label: '見面瞬間', done: meetingMoments.value.length >= 2 }
]);
const arrivalReadyPercent = computed(() => Math.round((arrivalSteps.value.filter((step) => step.done).length / arrivalSteps.value.length) * 100));
const theaterLights = computed(() =>
  Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: `${6 + ((index * 17) % 88)}%`,
    top: `${10 + ((index * 23) % 76)}%`,
    delay: `${(index % 6) * 160}ms`
  }))
);
const openingStars = computed(() =>
  Array.from({ length: 32 }, (_, index) => ({
    id: index,
    left: `${4 + ((index * 29) % 92)}%`,
    top: `${6 + ((index * 37) % 86)}%`,
    delay: `${(index % 9) * 130}ms`,
    size: `${3 + (index % 4)}px`
  }))
);
const backgroundMotes = computed(() =>
  Array.from({ length: 22 }, (_, index) => ({
    id: index,
    left: `${3 + ((index * 31) % 94)}%`,
    top: `${4 + ((index * 19) % 90)}%`,
    delay: `${(index % 11) * 240}ms`,
    size: `${4 + (index % 5)}px`
  }))
);
const backgroundBeams = computed(() =>
  Array.from({ length: 5 }, (_, index) => ({
    id: index,
    left: `${8 + index * 21}%`,
    delay: `${index * 420}ms`
  }))
);
const secretCodeList = computed(() => [...defaultSecretCodes, ...customSecretCodes.value]);
const photoFilmstrip = computed(() =>
  memoryPhotos.value.map((photo, index) => ({
    ...photo,
    dateLabel: formatMonthDay(addDays(configuredStartDay.value, index)),
    rotate: `${(index % 5) - 2}deg`
  }))
);
const displayBoyName = computed(() => settings.value.boyName.trim() || BOY_NAME);
const displayGirlName = computed(() => settings.value.girlName.trim() || GIRL_NAME);
const startDateLabel = computed(() => `${settings.value.startDate} ${settings.value.startTime}`);
const targetDateLabel = computed(() => `${settings.value.targetDate} ${settings.value.targetTime}`);
const targetDateShortLabel = computed(() => settings.value.targetDate.replace(/-/g, '.'));
const themeClass = computed(() => `theme-${previewTheme.value || settings.value.theme}`);
const themePreviewing = computed(() => Boolean(previewTheme.value));
const openingThemeLabel = computed(() => {
  if (settings.value.theme === 'mint') return '清風啟程';
  if (settings.value.theme === 'night') return '夜航啟動';
  return '暖光啟程';
});
const openingChapters = computed(() =>
  introMode.value === 'first'
    ? ['暗號通過', '同步回憶', '校準航線', '打開今天']
    : ['歡迎回來', '更新今日', '校準距離', '回到倒數']
);
const onboardingSteps = computed(() => [
  { title: '換氛圍', text: '右上角可以直接去切換暖光、清風或夜航。' },
  { title: '設定日期', text: '準備頁可以拖曳時間線，快速調整目標日期。' },
  { title: '今日儀式', text: '每天進今日頁，留下一個心情和一點光。' }
]);
const cloudLoadingSteps = computed(() => [
  { label: '確認暗號', done: Boolean(cloudToken.value) },
  { label: '讀取設定', done: cloudStatus.value !== '正在載入雲端資料...' },
  { label: '整理回憶', done: memoryPhotos.value.length > 0 || cloudStatus.value === '雲端還沒有資料，會用目前裝置建立第一份資料' }
]);
const isIosDevice = computed(() => {
  const platform = navigator.platform || '';
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
});
const pwaInstallGuide = computed(() => {
  if (installedDisplayMode.value) {
    return {
      title: '已經像 App 一樣打開',
      text: '現在是主畫面模式，可以直接離線回到倒數。',
      steps: [] as string[]
    };
  }

  if (installReady.value) {
    return {
      title: '可以安裝到手機',
      text: '這個瀏覽器支援一鍵安裝，按下方按鈕就能加入桌面。',
      steps: [] as string[]
    };
  }

  if (isIosDevice.value) {
    return {
      title: 'iPhone / iPad 需要手動加入',
      text: 'Safari 不會自動彈出安裝提示，請用分享選單加入主畫面。',
      steps: ['點 Safari 底部分享按鈕', '選擇「加入主畫面」', '按「加入」完成安裝']
    };
  }

  return {
    title: '瀏覽器沒有開放安裝提示',
    text: '可以從瀏覽器選單尋找「安裝 App」或「加入主畫面」。',
    steps: ['確認網址使用 HTTPS', '用 Chrome 或 Edge 開啟', '從瀏覽器選單安裝']
  };
});
const showPasswordInstallHint = computed(() => isIosDevice.value && !installedDisplayMode.value && !cloudLoadingActive.value);
const ritualSteps = computed(() => [
  { id: 'open', label: '打開今日文案', done: ritualOpened.value },
  { id: 'fortune', label: '抽一張今日小籤', done: fortuneReady.value },
  { id: 'mood', label: '收進一顆心情光點', done: Boolean(selectedMoodId.value) },
  { id: 'task', label: '完成今日小任務', done: taskCompleted.value }
]);
const ritualProgress = computed(() =>
  Math.round((ritualSteps.value.filter((step) => step.done).length / ritualSteps.value.length) * 100)
);
const dailyReceipt = computed(() =>
  [
    `第一次見面倒數｜${dateKey.value}`,
    `${displayGirlName.value} → ${displayBoyName.value}`,
    `靠近度：${progressPercent.value}%`,
    `今日文案：${todayNote.value}`,
    `今日小籤：${fortuneReady.value ? `${fortuneTitle.value}｜${fortuneLine.value}` : '還沒抽，留給一點未知'}`,
    `心情：${selectedMood.value?.label ?? '還沒命名'}`,
    `任務：${taskCompleted.value ? '已完成' : todayTask.value}`
  ].join('\n')
);
const meetingSummary = computed(() => [
  { label: '已解鎖膠囊', value: `${unlockedCount.value}/${journeyDays.value.length}` },
  { label: '連續打卡', value: `${checkinStreak.value} 天` },
  { label: '回憶照片', value: `${memoryPhotos.value.length} 張` },
  { label: '完成願望', value: `${wishes.value.filter((wish) => wish.done).length}/${wishes.value.length}` }
]);
const meetingSummaryLine = computed(() => {
  const moodLabel = selectedMood.value?.label ?? '未命名';
  return `目前靠近度 ${progressPercent.value}%，心情是「${moodLabel}」，已完成 ${meetingMoments.value.length} 個見面前想保留的瞬間。`;
});
const periodName = '粽子不痛';
const sortedPeriodRecords = computed(() =>
  [...periodRecords.value].sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime())
);
const latestPeriodRecord = computed(() => sortedPeriodRecords.value[sortedPeriodRecords.value.length - 1] ?? null);
const averagePeriodCycleDays = computed(() => {
  const records = sortedPeriodRecords.value;
  if (records.length < 2) return 28;
  const gaps = records.slice(1).map((record, index) =>
    Math.round((parseLocalDate(record.startDate).getTime() - parseLocalDate(records[index].startDate).getTime()) / DAY_MS)
  );
  const validGaps = gaps.filter((gap) => gap >= 18 && gap <= 45);
  if (!validGaps.length) return 28;
  return Math.round(validGaps.reduce((sum, gap) => sum + gap, 0) / validGaps.length);
});
const periodPredictions = computed(() => {
  const latest = latestPeriodRecord.value;
  if (!latest) return [];
  const cycles = Array.from(new Set([averagePeriodCycleDays.value, 28, 30, 32])).sort((a, b) => a - b);
  const latestStart = parseLocalDate(latest.startDate);
  return cycles.map((cycleDays) => {
    const nextStart = addDays(latestStart, cycleDays);
    return {
      cycleDays,
      nextDate: formatPeriodDate(nextStart),
      nextDateKey: formatDateKey(nextStart),
      followingDate: formatPeriodDate(addDays(nextStart, cycleDays)),
      isLikely: cycleDays === averagePeriodCycleDays.value
    };
  });
});
const nextPeriodPrediction = computed(() => periodPredictions.value.find((item) => item.isLikely) ?? periodPredictions.value[0] ?? null);
const periodStatusLabel = computed(() => {
  const latest = latestPeriodRecord.value;
  if (!latest) return '還沒有紀錄';
  const start = parseLocalDate(latest.startDate);
  const explicitEnd = latest.endDate ? parseLocalDate(latest.endDate) : null;
  const end = explicitEnd ?? addDays(start, 4);
  const today = todayStart.value;
  if (today.getTime() >= start.getTime() && today.getTime() <= end.getTime()) {
    return periodName;
  }
  const next = nextPeriodPrediction.value;
  return next ? `下次約 ${next.nextDate}` : '等待新紀錄';
});
const periodDaysUntilNext = computed(() => {
  const next = nextPeriodPrediction.value;
  if (!next) return null;
  return Math.ceil((parseLocalDate(next.nextDateKey).getTime() - todayStart.value.getTime()) / DAY_MS);
});
const periodSummaryCards = computed(() => [
  { label: '最近一次', value: latestPeriodRecord.value ? formatPeriodDate(parseLocalDate(latestPeriodRecord.value.startDate)) : '--' },
  { label: '平均週期', value: `${averagePeriodCycleDays.value} 天` },
  { label: '狀態', value: periodStatusLabel.value },
  {
    label: '距離預估',
    value:
      periodDaysUntilNext.value === null
        ? '--'
        : periodDaysUntilNext.value <= 0
          ? '可能已到'
          : `${periodDaysUntilNext.value} 天`
  }
]);
const periodTimelineRecords = computed(() =>
  sortedPeriodRecords.value.map((record, index, records) => {
    const previous = records[index - 1];
    const cycleDays = previous
      ? Math.round((parseLocalDate(record.startDate).getTime() - parseLocalDate(previous.startDate).getTime()) / DAY_MS)
      : null;
    return {
      ...record,
      startLabel: formatPeriodDate(parseLocalDate(record.startDate)),
      endLabel: record.endDate ? formatPeriodDate(parseLocalDate(record.endDate)) : '',
      cycleDays
    };
  }).reverse()
);
const periodDisplayName = '粽子不痛';
const periodFlowOptions: Array<{ id: PeriodRecord['flow']; label: string; short: string }> = [
  { id: 'spotting', label: '點狀', short: '點' },
  { id: 'light', label: '量少', short: '少' },
  { id: 'medium', label: '普通', short: '中' },
  { id: 'heavy', label: '量多', short: '多' }
];
const periodSymptomOptions = [
  { id: 'cramps', label: '腹痛' },
  { id: 'backache', label: '腰痠' },
  { id: 'headache', label: '頭痛' },
  { id: 'bloating', label: '脹氣' },
  { id: 'tender', label: '胸悶' },
  { id: 'acne', label: '長痘' },
  { id: 'fatigue', label: '疲倦' },
  { id: 'craving', label: '嘴饞' }
];
const periodMoodOptions = [
  { id: 'stable', label: '穩定' },
  { id: 'sensitive', label: '敏感' },
  { id: 'low', label: '低落' },
  { id: 'irritable', label: '煩躁' },
  { id: 'sleepy', label: '想睡' },
  { id: 'calm', label: '平靜' }
];
const periodCareOptions = [
  { id: 'warm', label: '熱敷' },
  { id: 'water', label: '補水' },
  { id: 'rest', label: '早點休息' },
  { id: 'medicine', label: '止痛藥' },
  { id: 'light-meal', label: '清淡飲食' }
];
const periodCycleGaps = computed(() => {
  const records = sortedPeriodRecords.value;
  return records.slice(1)
    .map((record, index) =>
      Math.round((parseLocalDate(record.startDate).getTime() - parseLocalDate(records[index].startDate).getTime()) / DAY_MS)
    )
    .filter((gap) => gap >= 18 && gap <= 45);
});
const professionalPeriodLengthDays = computed(() => {
  const lengths = sortedPeriodRecords.value.map((record) => {
    const start = parseLocalDate(record.startDate);
    const end = record.endDate ? parseLocalDate(record.endDate) : addDays(start, 4);
    return clamp(Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1, 1, 10);
  });
  if (!lengths.length) return 5;
  return Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length);
});
const periodCycleStats = computed(() => {
  const gaps = periodCycleGaps.value;
  const average = averagePeriodCycleDays.value;
  const shortest = gaps.length ? Math.min(...gaps) : average;
  const longest = gaps.length ? Math.max(...gaps) : average;
  const variation = longest - shortest;
  const regularity = gaps.length < 2 ? '資料累積中' : variation <= 3 ? '規律' : variation <= 7 ? '略有浮動' : '變動較大';
  return {
    average,
    shortest,
    longest,
    variation,
    regularity,
    count: gaps.length
  };
});
const professionalPeriodPredictions = computed(() => {
  const latest = latestPeriodRecord.value;
  if (!latest) return [];
  const cycles = Array.from(new Set([
    averagePeriodCycleDays.value,
    periodCycleStats.value.shortest,
    periodCycleStats.value.longest,
    28,
    30,
    32
  ])).filter((cycleDays) => cycleDays >= 18 && cycleDays <= 45).sort((a, b) => a - b);
  const latestStart = parseLocalDate(latest.startDate);
  return cycles.map((cycleDays) => {
    const nextStart = addDays(latestStart, cycleDays);
    const nextEnd = addDays(nextStart, Math.max(professionalPeriodLengthDays.value - 1, 0));
    const ovulationDate = addDays(nextStart, -14);
    const fertileStart = addDays(ovulationDate, -5);
    return {
      cycleDays,
      nextDate: formatPeriodDate(nextStart),
      nextDateKey: formatDateKey(nextStart),
      endDate: formatPeriodDate(nextEnd),
      followingDate: formatPeriodDate(addDays(nextStart, cycleDays)),
      pmsStart: formatPeriodDate(addDays(nextStart, -7)),
      fertileWindow: `${formatPeriodDate(fertileStart)}-${formatPeriodDate(ovulationDate)}`,
      ovulationDate: formatPeriodDate(ovulationDate),
      isLikely: cycleDays === averagePeriodCycleDays.value
    };
  });
});
const professionalNextPeriodPrediction = computed(() =>
  professionalPeriodPredictions.value.find((item) => item.isLikely) ?? professionalPeriodPredictions.value[0] ?? null
);
const professionalPeriodDaysUntilNext = computed(() => {
  const next = professionalNextPeriodPrediction.value;
  if (!next) return null;
  return Math.ceil((parseLocalDate(next.nextDateKey).getTime() - todayStart.value.getTime()) / DAY_MS);
});
const periodConfidenceLabel = computed(() => {
  if (periodCycleStats.value.count < 2) return '資料累積中';
  if (periodCycleStats.value.variation <= 3) return '高';
  if (periodCycleStats.value.variation <= 7) return '中';
  return '低';
});
const professionalPeriodPhase = computed(() => {
  const today = todayStart.value;
  const latest = latestPeriodRecord.value;
  if (latest) {
    const start = parseLocalDate(latest.startDate);
    const end = latest.endDate ? parseLocalDate(latest.endDate) : addDays(start, professionalPeriodLengthDays.value - 1);
    if (today.getTime() >= start.getTime() && today.getTime() <= end.getTime()) {
      return { label: periodDisplayName, tone: 'period', copy: '今天以舒服、保暖、低壓行程為主。' };
    }
  }
  const next = professionalNextPeriodPrediction.value;
  if (!next) return { label: '等待紀錄', tone: 'quiet', copy: '再多記幾次，預測會更貼近她的節奏。' };
  const nextStart = parseLocalDate(next.nextDateKey);
  const ovulation = addDays(nextStart, -14);
  const fertileStart = addDays(ovulation, -5);
  if (formatDateKey(today) === formatDateKey(ovulation)) {
    return { label: '預估排卵日', tone: 'ovulation', copy: '這只是週期推估，不能當避孕或受孕的唯一依據。' };
  }
  if (today.getTime() >= fertileStart.getTime() && today.getTime() <= ovulation.getTime()) {
    return { label: '預估受孕窗', tone: 'fertile', copy: '成熟 app 常用 6 天受孕窗表示，但仍要搭配實際身體訊號。' };
  }
  const days = professionalPeriodDaysUntilNext.value;
  if (days !== null && days >= 0 && days <= 7) {
    return { label: '經前照護期', tone: 'pms', copy: '可以提前準備止痛、熱敷和不趕行程的安排。' };
  }
  return { label: '一般週期日', tone: 'quiet', copy: '持續累積症狀與心情，之後比較容易看出個人模式。' };
});
const professionalPeriodSummaryCards = computed(() => [
  { label: '最近一次', value: latestPeriodRecord.value ? formatPeriodDate(parseLocalDate(latestPeriodRecord.value.startDate)) : '--' },
  { label: '平均週期', value: `${averagePeriodCycleDays.value} 天` },
  { label: '平均經期', value: `${professionalPeriodLengthDays.value} 天` },
  { label: '預測信心', value: periodConfidenceLabel.value },
  { label: '規律度', value: periodCycleStats.value.regularity },
  {
    label: '距離預估',
    value:
      professionalPeriodDaysUntilNext.value === null
        ? '--'
        : professionalPeriodDaysUntilNext.value <= 0
          ? '可能已到'
          : `${professionalPeriodDaysUntilNext.value} 天`
  }
]);
const editingPeriodRecord = computed(() => periodRecords.value.find((record) => record.id === editingPeriodRecordId.value) ?? null);
const periodRecordFormTitle = computed(() => editingPeriodRecord.value ? '修改這筆狀況' : '把這次狀況記清楚');
const periodRecordSubmitLabel = computed(() => editingPeriodRecord.value ? '更新紀錄' : '儲存紀錄');
const periodCalendarStart = computed(() => addDays(startOfDay(todayStart.value), periodCalendarOffset.value * 28));
const periodCalendarRangeLabel = computed(() => {
  const start = periodCalendarStart.value;
  const end = addDays(start, 41);
  return `${formatPeriodDate(start)} - ${formatPeriodDate(end)}`;
});
const periodReminderCards = computed(() => {
  const next = professionalNextPeriodPrediction.value;
  if (!next) return [];
  const nextStart = parseLocalDate(next.nextDateKey);
  const toStatus = (date: Date) => {
    const days = Math.ceil((date.getTime() - todayStart.value.getTime()) / DAY_MS);
    if (days < 0) return '已過';
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    return `${days} 天後`;
  };
  return [
    {
      label: '經前照護',
      date: formatPeriodDate(addDays(nextStart, -7)),
      status: toStatus(addDays(nextStart, -7)),
      detail: '把止痛、熱敷、早睡和低壓行程先排進去。',
      tone: 'care'
    },
    {
      label: '用品準備',
      date: formatPeriodDate(addDays(nextStart, -3)),
      status: toStatus(addDays(nextStart, -3)),
      detail: '檢查衛生用品、暖暖包與外出備品。',
      tone: 'supply'
    },
    {
      label: '預估開始',
      date: next.nextDate,
      status: toStatus(nextStart),
      detail: '若有提前或延後，記一筆會讓下次更準。',
      tone: 'start'
    },
    {
      label: '延後觀察',
      date: formatPeriodDate(addDays(nextStart, 7)),
      status: toStatus(addDays(nextStart, 7)),
      detail: '超過一週仍沒來，留意壓力、作息或懷孕可能。',
      tone: 'watch'
    }
  ];
});
const periodAnomalyAlerts = computed(() => {
  const alerts: Array<{ title: string; detail: string; tone: string }> = [];
  const latest = latestPeriodRecord.value;
  const latestStart = latest ? parseLocalDate(latest.startDate) : null;
  const latestEnd = latest && latest.endDate ? parseLocalDate(latest.endDate) : null;
  const latestLength = latest && latestEnd && latestStart
    ? Math.round((latestEnd.getTime() - latestStart.getTime()) / DAY_MS) + 1
    : 0;
  const lastGap = periodCycleGaps.value[periodCycleGaps.value.length - 1] ?? null;
  const daysUntilNext = professionalPeriodDaysUntilNext.value;

  if (daysUntilNext !== null && daysUntilNext < -7) {
    alerts.push({
      title: '預估日已超過一週',
      detail: '如果有懷孕可能、壓力很大或身體不舒服，建議優先確認狀況。',
      tone: 'watch'
    });
  }
  if (lastGap !== null && (lastGap < 21 || lastGap > 35)) {
    alerts.push({
      title: `最近週期是 ${lastGap} 天`,
      detail: '和常見 21-35 天範圍不同，先記下作息、壓力或藥物變化。',
      tone: 'cycle'
    });
  }
  if (periodCycleStats.value.count >= 2 && periodCycleStats.value.variation > 9) {
    alerts.push({
      title: '週期浮動變大',
      detail: `目前最短 ${periodCycleStats.value.shortest} 天、最長 ${periodCycleStats.value.longest} 天，可以多觀察幾次。`,
      tone: 'cycle'
    });
  }
  if (latest && latest.painLevel >= 7) {
    alerts.push({
      title: '疼痛分數偏高',
      detail: '如果止痛後仍影響生活，或突然比平常痛很多，建議詢問醫師。',
      tone: 'pain'
    });
  }
  if (latest && latest.flow === 'heavy' && latestLength >= 7) {
    alerts.push({
      title: '量多且持續較久',
      detail: '若伴隨頭暈、血塊很多或出血超過一週，請考慮就醫確認。',
      tone: 'flow'
    });
  } else if (latestLength > 8) {
    alerts.push({
      title: '經期天數偏長',
      detail: `這次紀錄 ${latestLength} 天，若和以往差很多可以先標記並觀察。`,
      tone: 'flow'
    });
  }

  return alerts.slice(0, 3);
});
const periodCareSuggestionCards = computed(() => {
  const latest = latestPeriodRecord.value;
  const suggestions = [
    professionalPeriodPhase.value.tone === 'pms'
      ? { title: '把行程降速', detail: '接近預估開始日，適合少排奔波、先準備熱敷和止痛。' }
      : professionalPeriodPhase.value.tone === 'period'
        ? { title: '今天以舒服優先', detail: '補水、保暖、清淡飲食，疼痛升高時就不要硬撐。' }
        : professionalPeriodPhase.value.tone === 'fertile' || professionalPeriodPhase.value.tone === 'ovulation'
          ? { title: '記錄身體訊號', detail: '分泌物、體溫、腹部感覺都可以補一點，之後更好比對。' }
          : { title: '維持基本節奏', detail: '睡眠、飲水和活動量穩定，會讓後面的週期判讀更清楚。' },
    latest?.painLevel && latest.painLevel >= 5
      ? { title: '疼痛備案', detail: '把有效的止痛方式寫進備註，下次經前照護會更容易準備。' }
      : { title: '備好小物', detail: '外出包可以固定放 1-2 份用品，避免預估日臨時緊張。' },
    latest?.flow === 'heavy'
      ? { title: '量多日提醒', detail: '用品更換頻率、頭暈感和血塊大小可以特別留意。' }
      : { title: '補一點感受', detail: '心情和症狀比日期更能看出個人模式，簡短點選就夠。' }
  ];
  return suggestions;
});
const periodTrendRows = computed(() =>
  sortedPeriodRecords.value.slice(-6).map((record, index, records) => {
    const previous = index > 0 ? records[index - 1] : null;
    const start = parseLocalDate(record.startDate);
    const end = record.endDate ? parseLocalDate(record.endDate) : addDays(start, professionalPeriodLengthDays.value - 1);
    const cycleDays = previous
      ? Math.round((start.getTime() - parseLocalDate(previous.startDate).getTime()) / DAY_MS)
      : null;
    const periodLength = clamp(Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1, 1, 12);
    return {
      id: record.id,
      label: formatPeriodDate(start),
      cycleDays,
      periodLength,
      painLevel: clamp(Number(record.painLevel ?? 0), 0, 10),
      cycleWidth: `${cycleDays ? clamp(Math.round((cycleDays / 45) * 100), 26, 100) : 18}%`,
      lengthWidth: `${clamp(Math.round((periodLength / 10) * 100), 18, 100)}%`,
      painWidth: `${clamp(Math.round((clamp(Number(record.painLevel ?? 0), 0, 10) / 10) * 100), 8, 100)}%`
    };
  }).reverse()
);
const professionalPeriodCalendarDays = computed(() => {
  const start = periodCalendarStart.value;
  const next = professionalNextPeriodPrediction.value;
  const predictedStart = next ? parseLocalDate(next.nextDateKey) : null;
  const predictedEnd = predictedStart ? addDays(predictedStart, professionalPeriodLengthDays.value - 1) : null;
  const ovulation = predictedStart ? addDays(predictedStart, -14) : null;
  const fertileStart = ovulation ? addDays(ovulation, -5) : null;

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    const key = formatDateKey(date);
    const actualRecord = sortedPeriodRecords.value.find((record) => {
      const recordStart = parseLocalDate(record.startDate);
      const recordEnd = record.endDate ? parseLocalDate(record.endDate) : addDays(recordStart, professionalPeriodLengthDays.value - 1);
      return date.getTime() >= recordStart.getTime() && date.getTime() <= recordEnd.getTime();
    });
    const isPredictedPeriod = Boolean(predictedStart && predictedEnd && date.getTime() >= predictedStart.getTime() && date.getTime() <= predictedEnd.getTime());
    const isFertile = Boolean(fertileStart && ovulation && date.getTime() >= fertileStart.getTime() && date.getTime() <= ovulation.getTime());
    const isOvulation = Boolean(ovulation && key === formatDateKey(ovulation));
    const isMonthStart = date.getDate() === 1;
    const monthLabel = index === 0 || isMonthStart ? `${date.getMonth() + 1}月` : '';
    const markers = [
      actualRecord ? 'recorded' : '',
      !actualRecord && isPredictedPeriod ? 'predicted' : '',
      isFertile ? 'fertile' : '',
      isOvulation ? 'ovulation' : '',
      isMonthStart ? 'month-start' : '',
      key === dateKey.value ? 'today' : ''
    ].filter(Boolean);
    return {
      key,
      dayNumber: date.getDate(),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      monthLabel,
      label: actualRecord ? periodDisplayName : isOvulation ? '排卵' : isFertile ? '受孕窗' : isPredictedPeriod ? '預估' : '',
      classes: markers.map((marker) => `is-${marker}`)
    };
  });
});
const professionalPeriodInsightCards = computed(() => {
  const records = sortedPeriodRecords.value;
  const symptomCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();
  records.forEach((record) => {
    (record.symptoms ?? []).forEach((id) => symptomCounts.set(id, (symptomCounts.get(id) ?? 0) + 1));
    (record.moods ?? []).forEach((id) => moodCounts.set(id, (moodCounts.get(id) ?? 0) + 1));
  });
  const topSymptomId = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const topMoodId = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const painRecords = records.filter((record) => record.painLevel > 0);
  const averagePain = painRecords.length
    ? Math.round((painRecords.reduce((sum, record) => sum + record.painLevel, 0) / painRecords.length) * 10) / 10
    : 0;
  return [
    { label: '常見症狀', value: periodSymptomOptions.find((item) => item.id === topSymptomId)?.label ?? '尚未累積' },
    { label: '常見心情', value: periodMoodOptions.find((item) => item.id === topMoodId)?.label ?? '尚未累積' },
    { label: '平均疼痛', value: averagePain ? `${averagePain}/10` : '尚未紀錄' },
    { label: '週期範圍', value: `${periodCycleStats.value.shortest}-${periodCycleStats.value.longest} 天` }
  ];
});
const professionalPeriodTimelineRecords = computed(() =>
  sortedPeriodRecords.value.map((record, index, records) => {
    const previous = records[index - 1];
    const cycleDays = previous
      ? Math.round((parseLocalDate(record.startDate).getTime() - parseLocalDate(previous.startDate).getTime()) / DAY_MS)
      : null;
    const flowLabel = periodFlowOptions.find((item) => item.id === record.flow)?.label ?? '未記錄';
    const symptomLabels = (record.symptoms ?? [])
      .map((id) => periodSymptomOptions.find((item) => item.id === id)?.label)
      .filter(Boolean)
      .join('、');
    const moodLabels = (record.moods ?? [])
      .map((id) => periodMoodOptions.find((item) => item.id === id)?.label)
      .filter(Boolean)
      .join('、');
    return {
      ...record,
      startLabel: formatPeriodDate(parseLocalDate(record.startDate)),
      endLabel: record.endDate ? formatPeriodDate(parseLocalDate(record.endDate)) : '',
      cycleDays,
      flowLabel,
      symptomLabels,
      moodLabels
    };
  }).reverse()
);
const pendingImportSummary = computed(() => {
  if (!pendingImport.value) return '';
  return `準備${importMode.value === 'replace' ? '覆蓋' : '合併'}：${Object.keys(pendingImport.value.localStorage).length} 筆紀錄、${pendingImport.value.photos.length} 張照片。`;
});
const sceneStyle = computed(() => ({
  '--scene-tilt-x': `${sceneTilt.value.x}deg`,
  '--scene-tilt-y': `${sceneTilt.value.y}deg`
}));
const activeTabIndex = computed(() => {
  const tabs: ActiveTab[] = ['countdown', 'today', 'journey', 'period', 'memories', 'prepare'];
  return Math.max(tabs.indexOf(activeTab.value), 0);
});
const navIndicatorStyle = computed(() => ({
  transform: `translateX(calc(${activeTabIndex.value * 100}% + ${activeTabIndex.value * 6}px))`
}));

const visibleCapsules = computed(() =>
  journeyDays.value.map((day, index) => {
    const unlockDate = addDays(configuredStartDay.value, index);
    const daysToUnlock = Math.max(Math.ceil((unlockDate.getTime() - todayStart.value.getTime()) / DAY_MS), 1);
    const customNote = memoryCapsuleNotes.value.find((note) => note.index === index)?.text.trim();
    return {
      text: customNote || day.capsule,
      lockedText: `${day.dateLabel} 的膠囊還沒到時間，還有 ${daysToUnlock} 天會自己打開。`,
      dateLabel: day.dateLabel,
      index,
      unlocked: index < unlockedCount.value,
      flipped: flippedCapsules.value.includes(index),
      customized: Boolean(customNote),
      editing: editingCapsuleIndex.value === index
    };
  })
);
const visibleCapsulesDisplay = computed(() => {
  if (capsuleShowAll.value) return visibleCapsules.value;
  const unlocked = visibleCapsules.value.filter((capsule) => capsule.unlocked);
  const recent = unlocked.slice(Math.max(unlocked.length - 7, 0));
  const lockedPreview = visibleCapsules.value.find((capsule) => !capsule.unlocked);
  return lockedPreview ? [...recent, lockedPreview] : recent;
});
const completedWishCount = computed(() => wishes.value.filter((wish) => wish.done).length);
const activeJourneyTrip = computed(() => {
  if (!journeyTrips.value.length) return null;
  return (
    journeyTrips.value.find((trip) => trip.id === activeJourneyTripId.value) ??
    getNearestJourneyTrip(journeyTrips.value, todayStart.value)
  );
});
const activeJourneyDays = computed(() => activeJourneyTrip.value?.days ?? []);
const activeJourneyDay = computed(() => {
  const trip = activeJourneyTrip.value;
  if (!trip?.days.length) return null;
  return (
    trip.days.find((day) => day.id === activeJourneyDayId.value) ??
    trip.days.find((day) => day.date === dateKey.value) ??
    trip.days.find((day) => new Date(`${day.date}T00:00:00`).getTime() >= todayStart.value.getTime()) ??
    trip.days[0]
  );
});
const activeJourneyDayIndex = computed(() =>
  activeJourneyDay.value ? Math.max(activeJourneyDays.value.findIndex((day) => day.id === activeJourneyDay.value?.id), 0) : 0
);
const activeJourneyDayEntries = computed(() => {
  const day = activeJourneyDay.value;
  if (!day) return [];
  return [...day.entries].sort((left, right) => {
    const leftTime = parseTimeSortValue(left.time);
    const rightTime = parseTimeSortValue(right.time);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return day.entries.indexOf(left) - day.entries.indexOf(right);
  });
});
const activeJourneyScheduleSections = computed<JourneyScheduleSection[]>(() => {
  const sections = [
    { id: 'morning', label: '上午', caption: '00:00 - 11:59' },
    { id: 'afternoon', label: '下午', caption: '12:00 - 17:59' },
    { id: 'evening', label: '晚上', caption: '18:00 - 23:59' },
    { id: 'unscheduled', label: '待安排', caption: '還沒有時間' }
  ];
  return sections
    .map((section) => ({
      ...section,
      entries: activeJourneyDayEntries.value.filter((entry) => getJourneyEntrySectionId(entry) === section.id)
    }))
    .filter((section) => section.entries.length);
});
const journeyTripOptions = computed(() =>
  [...journeyTrips.value].sort((left, right) => {
    const leftDistance = Math.abs(parseDateToDay(left.startDate).getTime() - todayStart.value.getTime());
    const rightDistance = Math.abs(parseDateToDay(right.startDate).getTime() - todayStart.value.getTime());
    return leftDistance - rightDistance;
  })
);
const activeJourneyProgress = computed(() => {
  const trip = activeJourneyTrip.value;
  if (!trip) return 0;
  const entries = trip.days.flatMap((day) => day.entries);
  if (!entries.length) return 0;
  return Math.round((entries.filter((entry) => entry.done).length / entries.length) * 100);
});
const activeJourneyDateRange = computed(() => {
  const trip = activeJourneyTrip.value;
  return trip ? `${formatJourneyDateLabel(trip.startDate)} - ${formatJourneyDateLabel(trip.endDate)}` : '';
});
const activeJourneyMonthLabel = computed(() => {
  const day = activeJourneyDay.value ?? activeJourneyDays.value[0];
  if (!day) return '';
  const date = parseDateToDay(day.date);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
});
const activeJourneyDayMeta = computed(() => {
  const day = activeJourneyDay.value;
  if (!day) return { entries: 0, done: 0, transport: 0, stay: '', city: '' };
  return {
    entries: day.entries.length,
    done: day.entries.filter((entry) => entry.done).length,
    transport: day.entries.filter((entry) => entry.transport.trim()).length,
    stay: day.stay,
    city: day.city
  };
});
const journeyDayRailItems = computed(() =>
  activeJourneyDays.value.map((day, index) => {
    const done = day.entries.filter((entry) => entry.done).length;
    const total = day.entries.length;
    return {
      id: day.id,
      dayLabel: day.dayLabel || `Day ${index + 1}`,
      dateLabel: formatJourneyDateLabel(day.date),
      city: day.city || '未設定城市',
      stay: day.stay || '未設定住宿',
      done,
      total,
      isActive: activeJourneyDay.value?.id === day.id,
      isToday: formatDateKey(parseDateToDay(day.date)) === dateKey.value
    };
  })
);
const activeJourneyRouteLabel = computed(() => {
  const cities = activeJourneyDays.value
    .map((day) => day.city.trim())
    .filter(Boolean)
    .filter((city, index, list) => list.indexOf(city) === index);
  return cities.length ? cities.join(' → ') : '先補上每日城市';
});
const activeJourneyNextEntry = computed(() => {
  const entry = activeJourneyDayEntries.value.find((item) => !item.done) ?? activeJourneyDayEntries.value[0];
  if (!entry) return '尚未安排';
  return `${entry.time || '--:--'} ${entry.plan || '未命名行程'}`;
});
const journeySummaryStats = computed(() => {
  const trip = activeJourneyTrip.value;
  const entries = trip?.days.flatMap((day) => day.entries) ?? [];
  const stays = new Set((trip?.days ?? []).map((day) => day.stay).filter((stay) => stay && stay !== '-'));
  const transports = entries.filter((entry) => entry.transport.trim()).length;
  return [
    { label: '天數', value: `${trip?.days.length ?? 0}` },
    { label: '行程', value: `${entries.length}` },
    { label: '交通', value: `${transports}` },
    { label: '住宿', value: `${stays.size}` }
  ];
});
const journeyCalendarCells = computed(() => {
  const days = activeJourneyDays.value;
  if (!days.length) return [];
  const firstDay = parseDateToDay(days[0].date);
  const leading = (firstDay.getDay() + 6) % 7;
  const cells: Array<{
    id: string;
    date: string;
    dayNumber: number;
    label: string;
    city: string;
    isActive: boolean;
    isToday: boolean;
    isBlank: boolean;
    done: number;
    total: number;
  }> = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push({
      id: `blank-${index}`,
      date: '',
      dayNumber: 0,
      label: '',
      city: '',
      isActive: false,
      isToday: false,
      isBlank: true,
      done: 0,
      total: 0
    });
  }
  days.forEach((day, index) => {
    const date = parseDateToDay(day.date);
    cells.push({
      id: day.id,
      date: day.date,
      dayNumber: date.getDate(),
      label: day.dayLabel || `Day ${index + 1}`,
      city: day.city,
      isActive: activeJourneyDay.value?.id === day.id,
      isToday: formatDateKey(date) === dateKey.value,
      isBlank: false,
      done: day.entries.filter((entry) => entry.done).length,
      total: day.entries.length
    });
  });
  return cells;
});
const journeyTripCountdownLabel = computed(() => {
  const trip = activeJourneyTrip.value;
  if (!trip) return '尚未建立旅程';
  const start = parseDateToDay(trip.startDate);
  const end = parseDateToDay(trip.endDate);
  if (todayStart.value.getTime() < start.getTime()) {
    const days = Math.ceil((start.getTime() - todayStart.value.getTime()) / DAY_MS);
    return `${days} 天後出發`;
  }
  if (todayStart.value.getTime() <= end.getTime()) return '旅程進行中';
  return '旅程已完成';
});
const journeyImportHelp = computed(() =>
  journeyImportBusy.value
    ? `正在辨識圖片與整理表格 ${journeyOcrProgress.value}%`
    : '可匯入 Excel、CSV、TSV、圖片，或直接貼上表格文字。'
);

watch(
  dateKey,
  (key) => {
    loadDailyState(key);
  },
  { immediate: true }
);

watch(countdown, (next, previous) => {
  if (!previous) return;
  const changed = (['days', 'hours', 'minutes'] as CountdownUnit[]).filter(
    (unit) => next[unit] !== previous[unit]
  );
  if (!changed.length) return;

  flipUnits.value = Array.from(new Set([...flipUnits.value, ...changed]));
  window.setTimeout(() => {
    flipUnits.value = flipUnits.value.filter((unit) => !changed.includes(unit));
  }, 520);
});

watch(progressPercent, (value) => {
  const milestone = [90, 75, 50, 25].find((mark) => value >= mark) ?? 0;
  if (!milestone || milestone === previousProgressMilestone) return;
  previousProgressMilestone = milestone;
  triggerMilestoneWave();
});

watch(
  () => previewTheme.value || settings.value.theme,
  (theme) => {
    updateAppThemeChrome(theme);
    if (bgmPlaying.value) {
      stopBackgroundMusic();
      startBackgroundMusic();
    }
  },
  { immediate: true }
);

watch(
  () => settings.value.soundFeedback,
  (enabled) => {
    if (enabled && appUnlocked.value && audioUnlocked.value) {
      startBackgroundMusic();
      return;
    }

    stopBackgroundMusic();
  }
);

onMounted(() => {
  loadSettings();
  loadJourneyTrips();
  loadSuitcase();
  loadCheckins();
  loadMoodHistory();
  loadSecretCode();
  loadCustomSecretCodes();
  loadMemoryPhotos();
  loadMemoryCapsules();
  loadHiddenCards();
  loadMeetingChecklist();
  loadWishes();
  loadMeetingMoments();
  loadPeriodRecords();
  loadPeriodPrivacyMode();
  checkForAppUpdate();
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  window.addEventListener('resize', updateViewportSize);
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('pointermove', updateSceneTilt);
  window.addEventListener('pointermove', movePlaneDrag);
  window.addEventListener('pointerup', endPlaneDrag);
  window.addEventListener('pointercancel', endPlaneDrag);
  window.addEventListener('mousemove', movePlaneMouseDrag);
  window.addEventListener('mouseup', endPlaneMouseDrag);
  navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
  updateInstalledDisplayMode();
  void loadMapWeather();
  weatherTimer = window.setInterval(() => {
    void loadMapWeather();
  }, 30 * 60 * 1_000);
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1_000);
  if (localPreviewMode) {
    useLocalDataForThisSession();
    return;
  }
  restoreSavedCloudSession();
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  clearPlaneReturnTimers();
  if (introTimer) window.clearTimeout(introTimer);
  if (passwordSuccessTimer) window.clearTimeout(passwordSuccessTimer);
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  if (themePreviewTimer) window.clearTimeout(themePreviewTimer);
  if (milestoneTimer) window.clearTimeout(milestoneTimer);
  if (weatherTimer) window.clearInterval(weatherTimer);
  if (flightLandingTimer) window.clearTimeout(flightLandingTimer);
  if (cloudSyncTimer) window.clearInterval(cloudSyncTimer);
  stopBackgroundMusic();
  closeAudioContext();
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
  window.removeEventListener('resize', updateViewportSize);
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
  window.removeEventListener('pointermove', updateSceneTilt);
  window.removeEventListener('pointermove', movePlaneDrag);
  window.removeEventListener('pointerup', endPlaneDrag);
  window.removeEventListener('pointercancel', endPlaneDrag);
  window.removeEventListener('mousemove', movePlaneMouseDrag);
  window.removeEventListener('mouseup', endPlaneMouseDrag);
  navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
  cancelSecretPress();
});

async function unlockApp() {
  if (!cloudSyncConfigured) {
    passwordStatus.value = '尚未設定雲端 API，請先部署 Google Cloud Run 並設定 VITE_CLOUD_API_URL。';
    return;
  }

  const password = passwordInput.value.trim();
  if (!password) {
    passwordStatus.value = '請輸入密碼。提示：小笨蛋生日。';
    return;
  }

  passwordBusy.value = true;
  passwordStatus.value = '正在確認密碼...';

  try {
    cloudToken.value = await requestCloudSession(password);
  } catch {
    clearCloudSession();
    cloudToken.value = '';
    appUnlocked.value = false;
    passwordSuccess.value = false;
    passwordStatus.value = '密碼不對，提示：小笨蛋生日。';
    passwordBusy.value = false;
    return;
  }

  passwordSuccess.value = true;
  passwordStatus.value = '暗號通過，正在打開今天。';
  await waitForPasswordSuccess();
  passwordStatus.value = '正在載入雲端資料...';

  try {
    await loadCloudData();
    passwordStatus.value = '';
  } catch {
    cloudStatus.value = '暗號已通過，但雲端資料暫時載入失敗。';
    passwordStatus.value = '暗號已通過，但雲端資料暫時載入失敗。';
  } finally {
    enterUnlockedApp(!localDataMode.value);
    passwordSuccess.value = false;
    passwordInput.value = '';
    passwordBusy.value = false;
  }
}

function restoreSavedCloudSession() {
  if (!cloudSyncConfigured) {
    cloudStatus.value = '尚未設定雲端 API';
    return;
  }

  const token = restoreCloudSession();
  if (!token) return;

  cloudToken.value = token;
  void (async () => {
    await loadCloudData();
    enterUnlockedApp(!localDataMode.value);
  })().catch(() => {
    clearCloudSession();
    cloudToken.value = '';
    appUnlocked.value = false;
    passwordStatus.value = '登入已過期，請重新輸入密碼。';
  });
}

function enterUnlockedApp(startSync: boolean) {
  if (!appUnlocked.value) {
    appUnlocked.value = true;
    startOpeningSequence();
  }
  if (audioUnlocked.value) {
    startBackgroundMusic();
  }
  if (startSync) {
    startCloudSyncLoop();
  }
}

async function loadCloudData() {
  if (!cloudToken.value) return;

  const requestId = ++cloudLoadRequestId;
  localCloudFallbackRequested = false;
  localDataMode.value = false;
  loadingCloudSnapshot = true;
  cloudLoadingActive.value = true;
  cloudStatus.value = '正在載入雲端資料...';
  let shouldPushLocalAfterCloudLoad = false;

  try {
    try {
      const cloudData = await fetchCloudState(cloudToken.value);
      if (localCloudFallbackRequested || requestId !== cloudLoadRequestId) return;
      if (cloudData) {
        const localSettings = localStorage.getItem(storageKey('settings'));
        const localSettingsUpdatedAt = getLocalSettingsUpdatedAt();
        const cloudSettingsUpdatedAt = getCloudSettingsUpdatedAt(cloudData);
        const localTodayKey = dateKey.value;
        const localTodayState = captureLocalTodayState(localTodayKey);
        const localTodayUpdatedAt = getLocalTodayUpdatedAt(localTodayKey);
        const cloudTodayUpdatedAt = getCloudTodayUpdatedAt(cloudData, localTodayKey);
        restoreAppLocalStorage(cloudData.localStorage, 'replace');
        if (localSettings && localSettingsUpdatedAt > cloudSettingsUpdatedAt) {
          localStorage.setItem(storageKey('settings'), localSettings);
          setSettingsUpdatedAt(localSettingsUpdatedAt);
          shouldPushLocalAfterCloudLoad = true;
        }
        if (localTodayUpdatedAt > cloudTodayUpdatedAt) {
          restoreLocalTodayState(localTodayState);
          shouldPushLocalAfterCloudLoad = true;
        }
        memoryPhotos.value = cloudData.photos;
        await savePhotos(memoryPhotos.value);
        reloadPersistentState();
        cloudStatus.value = '已載入雲端資料';
      } else {
        cloudStatus.value = '雲端還沒有資料，會用目前裝置建立第一份資料';
        shouldPushLocalAfterCloudLoad = true;
      }
      lastCloudSnapshot = getComparableCloudSnapshot();
    } finally {
      loadingCloudSnapshot = false;
    }

    if (shouldPushLocalAfterCloudLoad) {
      await syncCloudNow(true);
    }
  } finally {
    cloudLoadingActive.value = false;
  }
}

function useLocalDataForThisSession() {
  localCloudFallbackRequested = true;
  cloudLoadRequestId += 1;
  localDataMode.value = true;
  loadingCloudSnapshot = false;
  cloudLoadingActive.value = false;
  cloudStatus.value = '已使用本地資料，雲端同步暫停';
  passwordStatus.value = '';
  passwordBusy.value = false;
  passwordSuccess.value = false;
  enterUnlockedApp(false);
}

function startCloudSyncLoop() {
  if (cloudSyncTimer) return;
  cloudSyncTimer = window.setInterval(() => {
    void syncCloudNow();
  }, 12_000);
  window.setTimeout(() => {
    void syncCloudNow();
  }, 900);
}

async function syncCloudNow(force = false, requestedFeatures?: CloudFeature[]) {
  if (!cloudToken.value || loadingCloudSnapshot) return;
  if (cloudSyncBusy.value) {
    pendingCloudSync = pendingCloudSync || force;
    addPendingCloudFeatures(requestedFeatures);
    return;
  }

  const snapshot = getComparableCloudSnapshot();
  if (!force && snapshot === lastCloudSnapshot) return;
  const featuresToSync = getCloudFeaturesToSync(requestedFeatures);
  pendingCloudFeatures.clear();

  cloudSyncBusy.value = true;
  cloudStatus.value = '正在同步雲端...';

  try {
    await saveCloudState(cloudToken.value, createExportData(memoryPhotos.value), featuresToSync);
    localDataMode.value = false;
    lastCloudSnapshot = snapshot;
    cloudStatus.value = `已同步 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    addPendingCloudFeatures(featuresToSync);
    cloudStatus.value = '同步失敗，稍後會再試一次';
  } finally {
    cloudSyncBusy.value = false;
    if (pendingCloudSync) {
      pendingCloudSync = false;
      window.setTimeout(() => {
        void syncCloudNow(true, pendingCloudFeatures.size ? [...pendingCloudFeatures] : undefined);
      }, 0);
    }
  }
}

function requestCloudSync(features?: CloudFeature | CloudFeature[]) {
  if (localDataMode.value) return;
  const requestedFeatures = normalizeCloudFeatures(features);
  void syncCloudNow(true, requestedFeatures);
}

function normalizeCloudFeatures(features?: CloudFeature | CloudFeature[]) {
  if (!features) return undefined;
  return Array.isArray(features) ? features : [features];
}

function addPendingCloudFeatures(features?: CloudFeature[]) {
  if (!features) return;
  features.forEach((feature) => pendingCloudFeatures.add(feature));
}

function getCloudFeaturesToSync(requestedFeatures?: CloudFeature[]) {
  const combined = new Set<CloudFeature>(pendingCloudFeatures);
  requestedFeatures?.forEach((feature) => combined.add(feature));
  return combined.size ? [...combined] : undefined;
}

function getComparableCloudSnapshot() {
  const data = createExportData(memoryPhotos.value);
  return JSON.stringify({
    localStorage: data.localStorage,
    photos: data.photos
  });
}

function setSettingsUpdatedAt(timestamp = Date.now()) {
  localStorage.setItem(storageKey(SETTINGS_UPDATED_KIND), String(timestamp));
}

function setTodayUpdatedAt(key = dateKey.value, timestamp = Date.now()) {
  localStorage.setItem(storageKey(TODAY_UPDATED_KIND, key), String(timestamp));
}

function getLocalSettingsUpdatedAt() {
  return getStorageTimestamp(localStorage.getItem(storageKey(SETTINGS_UPDATED_KIND)));
}

function getCloudSettingsUpdatedAt(data: AppExportData) {
  return getStorageTimestamp(data.localStorage[storageKey(SETTINGS_UPDATED_KIND)]);
}

function getLocalTodayUpdatedAt(key = dateKey.value) {
  return getStorageTimestamp(localStorage.getItem(storageKey(TODAY_UPDATED_KIND, key)));
}

function getCloudTodayUpdatedAt(data: AppExportData, key = dateKey.value) {
  return getStorageTimestamp(data.localStorage[storageKey(TODAY_UPDATED_KIND, key)]);
}

function getStorageTimestamp(value: string | null | undefined) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function captureLocalTodayState(key: string) {
  const localStorageEntries: Record<string, string | null> = {};
  [...TODAY_STORAGE_KINDS, TODAY_UPDATED_KIND].forEach((kind) => {
    const storageName = storageKey(kind, key);
    localStorageEntries[storageName] = localStorage.getItem(storageName);
  });
  [storageKey('checkins'), storageKey('mood-history')].forEach((storageName) => {
    localStorageEntries[storageName] = localStorage.getItem(storageName);
  });
  return localStorageEntries;
}

function restoreLocalTodayState(entries: Record<string, string | null>) {
  Object.entries(entries).forEach(([key, value]) => {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  });
}

function lockApp() {
  stopBackgroundMusic();
  clearCloudSession();
  cloudToken.value = '';
  appUnlocked.value = false;
  passwordInput.value = '';
  passwordStatus.value = '';
  cloudStatus.value = '已鎖定';
  if (cloudSyncTimer) {
    window.clearInterval(cloudSyncTimer);
    cloudSyncTimer = undefined;
  }
}

function toggleTask() {
  taskCompleted.value = !taskCompleted.value;
  const key = storageKey('task', dateKey.value);

  if (taskCompleted.value) {
    localStorage.setItem(key, 'done');
    setTodayUpdatedAt();
    requestCloudSync('today');
    launchThemeBurst();
    playSoftSound('success');
    gentleVibrate(12);
    return;
  }

  localStorage.removeItem(key);
  setTodayUpdatedAt();
  requestCloudSync('today');
}

function loadDailyState(key: string) {
  taskCompleted.value =
    localStorage.getItem(storageKey('task', key)) === 'done' ||
    localStorage.getItem(`first-meeting-task:${key}`) === 'done';
  dailyMessage.value = localStorage.getItem(storageKey('message', key)) ?? '';
  selectedMoodId.value = localStorage.getItem(storageKey('mood', key)) ?? '';
  secretRevealed.value = localStorage.getItem(storageKey('secret', key)) === 'open';
  secretMailed.value = localStorage.getItem(storageKey('secret-mailed', key)) === 'yes';
  fortuneTitle.value = localStorage.getItem(storageKey('fortune-title', key)) ?? '';
  fortuneLine.value = localStorage.getItem(storageKey('fortune-line', key)) ?? '';
  dailyAnswer.value = localStorage.getItem(storageKey('question-answer', key)) ?? '';
  radarChoiceId.value = localStorage.getItem(storageKey('radar-choice', key)) ?? '';
  ritualOpened.value = localStorage.getItem(storageKey('ritual-opened', key)) === 'yes';
  ritualComplete.value = localStorage.getItem(storageKey('ritual-complete', key)) === 'yes';
  shareCopied.value = false;
  radarScanned.value = false;
}

function saveDailyMessage() {
  const message = dailyMessage.value.trim();

  if (message) {
    localStorage.setItem(storageKey('message', dateKey.value), message);
    dailyMessage.value = message;
    setTodayUpdatedAt();
    requestCloudSync('today');
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
  setTodayUpdatedAt();
  requestCloudSync('today');
}

function clearDailyMessage() {
  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
  setTodayUpdatedAt();
  requestCloudSync('today');
}

function selectMood(moodId: string) {
  selectedMoodId.value = moodId;
  localStorage.setItem(storageKey('mood', dateKey.value), moodId);
  addMoodHistory(moodId);
  setTodayUpdatedAt();
  requestCloudSync('today');
  gentleVibrate(8);
}

function toggleSuitcaseItem(item: string) {
  const checked = new Set(suitcaseChecked.value);

  if (checked.has(item)) {
    checked.delete(item);
  } else {
    checked.add(item);
  }

  suitcaseChecked.value = Array.from(checked);
  packingItems.value = [...packingItems.value.filter((value) => value !== item), item];
  window.setTimeout(() => {
    packingItems.value = packingItems.value.filter((value) => value !== item);
  }, 620);
  localStorage.setItem(storageKey('suitcase'), JSON.stringify(suitcaseChecked.value));
  requestCloudSync('prepare');
  gentleVibrate(8);
}

function loadSuitcase() {
  const stored = localStorage.getItem(storageKey('suitcase'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      suitcaseChecked.value = parsed.filter((item) => suitcaseItems.includes(item));
    }
  } catch {
    suitcaseChecked.value = [];
  }
}

function checkInToday() {
  if (checkedInToday.value) return;
  checkins.value = [...checkins.value, dateKey.value].sort();
  localStorage.setItem(storageKey('checkins'), JSON.stringify(checkins.value));
  setTodayUpdatedAt();
  requestCloudSync('today');
  launchThemeBurst();
  playSoftSound('success');
  gentleVibrate(16);
}

function loadCheckins() {
  const stored = localStorage.getItem(storageKey('checkins'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      checkins.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    checkins.value = [];
  }
}

function drawFortune() {
  if (fortuneReady.value) return;
  const fortune = pick(fortuneDeck, currentDayIndex.value * 7 + dateKey.value.length);
  fortuneTitle.value = fortune.title;
  fortuneLine.value = fortune.line;
  localStorage.setItem(storageKey('fortune-title', dateKey.value), fortune.title);
  localStorage.setItem(storageKey('fortune-line', dateKey.value), fortune.line);
  setTodayUpdatedAt();
  requestCloudSync('today');
  gentleVibrate(14);
}

function addMoodHistory(moodId: string) {
  const entry = `${dateKey.value}:${moodId}`;
  const next = moodHistory.value.filter((item) => !item.startsWith(`${dateKey.value}:`));
  next.push(entry);
  moodHistory.value = next;
  localStorage.setItem(storageKey('mood-history'), JSON.stringify(next));
}

function loadMoodHistory() {
  const stored = localStorage.getItem(storageKey('mood-history'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      moodHistory.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    moodHistory.value = [];
  }
}

function toggleCapsule(index: number) {
  const flipped = new Set(flippedCapsules.value);
  if (flipped.has(index)) {
    flipped.delete(index);
  } else {
    flipped.add(index);
  }

  flippedCapsules.value = Array.from(flipped);
  localStorage.setItem(storageKey('flipped-capsules'), JSON.stringify(flippedCapsules.value));
  requestCloudSync('memories');
}

function startEditCapsule(index: number) {
  if (index >= unlockedCount.value) return;
  const capsule = visibleCapsules.value.find((item) => item.index === index);
  editingCapsuleIndex.value = index;
  capsuleEditText.value = capsule?.text ?? '';
}

function saveCapsuleNote() {
  if (editingCapsuleIndex.value === null) return;
  const index = editingCapsuleIndex.value;
  const text = capsuleEditText.value.trim().slice(0, 160);
  const next = memoryCapsuleNotes.value.filter((note) => note.index !== index);
  if (text) {
    next.push({
      index,
      text,
      updatedAt: new Date().toISOString()
    });
  }
  memoryCapsuleNotes.value = next.sort((left, right) => left.index - right.index);
  localStorage.setItem(storageKey('capsule-notes'), JSON.stringify(memoryCapsuleNotes.value));
  editingCapsuleIndex.value = null;
  capsuleEditText.value = '';
  requestCloudSync('memories');
}

function cancelEditCapsule() {
  editingCapsuleIndex.value = null;
  capsuleEditText.value = '';
}

function loadMemoryCapsules() {
  const storedNotes = localStorage.getItem(storageKey('capsule-notes'));
  const storedFlipped = localStorage.getItem(storageKey('flipped-capsules'));

  try {
    const parsed = storedNotes ? JSON.parse(storedNotes) : [];
    if (Array.isArray(parsed)) {
      memoryCapsuleNotes.value = parsed
        .filter((note): note is MemoryCapsuleNote =>
          typeof note?.index === 'number' && typeof note?.text === 'string' && typeof note?.updatedAt === 'string'
        )
        .map((note) => ({ ...note, text: note.text.slice(0, 160) }));
    }
  } catch {
    memoryCapsuleNotes.value = [];
  }

  try {
    const parsed = storedFlipped ? JSON.parse(storedFlipped) : [];
    if (Array.isArray(parsed)) {
      flippedCapsules.value = parsed.filter((index): index is number => Number.isInteger(index) && index >= 0);
    }
  } catch {
    flippedCapsules.value = [];
  }
}

function launchSparkles() {
  const dots = Array.from({ length: 9 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 9;
    return {
      id: sparkleId++,
      x: Math.round(Math.cos(angle) * (18 + (index % 3) * 8)),
      y: Math.round(Math.sin(angle) * (14 + (index % 2) * 10))
    };
  });

  sparkles.value = [...sparkles.value, ...dots];
  window.setTimeout(() => {
    const ids = new Set(dots.map((dot) => dot.id));
    sparkles.value = sparkles.value.filter((dot) => !ids.has(dot.id));
  }, 900);
  gentleVibrate(8);
}

function launchThemeBurst() {
  const dots = Array.from({ length: 18 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 18;
    const radius = 34 + (index % 4) * 10;
    return {
      id: burstId++,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      delay: `${(index % 5) * 28}ms`
    };
  });

  burstParticles.value = [...burstParticles.value, ...dots];
  window.setTimeout(() => {
    const ids = new Set(dots.map((dot) => dot.id));
    burstParticles.value = burstParticles.value.filter((dot) => !ids.has(dot.id));
  }, 1100);
}

function triggerMilestoneWave() {
  milestoneFlash.value = true;
  if (milestoneTimer) window.clearTimeout(milestoneTimer);
  milestoneTimer = window.setTimeout(() => {
    milestoneFlash.value = false;
  }, 1300);
}

function scanRadar() {
  radarScanned.value = true;
  playSoftSound('radar');
  gentleVibrate(18);
}

function chooseRadar(choiceId: string) {
  radarChoiceId.value = choiceId;
  localStorage.setItem(storageKey('radar-choice', dateKey.value), choiceId);
  setTodayUpdatedAt();
  requestCloudSync('today');
  playSoftSound('radar');
  gentleVibrate(14);
}

function startSecretPress() {
  if (secretRevealed.value) return;
  cancelSecretPress();
  secretPressing.value = true;
  secretPressTimer = window.setTimeout(() => {
    revealSecret();
  }, 1_000);
}

function cancelSecretPress() {
  secretPressing.value = false;
  if (!secretPressTimer) return;
  window.clearTimeout(secretPressTimer);
  secretPressTimer = undefined;
}

function revealSecret() {
  secretRevealed.value = true;
  localStorage.setItem(storageKey('secret', dateKey.value), 'open');
  setTodayUpdatedAt();
  requestCloudSync('today');
  cancelSecretPress();
  launchThemeBurst();
  playSoftSound('secret');
  gentleVibrate(16);
}

function mailSecret() {
  if (!secretRevealed.value || secretMailed.value) return;
  secretMailed.value = true;
  localStorage.setItem(storageKey('secret-mailed', dateKey.value), 'yes');
  setTodayUpdatedAt();
  requestCloudSync('today');
  playSoftSound('paper');
  gentleVibrate(12);
}

function unlockSecretCode() {
  const normalized = secretCodeInput.value.trim();
  if (!normalized) {
    secretCodeMessage.value = '先輸入你們約好的暗號。';
    return;
  }
  if (!secretCodeList.value.includes(normalized)) {
    secretCodeMessage.value = '暗號沒有對上，確認大小寫或換另一個你們約好的詞。';
    gentleVibrate(8);
    return;
  }
  secretCodeUnlocked.value = true;
  localStorage.setItem(storageKey('secret-code'), 'open');
  secretCodeInput.value = '';
  secretCodeMessage.value = '暗號通過，雙人私密區已開啟。';
  playSoftSound('secret');
  gentleVibrate(18);
}

function loadSecretCode() {
  secretCodeUnlocked.value = localStorage.getItem(storageKey('secret-code')) === 'open';
  if (secretCodeUnlocked.value) {
    secretCodeMessage.value = '此裝置已通過暗號，雙人私密區保持開啟。';
  }
}

function lockSecretCode() {
  secretCodeUnlocked.value = false;
  secretCodeInput.value = '';
  secretCodeMessage.value = '已重新上鎖，卡片收回信封。';
  cancelHiddenCardEdit();
  localStorage.removeItem(storageKey('secret-code'));
  gentleVibrate(10);
}

function addCustomSecretCode() {
  const code = newSecretCode.value.trim();
  if (!secretCodeUnlocked.value) {
    secretCodeMessage.value = '先用既有暗號解鎖，再新增新的雙人暗號。';
    return;
  }
  if (!code) {
    secretCodeMessage.value = '請輸入要新增的暗號。';
    return;
  }
  if (secretCodeList.value.includes(code)) {
    secretCodeMessage.value = '這個暗號已經存在。';
    return;
  }
  customSecretCodes.value = [...customSecretCodes.value, code];
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
  newSecretCode.value = '';
  secretCodeMessage.value = '新的雙人暗號已加入。';
  requestCloudSync('memories');
}

function removeCustomSecretCode(code: string) {
  customSecretCodes.value = customSecretCodes.value.filter((item) => item !== code);
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
  secretCodeMessage.value = '已移除一個自訂暗號。';
  requestCloudSync('memories');
}

function loadCustomSecretCodes() {
  const stored = localStorage.getItem(storageKey('custom-secret-codes'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      customSecretCodes.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    customSecretCodes.value = [];
  }
}

function saveHiddenCard() {
  if (!secretCodeUnlocked.value) return;
  const title = hiddenCardTitleDraft.value.trim().slice(0, 28) || '未命名卡片';
  const text = hiddenCardTextDraft.value.trim().slice(0, 220);
  if (!text) return;

  const nowIso = new Date().toISOString();
  if (editingHiddenCardId.value) {
    hiddenCards.value = hiddenCards.value.map((card) =>
      card.id === editingHiddenCardId.value
        ? { ...card, title, text, updatedAt: nowIso }
        : card
    );
  } else {
    hiddenCards.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,
        text,
        createdAt: nowIso,
        updatedAt: nowIso
      },
      ...hiddenCards.value
    ].slice(0, 12);
  }

  hiddenCardTitleDraft.value = '';
  hiddenCardTextDraft.value = '';
  editingHiddenCardId.value = '';
  persistHiddenCards();
  playSoftSound('paper');
}

function editHiddenCard(id: string) {
  const card = hiddenCards.value.find((item) => item.id === id);
  if (!card) return;
  editingHiddenCardId.value = card.id;
  hiddenCardTitleDraft.value = card.title;
  hiddenCardTextDraft.value = card.text;
}

function removeHiddenCard(id: string) {
  hiddenCards.value = hiddenCards.value.filter((card) => card.id !== id);
  if (editingHiddenCardId.value === id) {
    cancelHiddenCardEdit();
  }
  persistHiddenCards();
}

function cancelHiddenCardEdit() {
  editingHiddenCardId.value = '';
  hiddenCardTitleDraft.value = '';
  hiddenCardTextDraft.value = '';
}

function persistHiddenCards() {
  localStorage.setItem(storageKey('hidden-cards'), JSON.stringify(hiddenCards.value));
  requestCloudSync('memories');
}

function loadHiddenCards() {
  const stored = localStorage.getItem(storageKey('hidden-cards'));
  if (!stored) {
    hiddenCards.value = [
      {
        id: 'default-hidden-card',
        title: '第一張隱藏卡片',
        text: hiddenCardLine.value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      hiddenCards.value = parsed.filter(
        (card): card is HiddenCardItem =>
          typeof card?.id === 'string' &&
          typeof card?.title === 'string' &&
          typeof card?.text === 'string' &&
          typeof card?.createdAt === 'string' &&
          typeof card?.updatedAt === 'string'
      );
    }
  } catch {
    hiddenCards.value = [];
  }
}

function saveDailyAnswer() {
  const answer = dailyAnswer.value.trim();
  if (answer) {
    dailyAnswer.value = answer;
    localStorage.setItem(storageKey('question-answer', dateKey.value), answer);
    setTodayUpdatedAt();
    requestCloudSync('today');
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('question-answer', dateKey.value));
  dailyAnswer.value = '';
  setTodayUpdatedAt();
  requestCloudSync('today');
}

function clearDailyAnswer() {
  dailyAnswer.value = '';
  localStorage.removeItem(storageKey('question-answer', dateKey.value));
  setTodayUpdatedAt();
  requestCloudSync('today');
}

async function addMemoryPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, 4);
  if (!files.length) return;

  const photos = (await Promise.all(files.map((file) => createMemoryPhoto(file)))).filter(
    (photo): photo is MemoryPhoto => Boolean(photo)
  );
  if (!photos.length) return;

  memoryPhotos.value = [...photos, ...memoryPhotos.value].slice(0, 8);
  await saveMemoryPhotos();
  launchThemeBurst();
  input.value = '';
  gentleVibrate(10);
}

function removeMemoryPhoto(id: string) {
  memoryPhotos.value = memoryPhotos.value.filter((photo) => photo.id !== id);
  saveMemoryPhotos();
}

async function saveMemoryPhotos() {
  await savePhotos(memoryPhotos.value);
  requestCloudSync('memories');
}

async function loadMemoryPhotos() {
  const legacyStored = localStorage.getItem(storageKey('memory-photos'));
  let legacyPhotos: MemoryPhoto[] = [];

  try {
    const parsed = legacyStored ? JSON.parse(legacyStored) : [];
    if (Array.isArray(parsed)) {
      legacyPhotos = parsed.filter(
        (photo): photo is MemoryPhoto =>
          typeof photo?.id === 'string' && typeof photo?.name === 'string' && typeof photo?.dataUrl === 'string'
      );
    }
  } catch {
    legacyPhotos = [];
  }

  memoryPhotos.value = await loadStoredPhotos(legacyPhotos);
  if (legacyStored) localStorage.removeItem(storageKey('memory-photos'));
}

function toggleMeetingChecklist(item: string) {
  const checked = new Set(meetingChecklist.value);
  if (checked.has(item)) {
    checked.delete(item);
  } else {
    checked.add(item);
  }
  meetingChecklist.value = Array.from(checked);
  localStorage.setItem(storageKey('meeting-checklist'), JSON.stringify(meetingChecklist.value));
  requestCloudSync('prepare');
  gentleVibrate(10);
}

function loadMeetingChecklist() {
  const stored = localStorage.getItem(storageKey('meeting-checklist'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      meetingChecklist.value = parsed.filter((item) => meetingChecklistItems.includes(item));
    }
  } catch {
    meetingChecklist.value = [];
  }
}

async function exportData() {
  downloadJsonBackup(createExportData(memoryPhotos.value), dateKey.value);
  importMessage.value = '已匯出完整備份。';
}

function importData(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const preview = parseImportData(String(reader.result ?? ''));
      pendingImport.value = preview.data;
      importMessage.value = `${preview.summary} 請選擇合併或覆蓋後套用。`;
    } catch {
      importMessage.value = '匯入失敗，檔案格式不對。';
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function applyImportData() {
  if (!pendingImport.value) return;
  restoreAppLocalStorage(pendingImport.value.localStorage, importMode.value);
  memoryPhotos.value =
    importMode.value === 'replace'
      ? pendingImport.value.photos
      : await mergePhotos(pendingImport.value.photos);
  if (importMode.value === 'replace') {
    await saveMemoryPhotos();
  }
  reloadPersistentState();
  importMessage.value = '匯入完成。';
  pendingImport.value = null;
  await syncCloudNow(true);
}

function cancelImportData() {
  pendingImport.value = null;
  importMessage.value = '已取消匯入。';
}

function reloadPersistentState() {
  loadDailyState(dateKey.value);
  loadSuitcase();
  loadCheckins();
  loadMoodHistory();
  loadSecretCode();
  loadCustomSecretCodes();
  loadMemoryCapsules();
  loadHiddenCards();
  loadMeetingChecklist();
  loadSettings();
  loadWishes();
  loadMeetingMoments();
  loadJourneyTrips();
  loadPeriodRecords();
  loadPeriodPrivacyMode();
}

async function createMemoryPhoto(file: File): Promise<MemoryPhoto | null> {
  try {
    const dataUrl = await compressImageFile(file);
    if (!dataUrl.startsWith('data:image/')) return null;
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      dataUrl
    };
  } catch {
    return null;
  }
}

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 720_000 && quality > 0.48) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be loaded.'));
    };
    image.src = url;
  });
}

function resetToday() {
  TODAY_STORAGE_KINDS.forEach((kind) => localStorage.removeItem(storageKey(kind, dateKey.value)));
  checkins.value = checkins.value.filter((day) => day !== dateKey.value);
  moodHistory.value = moodHistory.value.filter((entry) => !entry.startsWith(`${dateKey.value}:`));
  localStorage.setItem(storageKey('checkins'), JSON.stringify(checkins.value));
  localStorage.setItem(storageKey('mood-history'), JSON.stringify(moodHistory.value));
  setTodayUpdatedAt();
  if (isMeetingDay.value) {
    meetingChecklist.value = [];
    localStorage.removeItem(storageKey('meeting-checklist'));
  }
  loadDailyState(dateKey.value);
  requestCloudSync(isMeetingDay.value ? ['today', 'prepare'] : 'today');
}

function openTodayRitual() {
  ritualOpened.value = true;
  localStorage.setItem(storageKey('ritual-opened', dateKey.value), 'yes');
  setTodayUpdatedAt();
  requestCloudSync('today');
  gentleVibrate(10);
}

function completeTodayRitual() {
  if (ritualProgress.value < 100) return;
  ritualComplete.value = true;
  localStorage.setItem(storageKey('ritual-complete', dateKey.value), 'yes');
  setTodayUpdatedAt();
  requestCloudSync('today');
  launchSparkles();
  playSoftSound('success');
}

async function copyDailyReceipt() {
  try {
    await navigator.clipboard.writeText(dailyReceipt.value);
    shareCopied.value = true;
    gentleVibrate(8);
  } catch {
    shareCopied.value = false;
  }
}

function saveSettings() {
  const previousTheme = settings.value.theme;
  const next: AppSettings = {
    boyName: settingsDraft.value.boyName.trim() || defaultSettings.boyName,
    girlName: settingsDraft.value.girlName.trim() || defaultSettings.girlName,
    theme: settingsDraft.value.theme,
    startDate: normalizeDateSetting(settingsDraft.value.startDate),
    startTime: normalizeClockTime(settingsDraft.value.startTime, defaultSettings.startTime),
    targetDate: normalizeDateSetting(settingsDraft.value.targetDate, defaultSettings.targetDate),
    targetTime: normalizeClockTime(settingsDraft.value.targetTime, defaultSettings.targetTime),
    welcomeLine: settingsDraft.value.welcomeLine.trim() || defaultSettings.welcomeLine,
    reducedMotion: settingsDraft.value.reducedMotion,
    soundFeedback: settingsDraft.value.soundFeedback
  };
  settings.value = next;
  settingsDraft.value = { ...next };
  previewTheme.value = '';
  if (themePreviewTimer) window.clearTimeout(themePreviewTimer);
  localStorage.setItem(storageKey('settings'), JSON.stringify(next));
  setSettingsUpdatedAt();
  if (previousTheme !== next.theme) {
    themeTransition.value = true;
    if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => {
      themeTransition.value = false;
    }, 900);
  }
  requestCloudSync('settings');
  gentleVibrate(10);
}

function resetSettings() {
  settings.value = { ...defaultSettings };
  settingsDraft.value = { ...defaultSettings };
  previewTheme.value = '';
  localStorage.removeItem(storageKey('settings'));
  setSettingsUpdatedAt();
  requestCloudSync('settings');
}

function previewThemeSelection(theme: ThemeId) {
  const previousTheme = settings.value.theme;
  settingsDraft.value.theme = theme;
  if (previousTheme === theme) return;

  settings.value = { ...settings.value, theme };
  settingsDraft.value = { ...settingsDraft.value, theme };
  previewTheme.value = '';
  if (themePreviewTimer) window.clearTimeout(themePreviewTimer);
  localStorage.setItem(storageKey('settings'), JSON.stringify(settings.value));
  setSettingsUpdatedAt();
  themeTransition.value = true;
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  themeTransitionTimer = window.setTimeout(() => {
    themeTransition.value = false;
  }, 900);
  requestCloudSync('settings');
  playThemeSwitchMotif(theme);
  gentleVibrate(8);
}

function dismissOnboarding() {
  onboardingVisible.value = false;
  localStorage.setItem(storageKey('onboarding-seen'), 'yes');
  requestCloudSync('settings');
}

function dismissUpdateToast() {
  updateReady.value = false;
}

function loadSettings() {
  const stored = localStorage.getItem(storageKey('settings'));
  if (!stored) {
    settings.value = { ...defaultSettings };
    settingsDraft.value = { ...defaultSettings };
    return;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    const loaded: AppSettings = {
      ...defaultSettings,
      ...parsed,
      theme: themeOptions.some((theme) => theme.id === parsed.theme) ? (parsed.theme as ThemeId) : defaultSettings.theme,
      startDate: normalizeDateSetting(parsed.startDate ?? defaultSettings.startDate),
      startTime: normalizeClockTime(parsed.startTime ?? defaultSettings.startTime, defaultSettings.startTime),
      targetDate: normalizeDateSetting(parsed.targetDate ?? defaultSettings.targetDate, defaultSettings.targetDate),
      targetTime: normalizeClockTime(parsed.targetTime ?? defaultSettings.targetTime, defaultSettings.targetTime),
      reducedMotion: Boolean(parsed.reducedMotion),
      soundFeedback: parsed.soundFeedback ?? defaultSettings.soundFeedback
    };
    settings.value = loaded;
    settingsDraft.value = { ...loaded };
  } catch {
    settings.value = { ...defaultSettings };
    settingsDraft.value = { ...defaultSettings };
  }
}

function addWish() {
  const text = newWish.value.trim();
  if (!text) return;
  wishes.value = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      done: false,
      createdAt: new Date().toISOString()
    },
    ...wishes.value
  ].slice(0, 18);
  newWish.value = '';
  saveWishes();
}

function toggleWish(id: string) {
  const target = wishes.value.find((wish) => wish.id === id);
  wishes.value = wishes.value.map((wish) => (wish.id === id ? { ...wish, done: !wish.done } : wish));
  saveWishes();
  if (target && !target.done) {
    playSoftSound('success');
  }
}

function removeWish(id: string) {
  wishes.value = wishes.value.filter((wish) => wish.id !== id);
  saveWishes();
}

function saveWishes() {
  localStorage.setItem(storageKey('wishes'), JSON.stringify(wishes.value));
  requestCloudSync('wishes');
}

function loadWishes() {
  const stored = localStorage.getItem(storageKey('wishes'));
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      wishes.value = parsed.filter(
        (wish): wish is WishItem =>
          typeof wish?.id === 'string' &&
          typeof wish?.text === 'string' &&
          typeof wish?.done === 'boolean' &&
          typeof wish?.createdAt === 'string'
      );
    }
  } catch {
    wishes.value = [];
  }
}

function toggleMeetingMoment(id: string) {
  const selected = new Set(meetingMoments.value);
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  meetingMoments.value = Array.from(selected);
  localStorage.setItem(storageKey('meeting-moments'), JSON.stringify(meetingMoments.value));
  requestCloudSync('memories');
}

function loadMeetingMoments() {
  const stored = localStorage.getItem(storageKey('meeting-moments'));
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const ids = new Set(meetingMomentItems.map((item) => item.id));
      meetingMoments.value = parsed.filter((id): id is string => typeof id === 'string' && ids.has(id));
    }
  } catch {
    meetingMoments.value = [];
  }
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = parseDateSetting(dateString, '2026-01-01');
  return new Date(year, month - 1, day);
}

function formatPeriodDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function createDefaultPeriodRecords(): PeriodRecord[] {
  return [
    {
      id: 'period-2026-05-12',
      startDate: '2026-05-12',
      endDate: '',
      flow: '',
      painLevel: 0,
      symptoms: [],
      moods: [],
      care: [],
      note: '已知紀錄',
      createdAt: '2026-05-12T00:00:00.000Z'
    },
    {
      id: 'period-2026-06-09',
      startDate: '2026-06-09',
      endDate: '',
      flow: '',
      painLevel: 0,
      symptoms: [],
      moods: [],
      care: [],
      note: '已知紀錄，與上次相隔 28 天',
      createdAt: '2026-06-09T00:00:00.000Z'
    }
  ];
}
function normalizePeriodRecord(record: Partial<PeriodRecord>) {
  const startDate = normalizeDateSetting(record.startDate ?? '', '2026-01-01');
  const endDate = record.endDate ? normalizeDateSetting(record.endDate, startDate) : '';
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createLocalId('period'),
    startDate,
    endDate,
    flow: ['spotting', 'light', 'medium', 'heavy'].includes(String(record.flow)) ? (record.flow as PeriodRecord['flow']) : '',
    painLevel: clamp(Number(record.painLevel ?? 0), 0, 10),
    symptoms: Array.isArray(record.symptoms) ? record.symptoms.filter((item): item is string => typeof item === 'string') : [],
    moods: Array.isArray(record.moods) ? record.moods.filter((item): item is string => typeof item === 'string') : [],
    care: Array.isArray(record.care) ? record.care.filter((item): item is string => typeof item === 'string') : [],
    note: typeof record.note === 'string' ? record.note.slice(0, 80) : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString()
  };
}

function savePeriodRecords() {
  localStorage.setItem(storageKey('period-records'), JSON.stringify(periodRecords.value));
  requestCloudSync('period');
}

function loadPeriodRecords() {
  const stored = localStorage.getItem(storageKey('period-records'));
  if (!stored) {
    periodRecords.value = createDefaultPeriodRecords();
    localStorage.setItem(storageKey('period-records'), JSON.stringify(periodRecords.value));
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      periodRecords.value = parsed
        .filter((record) => typeof record?.startDate === 'string')
        .map((record) => normalizePeriodRecord(record))
        .slice(0, 36);
    }
  } catch {
    periodRecords.value = createDefaultPeriodRecords();
  }
}

function loadPeriodPrivacyMode() {
  periodPrivacyMode.value = localStorage.getItem(storageKey('period-privacy-mode')) === 'true';
}

function resetPeriodForm() {
  editingPeriodRecordId.value = '';
  newPeriodStartDate.value = '';
  newPeriodEndDate.value = '';
  newPeriodNote.value = '';
  newPeriodFlow.value = 'medium';
  newPeriodPainLevel.value = 2;
  newPeriodSymptoms.value = [];
  newPeriodMoods.value = [];
  newPeriodCare.value = [];
}

function addPeriodRecord() {
  if (!newPeriodStartDate.value) {
    periodMessage.value = '先選擇開始日期。';
    return;
  }

  const startDate = normalizeDateSetting(newPeriodStartDate.value);
  const endDate = newPeriodEndDate.value ? normalizeDateSetting(newPeriodEndDate.value) : '';
  if (endDate && parseLocalDate(endDate).getTime() < parseLocalDate(startDate).getTime()) {
    periodMessage.value = '結束日期不能早於開始日期。';
    return;
  }

  const existingRecord = editingPeriodRecord.value;
  const recordId = existingRecord?.id ?? createLocalId('period');
  periodRecords.value = [
    ...periodRecords.value.filter((record) => record.id !== recordId && record.startDate !== startDate),
    {
      id: recordId,
      startDate,
      endDate,
      flow: newPeriodFlow.value,
      painLevel: clamp(Number(newPeriodPainLevel.value), 0, 10),
      symptoms: [...newPeriodSymptoms.value],
      moods: [...newPeriodMoods.value],
      care: [...newPeriodCare.value],
      note: newPeriodNote.value.trim().slice(0, 80),
      createdAt: existingRecord?.createdAt ?? new Date().toISOString()
    }
  ].slice(-36);
  periodMessage.value = existingRecord ? '已更新這筆紀錄。' : '已記錄，預測已更新。';
  resetPeriodForm();
  savePeriodRecords();
  playSoftSound('success');
}

function removePeriodRecord(id: string) {
  periodRecords.value = periodRecords.value.filter((record) => record.id !== id);
  if (editingPeriodRecordId.value === id) {
    resetPeriodForm();
  }
  periodMessage.value = '已移除這筆紀錄。';
  savePeriodRecords();
}

function startEditPeriodRecord(id: string) {
  const record = periodRecords.value.find((item) => item.id === id);
  if (!record) return;
  editingPeriodRecordId.value = record.id;
  newPeriodStartDate.value = record.startDate;
  newPeriodEndDate.value = record.endDate;
  newPeriodNote.value = record.note;
  newPeriodFlow.value = record.flow || 'medium';
  newPeriodPainLevel.value = clamp(Number(record.painLevel ?? 0), 0, 10);
  newPeriodSymptoms.value = [...(record.symptoms ?? [])];
  newPeriodMoods.value = [...(record.moods ?? [])];
  newPeriodCare.value = [...(record.care ?? [])];
  periodMessage.value = '正在修改這筆紀錄。';
}

function cancelEditPeriodRecord() {
  resetPeriodForm();
  periodMessage.value = '已取消修改。';
}

function shiftPeriodCalendar(delta: number) {
  periodCalendarOffset.value = clamp(periodCalendarOffset.value + delta, -12, 12);
}

function resetPeriodCalendar() {
  periodCalendarOffset.value = 0;
}

function togglePeriodPrivacyMode() {
  periodPrivacyMode.value = !periodPrivacyMode.value;
  localStorage.setItem(storageKey('period-privacy-mode'), String(periodPrivacyMode.value));
  requestCloudSync('period');
}

function togglePeriodSelection(target: 'symptom' | 'mood' | 'care', id: string) {
  const source =
    target === 'symptom'
      ? newPeriodSymptoms
      : target === 'mood'
        ? newPeriodMoods
        : newPeriodCare;
  source.value = source.value.includes(id)
    ? source.value.filter((item) => item !== id)
    : [...source.value, id];
}

function updateOnlineState() {
  isOnline.value = navigator.onLine;
}

function updateViewportSize() {
  viewportSize.value = {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

async function loadMapWeather() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', weatherStations.map((station) => station.lat).join(','));
  url.searchParams.set('longitude', weatherStations.map((station) => station.lon).join(','));
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,precipitation,is_day');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');

  try {
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
    const payload = await response.json();
    const results = Array.isArray(payload) ? payload : [payload];
    const nextWeather = { ...mapWeather.value };
    weatherStations.forEach((station, index) => {
      const current = results[index]?.current;
      if (!current) return;
      const weatherCode = Number(current.weather_code ?? 0);
      const windSpeed = Number(current.wind_speed_10m ?? 0);
      const precipitation = Number(current.precipitation ?? 0);
      const temperature = Number(current.temperature_2m ?? Number.NaN);
      const kind = getWeatherKindFromCode(weatherCode, windSpeed, precipitation);
      nextWeather[station.id] = createWeatherSnapshot(
        kind,
        getWeatherLabel(kind),
        'live',
        Number.isFinite(temperature) ? Math.round(temperature) : null,
        Number.isFinite(windSpeed) ? Math.round(windSpeed) : null,
        Number.isFinite(precipitation) ? precipitation : null
      );
    });
    mapWeather.value = nextWeather;
  } catch {
    mapWeather.value = createFallbackWeatherMap();
  }
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  installReady.value = true;
}

function handleAppInstalled() {
  deferredInstallPrompt = null;
  installReady.value = false;
  installedDisplayMode.value = true;
}

function updateInstalledDisplayMode() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  installedDisplayMode.value = window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

function loadJourneyTrips() {
  const stored = localStorage.getItem(storageKey('journey-trips'));
  if (!stored) {
    journeyTrips.value = [createDefaultJourneyTrip()];
    activeJourneyTripId.value = journeyTrips.value[0]?.id ?? '';
    saveJourneyTrips(false);
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error('Journey trips must be an array.');
    const trips = parsed.map((trip) => normalizeJourneyTrip(trip, todayStart.value)).filter((trip): trip is JourneyTrip => Boolean(trip));
    journeyTrips.value = trips.length ? trips : [createDefaultJourneyTrip()];
  } catch {
    journeyTrips.value = [createDefaultJourneyTrip()];
  }

  const preferredTripId = localStorage.getItem(storageKey('active-journey-trip')) ?? '';
  const preferredTrip = journeyTrips.value.find((trip) => trip.id === preferredTripId);
  activeJourneyTripId.value = preferredTrip?.id ?? getNearestJourneyTrip(journeyTrips.value, todayStart.value)?.id ?? journeyTrips.value[0]?.id ?? '';
}

function saveJourneyTrips(sync = true) {
  localStorage.setItem(storageKey('journey-trips'), JSON.stringify(journeyTrips.value));
  if (activeJourneyTripId.value) {
    localStorage.setItem(storageKey('active-journey-trip'), activeJourneyTripId.value);
  }
  if (sync) requestCloudSync('journey');
}

function selectJourneyTrip(tripId: string) {
  activeJourneyTripId.value = tripId;
  activeJourneyDayId.value = '';
  localStorage.setItem(storageKey('active-journey-trip'), tripId);
  requestCloudSync('journey');
}

function selectJourneyDay(dayId: string) {
  activeJourneyDayId.value = dayId;
}

function getInputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}

function getTextareaValue(event: Event) {
  return (event.target as HTMLTextAreaElement).value;
}

function selectJourneyTripFromEvent(event: Event) {
  selectJourneyTrip(getInputValue(event));
}

function createBlankJourneyTrip() {
  const today = formatDateKey(todayStart.value);
  const title = journeyNewTripTitle.value.trim() || `新的旅程 ${formatJourneyDateLabel(today)}`;
  const trip: JourneyTrip = {
    id: createLocalId('trip'),
    title,
    startDate: today,
    endDate: today,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceName: '手動建立',
    days: [createJourneyDay(1, today)]
  };
  journeyTrips.value = [trip, ...journeyTrips.value];
  activeJourneyTripId.value = trip.id;
  activeJourneyDayId.value = trip.days[0]?.id ?? '';
  journeyNewTripTitle.value = '';
  journeyPanelMode.value = 'schedule';
  journeyImportMessage.value = '已建立新的空白旅程。';
  saveJourneyTrips();
}

function updateActiveJourneyTitle(value: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  const title = value.trim() || '未命名旅程';
  if (title === trip.title) return;
  updateJourneyTrip(trip.id, { title });
}

function removeJourneyTrip(tripId: string) {
  if (journeyTrips.value.length <= 1) {
    journeyImportMessage.value = '至少保留一個旅程。';
    return;
  }
  journeyTrips.value = journeyTrips.value.filter((trip) => trip.id !== tripId);
  activeJourneyTripId.value = getNearestJourneyTrip(journeyTrips.value, todayStart.value)?.id ?? journeyTrips.value[0]?.id ?? '';
  journeyImportMessage.value = '已刪除旅程。';
  saveJourneyTrips();
}

function addJourneyDay() {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  const fallback = trip.days.length ? addDays(parseDateToDay(trip.days[trip.days.length - 1].date), 1) : todayStart.value;
  const date = normalizeImportedDate(journeyNewDayDate.value, fallback) || formatDateKey(fallback);
  const nextDay = createJourneyDay(trip.days.length + 1, date);
  updateJourneyTrip(trip.id, {
    days: renumberJourneyDays([...trip.days, nextDay])
  });
  activeJourneyDayId.value = nextDay.id;
  journeyNewDayDate.value = '';
  journeyImportMessage.value = '已新增一天。';
}

function removeJourneyDay(dayId: string) {
  const trip = activeJourneyTrip.value;
  if (!trip || trip.days.length <= 1) return;
  updateJourneyTrip(trip.id, {
    days: renumberJourneyDays(trip.days.filter((day) => day.id !== dayId))
  });
  if (activeJourneyDayId.value === dayId) activeJourneyDayId.value = '';
}

function addJourneyEntry(dayId: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  updateJourneyTrip(trip.id, {
    days: trip.days.map((day) =>
      day.id === dayId
        ? {
            ...day,
            entries: [
              ...day.entries,
              createJourneyEntry({
                dayLabel: day.dayLabel,
                date: day.date,
                city: day.city,
                plan: '',
                stay: day.stay,
                transport: '',
                duration: '',
                note: ''
              }, JOURNEY_AUTO_TIME_SLOTS[Math.min(day.entries.length, JOURNEY_AUTO_TIME_SLOTS.length - 1)])
            ]
          }
        : day
    )
  });
}

function updateJourneyDayField(dayId: string, field: 'date' | 'city' | 'stay', value: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  updateJourneyTrip(trip.id, {
    days: trip.days.map((day) => (day.id === dayId ? { ...day, [field]: value } : day))
  });
}

function updateJourneyEntryField(dayId: string, entryId: string, field: JourneyEditableEntryField, value: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  updateJourneyTrip(trip.id, {
    days: trip.days.map((day) =>
      day.id === dayId
        ? {
            ...day,
            entries: day.entries.map((entry) => (entry.id === entryId ? { ...entry, [field]: value } : entry))
          }
        : day
    )
  });
}

function toggleJourneyEntryDone(dayId: string, entryId: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  const target = trip.days.find((day) => day.id === dayId)?.entries.find((entry) => entry.id === entryId);
  updateJourneyTrip(trip.id, {
    days: trip.days.map((day) =>
      day.id === dayId
        ? {
            ...day,
            entries: day.entries.map((entry) => (entry.id === entryId ? { ...entry, done: !entry.done } : entry))
          }
        : day
    )
  });
  if (target && !target.done) {
    playSoftSound('success');
  }
  gentleVibrate(8);
}

function removeJourneyEntry(dayId: string, entryId: string) {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  updateJourneyTrip(trip.id, {
    days: trip.days.map((day) =>
      day.id === dayId
        ? { ...day, entries: day.entries.filter((entry) => entry.id !== entryId) }
        : day
    )
  });
}

function autoScheduleActiveJourney() {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  updateJourneyTrip(trip.id, {
    days: trip.days.map(autoScheduleJourneyDay)
  });
  journeyPanelMode.value = 'schedule';
  journeyImportMessage.value = '已依目前旅程資料重新產生分時安排。';
}

function updateJourneyTrip(tripId: string, patch: Partial<JourneyTrip>) {
  journeyTrips.value = journeyTrips.value.map((trip) => {
    if (trip.id !== tripId) return trip;
    const next = normalizeJourneyTrip({
      ...trip,
      ...patch,
      updatedAt: new Date().toISOString()
    }, todayStart.value);
    return next ?? trip;
  });
  saveJourneyTrips();
}

async function importJourneyFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  journeyImportBusy.value = true;
  journeyOcrProgress.value = 0;
  journeyImportMessage.value = '正在讀取檔案...';

  try {
    const rows = file.type.startsWith('image/')
      ? await parseJourneyRowsFromImage(file)
      : await parseJourneyRowsFromSpreadsheetFile(file);
    importJourneyRows(rows, file.name);
  } catch (error) {
    journeyImportMessage.value = error instanceof Error ? error.message : '匯入失敗，請確認檔案內容。';
  } finally {
    journeyImportBusy.value = false;
    journeyOcrProgress.value = 0;
    input.value = '';
  }
}

function importJourneyText() {
  try {
    const rows = parseJourneyRowsFromText(journeyImportText.value);
    importJourneyRows(rows, '貼上的表格文字');
    journeyImportText.value = '';
  } catch (error) {
    journeyImportMessage.value = error instanceof Error ? error.message : '表格文字無法解析。';
  }
}

async function parseJourneyRowsFromImage(file: File) {
  journeyImportMessage.value = '正在辨識圖片文字，第一次會稍久一點。';
  const worker = await createWorker('chi_tra+eng', undefined, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        journeyOcrProgress.value = Math.round((message.progress ?? 0) * 100);
      }
    }
  });

  try {
    const result = await worker.recognize(file);
    const text = result.data.text.trim();
    if (!text) throw new Error('圖片沒有辨識到可用文字，請換更清晰的截圖或貼上表格文字。');
    journeyImportText.value = text;
    return parseJourneyRowsFromText(text);
  } finally {
    await worker.terminate();
  }
}

async function parseJourneyRowsFromSpreadsheetFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('檔案裡沒有可讀取的工作表。');
  const sheet = workbook.Sheets[firstSheet];
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(sheet, {
    header: 1,
    defval: ''
  });
  return parseJourneyRowsFromMatrix(matrix);
}

function importJourneyRows(rows: JourneyImportRow[], sourceName: string) {
  const trip = buildJourneyTripFromRows(rows, sourceName, todayStart.value);
  journeyTrips.value = [trip, ...journeyTrips.value];
  activeJourneyTripId.value = trip.id;
  activeJourneyDayId.value = trip.days[0]?.id ?? '';
  journeyImportMessage.value = `已建立「${trip.title}」，共 ${trip.days.length} 天。`;
  activeTab.value = 'journey';
  saveJourneyTrips();
}

function exportActiveJourneyCalendar() {
  const trip = activeJourneyTrip.value;
  if (!trip) return;
  const events = trip.days.flatMap((day) =>
    day.entries
      .filter((entry) => entry.plan || entry.transport || entry.note)
      .map((entry, index) => {
        const start = parseJourneyEntryDateTime(day.date, entry.time, index);
        const end = parseJourneyEntryEndDateTime(day.date, entry.endTime, start);
        return {
          title: entry.plan || entry.transport || `${trip.title} ${day.dayLabel}`,
          description: [
            day.city && `城市：${day.city}`,
            entry.stay && `住宿：${entry.stay}`,
            entry.transport && `交通：${entry.transport}`,
            entry.duration && `車程/時間：${entry.duration}`,
            entry.note && `備註：${entry.note}`
          ]
            .filter(Boolean)
            .join('\n'),
          start,
          end
        };
      })
  );
  if (!events.length) {
    journeyImportMessage.value = '目前沒有可匯出的行程。';
    return;
  }
  downloadCalendar(events, `${trip.title}-journey.ics`);
  journeyImportMessage.value = '已匯出旅程行事曆。';
}

function updateAppThemeChrome(theme: ThemeId) {
  const chrome = THEME_CHROME_COLORS[theme];
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const statusBarMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (themeColorMeta) themeColorMeta.content = chrome.color;
  if (statusBarMeta) statusBarMeta.content = chrome.statusBar;
  document.documentElement.style.setProperty('--app-page-background', chrome.background);
  document.documentElement.style.background = chrome.background;
  document.body.style.background = chrome.background;
}

async function installApp() {
  const promptEvent = deferredInstallPrompt as (Event & { prompt?: () => Promise<void> }) | null;
  if (!promptEvent?.prompt) return;
  await promptEvent.prompt();
  deferredInstallPrompt = null;
  installReady.value = false;
  updateInstalledDisplayMode();
}

async function checkForAppUpdate() {
  await checkServiceWorkerUpdate(() => {
    updateReady.value = true;
  });
}

async function refreshForUpdate() {
  refreshingForUpdate = true;
  await refreshForWaitingServiceWorker();
  window.location.reload();
}

function handleControllerChange() {
  if (refreshingForUpdate) return;
  refreshingForUpdate = true;
  window.location.reload();
}

function updateSceneTilt(event: PointerEvent) {
  if (settings.value.reducedMotion) return;
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  sceneTilt.value = {
    x: clamp((event.clientY / height - 0.5) * -5, -3, 3),
    y: clamp((event.clientX / width - 0.5) * 5, -3, 3)
  };
}

function exportMeetingCalendar() {
  const reminderDate = new Date(targetDate.value);
  reminderDate.setDate(reminderDate.getDate() - 7);
  downloadCalendar(
    [
      {
        title: '第一次見面倒數：最後一週',
        description: `${displayGirlName.value} 飛向 ${displayBoyName.value}，開始整理心情、行李和想說的話。`,
        start: reminderDate,
        end: new Date(reminderDate.getTime() + 60 * 60 * 1000)
      },
      {
        title: '第一次見面',
        description: dailyReceipt.value,
        start: targetDate.value,
        end: new Date(targetDate.value.getTime() + 3 * 60 * 60 * 1000)
      }
    ],
    'first-meeting-countdown.ics'
  );
  importMessage.value = '已匯出行事曆。';
}

type SoftSoundKind = 'tap' | 'success' | 'paper' | 'secret' | 'radar';
type BackgroundRole = 'pad' | 'bass' | 'melody' | 'shimmer' | 'musicbox' | 'windbell' | 'drone' | 'beacon';
type BackgroundNote = { note: number; beat: number; duration: number; volume: number };
type BackgroundChord = { notes: number[]; beat: number; duration: number; volume: number };
type BackgroundMusicTheme = {
  style: 'lullaby' | 'chimes' | 'nocturne';
  bpm: number;
  loopBeats: number;
  masterVolume: number;
  filterFrequency: number;
  echoDelay: number;
  echoVolume: number;
  padWave: OscillatorType;
  melodyWave: OscillatorType;
  bassWave: OscillatorType;
  chords: BackgroundChord[];
  bass: BackgroundNote[];
  melody: BackgroundNote[];
  shimmer: BackgroundNote[];
};

const backgroundMusicThemes: Record<ThemeId, BackgroundMusicTheme> = {
  peach: createBackgroundMusicTheme({
    style: 'lullaby',
    bpm: 58,
    loopBeats: 72,
    masterVolume: 0.38,
    filterFrequency: 2600,
    echoDelay: 0.46,
    echoVolume: 0.055,
    padWave: 'triangle',
    melodyWave: 'sine',
    bassWave: 'sine',
    chordBeats: 4,
    chordVolume: 0.018,
    bassVolume: 0.012,
    melodyVolume: 0.02,
    shimmerVolume: 0.006,
    chords: [
      [48, 55, 59, 64],
      [45, 52, 57, 60],
      [41, 48, 55, 60],
      [43, 50, 55, 59],
      [48, 55, 60, 64],
      [45, 52, 55, 60],
      [41, 48, 52, 57],
      [43, 50, 55, 62],
      [45, 52, 57, 64],
      [40, 47, 52, 55],
      [41, 48, 55, 60],
      [43, 50, 55, 59],
      [48, 55, 59, 64],
      [52, 55, 60, 67],
      [41, 48, 55, 64],
      [43, 50, 55, 62]
    ],
    bassNotes: [36, 36, 45, 45, 41, 41, 43, 43, 36, 36, 45, 45, 41, 43, 48, 43],
    melodyNotes: [
      64, 67, 69, 67, 64, 62, 60, -1, 62, 64, 67, 72, 71, 69, 67, -1,
      64, 67, 69, 74, 72, 69, 67, 64, 60, 62, 64, 67, 69, 67, 64, -1,
      67, 69, 72, 76, 74, 72, 69, 67, 64, 65, 67, 72, 71, 69, 67, -1,
      64, 67, 69, 67, 64, 62, 60, -1, 60, 64, 67, 72, 76, 74, 72, -1
    ],
    shimmerNotes: [76, -1, 79, -1, 81, 79, 76, -1, 72, -1, 76, 79, 84, -1, 81, -1]
  }),
  mint: createBackgroundMusicTheme({
    style: 'chimes',
    bpm: 92,
    loopBeats: 64,
    masterVolume: 0.28,
    filterFrequency: 7200,
    echoDelay: 0.22,
    echoVolume: 0.18,
    padWave: 'sine',
    melodyWave: 'sine',
    bassWave: 'triangle',
    chordBeats: 4,
    chordVolume: 0.012,
    bassVolume: 0.009,
    melodyVolume: 0.018,
    shimmerVolume: 0.009,
    chords: [
      [50, 57, 62, 66],
      [45, 52, 57, 61],
      [47, 54, 59, 62],
      [43, 50, 57, 62],
      [50, 57, 61, 66],
      [42, 49, 54, 57],
      [47, 54, 59, 66],
      [45, 52, 57, 61],
      [50, 57, 62, 69],
      [45, 52, 57, 61],
      [43, 50, 55, 59],
      [47, 54, 59, 62],
      [50, 57, 62, 66],
      [54, 61, 66, 69],
      [47, 54, 59, 66],
      [45, 52, 57, 64]
    ],
    bassNotes: [38, 38, 45, 45, 43, 43, 47, 47, 38, 42, 47, 45, 38, 45, 43, 47],
    melodyNotes: [
      62, 66, 69, 74, 73, 69, 66, 64, 62, -1, 64, 66, 69, 71, 69, -1,
      66, 69, 74, 78, 76, 74, 71, 69, 67, 66, 64, 66, 69, 74, 73, -1,
      69, 71, 74, 81, 78, 76, 74, 71, 69, -1, 66, 69, 74, 76, 74, -1,
      62, 66, 69, 74, 73, 69, 66, 64, 62, 64, 66, 69, 71, 69, 66, -1
    ],
    shimmerNotes: [86, 83, -1, 81, 78, -1, 81, 83, 86, -1, 88, 86, 83, -1, 81, -1]
  }),
  night: createBackgroundMusicTheme({
    style: 'nocturne',
    bpm: 44,
    loopBeats: 48,
    masterVolume: 0.48,
    filterFrequency: 1200,
    echoDelay: 0.72,
    echoVolume: 0.04,
    padWave: 'sine',
    melodyWave: 'sine',
    bassWave: 'sine',
    chordBeats: 4,
    chordVolume: 0.02,
    bassVolume: 0.016,
    melodyVolume: 0.017,
    shimmerVolume: 0.004,
    chords: [
      [45, 52, 57, 60],
      [40, 47, 52, 55],
      [41, 48, 52, 57],
      [43, 50, 55, 59],
      [45, 52, 57, 64],
      [36, 43, 48, 52],
      [41, 48, 55, 60],
      [43, 50, 55, 62],
      [45, 52, 57, 60],
      [40, 47, 52, 59],
      [38, 45, 50, 53],
      [43, 50, 55, 59],
      [45, 52, 57, 64],
      [48, 55, 60, 64],
      [41, 48, 52, 57],
      [43, 50, 55, 59]
    ],
    bassNotes: [33, 33, 28, 28, 29, 29, 31, 31, 33, 28, 29, 31, 33, 36, 29, 31],
    melodyNotes: [
      69, -1, 72, 74, 72, 69, 67, -1, 64, 67, 69, 72, 71, 69, 64, -1,
      69, 72, 76, 79, 76, 74, 72, -1, 67, 69, 72, 74, 72, 69, 67, -1,
      64, 67, 69, 72, 76, 74, 72, 69, 67, -1, 64, 67, 69, 72, 71, -1,
      69, 72, 74, 76, 74, 72, 69, 67, 64, -1, 67, 69, 72, 74, 69, -1
    ],
    shimmerNotes: [81, -1, 84, -1, 88, -1, 86, -1, 84, -1, 81, -1, 79, -1, 81, -1]
  })
};

const backgroundAudioSources: Record<ThemeId, string> = {
  peach: `${import.meta.env.BASE_URL}audio/theme-peach.wav`,
  mint: `${import.meta.env.BASE_URL}audio/theme-mint.wav`,
  night: `${import.meta.env.BASE_URL}audio/theme-night.wav`
};

const backgroundStingerSources: Record<ThemeId, string> = {
  peach: `${import.meta.env.BASE_URL}audio/theme-peach-stinger.wav`,
  mint: `${import.meta.env.BASE_URL}audio/theme-mint-stinger.wav`,
  night: `${import.meta.env.BASE_URL}audio/theme-night-stinger.wav`
};

const backgroundAudioVolumes: Record<ThemeId, number> = {
  peach: 0.42,
  mint: 0.36,
  night: 0.44
};

function getAudioContext() {
  if (audioContext && audioContext.state !== 'closed') return audioContext;

  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
}

function unlockAudio() {
  if (!settings.value.soundFeedback) return null;

  const context = getAudioContext();
  if (!context) return null;
  if (context.state === 'suspended') {
    void context.resume();
  }
  audioUnlocked.value = true;
  return context;
}

function handleAppPointerDown(event: PointerEvent) {
  const context = unlockAudio();
  if (!context) return;
  if (appUnlocked.value) {
    startBackgroundMusic();
  }
  if (isInteractiveAudioTarget(event.target)) {
    playSoftSound('tap');
  }
}

function handleAppKeyDown(event: KeyboardEvent) {
  if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
  if (!isInteractiveAudioTarget(event.target)) return;
  const context = unlockAudio();
  if (!context) return;
  if (appUnlocked.value) {
    startBackgroundMusic();
  }
  playSoftSound('tap');
}

function isInteractiveAudioTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, label, select, summary, [role="button"], input[type="checkbox"], input[type="range"]'));
}

function playSoftSound(kind: SoftSoundKind) {
  if (!settings.value.soundFeedback) return;
  const context = unlockAudio();
  if (!context) return;

  const presets: Record<SoftSoundKind, { frequencies: number[]; duration: number; volume: number; type: OscillatorType }> = {
    tap: { frequencies: [520], duration: 0.08, volume: 0.018, type: 'sine' },
    success: { frequencies: [523.25, 659.25, 783.99], duration: 0.22, volume: 0.03, type: 'sine' },
    paper: { frequencies: [392, 493.88], duration: 0.18, volume: 0.026, type: 'triangle' },
    secret: { frequencies: [659.25, 880], duration: 0.24, volume: 0.034, type: 'sine' },
    radar: { frequencies: [220, 330], duration: 0.2, volume: 0.03, type: 'triangle' }
  };
  const preset = presets[kind];
  const startTime = context.currentTime;

  preset.frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const offset = index * 0.045;
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(frequency, startTime + offset);
    gain.gain.setValueAtTime(0.0001, startTime + offset);
    gain.gain.exponentialRampToValueAtTime(preset.volume, startTime + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + preset.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime + offset);
    oscillator.stop(startTime + offset + preset.duration + 0.04);
  });
}

function playThemeSwitchMotif(theme: ThemeId) {
  if (!settings.value.soundFeedback) return;

  themeStingerAudio?.pause();
  themeStingerAudio = new Audio(backgroundStingerSources[theme]);
  themeStingerAudio.volume = Math.min(backgroundAudioVolumes[theme] + 0.16, 0.62);
  void themeStingerAudio.play().catch(() => {
    playThemeSwitchFallback(theme);
  });
}

function playThemeSwitchFallback(theme: ThemeId) {
  const context = unlockAudio();
  if (!context) return;

  const motifs: Record<ThemeId, Array<{ note: number; at: number; duration: number; volume: number; role: BackgroundRole }>> = {
    peach: [
      { note: 65, at: 0, duration: 0.8, volume: 0.028, role: 'musicbox' },
      { note: 69, at: 0.24, duration: 0.9, volume: 0.026, role: 'musicbox' },
      { note: 72, at: 0.5, duration: 1.1, volume: 0.024, role: 'musicbox' }
    ],
    mint: [
      { note: 86, at: 0, duration: 0.9, volume: 0.024, role: 'windbell' },
      { note: 93, at: 0.16, duration: 1.1, volume: 0.022, role: 'windbell' },
      { note: 98, at: 0.32, duration: 1.2, volume: 0.018, role: 'windbell' }
    ],
    night: [
      { note: 28, at: 0, duration: 1.6, volume: 0.036, role: 'drone' },
      { note: 52, at: 0.34, duration: 1.4, volume: 0.018, role: 'beacon' },
      { note: 76, at: 1.08, duration: 1.0, volume: 0.008, role: 'windbell' }
    ]
  };

  motifs[theme].forEach((item) => {
    scheduleDirectTone({
      context,
      note: item.note,
      startTime: context.currentTime + item.at,
      duration: item.duration,
      volume: item.volume,
      type: 'sine',
      role: item.role
    });
  });
}

function createBackgroundMusicTheme(config: {
  style: 'lullaby' | 'chimes' | 'nocturne';
  bpm: number;
  loopBeats: number;
  masterVolume: number;
  filterFrequency: number;
  echoDelay: number;
  echoVolume: number;
  padWave: OscillatorType;
  melodyWave: OscillatorType;
  bassWave: OscillatorType;
  chordBeats: number;
  chordVolume: number;
  bassVolume: number;
  melodyVolume: number;
  shimmerVolume: number;
  chords: number[][];
  bassNotes: number[];
  melodyNotes: number[];
  shimmerNotes: number[];
}): BackgroundMusicTheme {
  return {
    style: config.style,
    bpm: config.bpm,
    loopBeats: config.loopBeats,
    masterVolume: config.masterVolume,
    filterFrequency: config.filterFrequency,
    echoDelay: config.echoDelay,
    echoVolume: config.echoVolume,
    padWave: config.padWave,
    melodyWave: config.melodyWave,
    bassWave: config.bassWave,
    chords: config.chords.map((notes, index) => ({
      notes,
      beat: index * config.chordBeats,
      duration: config.chordBeats + 1.25,
      volume: config.chordVolume
    })),
    bass: makeBackgroundLine(config.bassNotes, [4], 0, 1.05, config.bassVolume, config.loopBeats),
    melody: makeBackgroundLine(config.melodyNotes, [1.5, 1, 1.5, 2, 1.5, 1, 2, 2], 0, 1.08, config.melodyVolume, config.loopBeats),
    shimmer: makeBackgroundLine(config.shimmerNotes, [4, 2, 2, 4, 4], 0.55, 0.9, config.shimmerVolume, config.loopBeats)
  };
}

function makeBackgroundLine(notes: number[], rhythm: number[], startBeat: number, sustainRatio: number, volume: number, loopBeats: number) {
  let beat = startBeat;
  const line: BackgroundNote[] = [];

  notes.forEach((note, index) => {
    const step = rhythm[index % rhythm.length];
    if (note >= 0 && beat < loopBeats) {
      line.push({
        note,
        beat,
        duration: Math.max(step * sustainRatio, 0.08),
        volume
      });
    }
    beat += step;
  });

  return line;
}

function midiToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function startBackgroundMusic() {
  if (!settings.value.soundFeedback || bgmPlaying.value) return;
  const context = unlockAudio();
  if (!context) return;

  const themeId = previewTheme.value || settings.value.theme;
  const audio = new Audio(backgroundAudioSources[themeId]);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.0001;
  bgmAudio = audio;
  bgmPlaying.value = true;
  const playResult = audio.play();
  fadeBackgroundAudio(audio, backgroundAudioVolumes[themeId], 1400);

  if (playResult) {
    void playResult.catch(() => {
      if (bgmAudio === audio) {
        bgmAudio = null;
        bgmPlaying.value = false;
        startGeneratedBackgroundMusic();
      }
    });
  }
}

function startGeneratedBackgroundMusic() {
  if (!settings.value.soundFeedback || bgmPlaying.value) return;
  const context = unlockAudio();
  if (!context) return;

  const theme = backgroundMusicThemes[previewTheme.value || settings.value.theme];
  bgmGain = context.createGain();
  bgmFilter = context.createBiquadFilter();
  bgmDelay = context.createDelay(1.2);
  bgmDelayGain = context.createGain();
  bgmFeedbackGain = context.createGain();
  bgmGain.gain.setValueAtTime(0.0001, context.currentTime);
  bgmGain.gain.exponentialRampToValueAtTime(theme.masterVolume, context.currentTime + 1.4);
  bgmFilter.type = 'lowpass';
  bgmFilter.frequency.setValueAtTime(theme.filterFrequency, context.currentTime);
  bgmFilter.Q.setValueAtTime(0.65, context.currentTime);
  bgmDelay.delayTime.setValueAtTime(theme.echoDelay, context.currentTime);
  bgmDelayGain.gain.setValueAtTime(theme.echoVolume, context.currentTime);
  bgmFeedbackGain.gain.setValueAtTime(theme.style === 'chimes' ? 0.22 : theme.style === 'nocturne' ? 0.1 : 0.14, context.currentTime);
  bgmGain.connect(bgmFilter);
  bgmFilter.connect(context.destination);
  bgmFilter.connect(bgmDelay);
  bgmDelay.connect(bgmDelayGain);
  bgmDelayGain.connect(bgmFeedbackGain);
  bgmFeedbackGain.connect(bgmDelay);
  bgmDelayGain.connect(context.destination);

  bgmPlaying.value = true;
  scheduleBackgroundPhrase();
  bgmTimer = window.setInterval(scheduleBackgroundPhrase, Math.round((theme.loopBeats * 60 * 1000) / theme.bpm));
}

function fadeBackgroundAudio(audio: HTMLAudioElement, targetVolume: number, durationMs: number) {
  if (bgmAudioFadeTimer) {
    window.clearInterval(bgmAudioFadeTimer);
    bgmAudioFadeTimer = undefined;
  }

  const startedAt = performance.now();
  const startVolume = audio.volume;
  bgmAudioFadeTimer = window.setInterval(() => {
    const progress = Math.min((performance.now() - startedAt) / durationMs, 1);
    audio.volume = startVolume + (targetVolume - startVolume) * progress;
    if (progress >= 1 && bgmAudioFadeTimer) {
      window.clearInterval(bgmAudioFadeTimer);
      bgmAudioFadeTimer = undefined;
    }
  }, 50);
}

function scheduleBackgroundPhrase() {
  const context = audioContext && audioContext.state !== 'closed' ? audioContext : null;
  if (!context || !bgmGain || !settings.value.soundFeedback) return;

  const theme = backgroundMusicThemes[previewTheme.value || settings.value.theme];
  const beatSeconds = 60 / theme.bpm;
  const startTime = context.currentTime + 0.12;

  if (theme.style === 'lullaby') {
    schedulePeachLullaby(context, theme, startTime, beatSeconds);
    return;
  }

  if (theme.style === 'chimes') {
    scheduleMintChimes(context, theme, startTime, beatSeconds);
    return;
  }

  scheduleNightNocturne(context, theme, startTime, beatSeconds);
}

function schedulePeachLullaby(context: AudioContext, theme: BackgroundMusicTheme, startTime: number, beatSeconds: number) {
  const chords = [
    { beat: 0, notes: [41, 48, 53, 57] },
    { beat: 8, notes: [45, 52, 57, 60] },
    { beat: 16, notes: [46, 53, 58, 62] },
    { beat: 24, notes: [43, 50, 55, 58] },
    { beat: 32, notes: [41, 48, 53, 60] },
    { beat: 40, notes: [48, 55, 60, 64] },
    { beat: 48, notes: [46, 53, 57, 62] },
    { beat: 56, notes: [43, 50, 55, 62] },
    { beat: 64, notes: [41, 48, 53, 57] }
  ];
  chords.forEach((chord) => {
    chord.notes.forEach((note, index) => {
      scheduleBackgroundTone({
        context,
        note,
        startTime: startTime + chord.beat * beatSeconds,
        duration: 9.8 * beatSeconds,
        volume: 0.013 + index * 0.0008,
        type: index === 0 ? 'sine' : 'triangle',
        detune: index % 2 === 0 ? -3 : 3,
        role: 'pad'
      });
    });
  });

  const bass = [
    { beat: 0, note: 29 }, { beat: 8, note: 33 }, { beat: 16, note: 34 }, { beat: 24, note: 31 },
    { beat: 32, note: 29 }, { beat: 40, note: 36 }, { beat: 48, note: 34 }, { beat: 56, note: 31 }, { beat: 64, note: 29 }
  ];
  bass.forEach((item) => {
    scheduleBackgroundTone({
      context,
      note: item.note,
      startTime: startTime + item.beat * beatSeconds,
      duration: 6.8 * beatSeconds,
      volume: 0.009,
      type: 'sine',
      detune: -5,
      role: 'bass'
    });
  });

  const melody = [
    { beat: 3, note: 65, duration: 3.8 }, { beat: 9, note: 64, duration: 3.4 },
    { beat: 15, note: 60, duration: 4.6 }, { beat: 23, note: 58, duration: 3.6 },
    { beat: 30, note: 60, duration: 4.2 }, { beat: 37, note: 65, duration: 4.8 },
    { beat: 45, note: 67, duration: 4.2 }, { beat: 52, note: 64, duration: 5.2 },
    { beat: 61, note: 60, duration: 6.4 }, { beat: 68, note: 57, duration: 4.2 }
  ];
  melody.forEach((item) => {
    scheduleBackgroundTone({
      context,
      note: item.note,
      startTime: startTime + item.beat * beatSeconds,
      duration: item.duration * beatSeconds,
      volume: 0.014,
      type: theme.melodyWave,
      role: 'beacon'
    });
  });

  const musicBox = [
    { beat: 1, notes: [65, 69, 72] }, { beat: 9, notes: [64, 69, 72] },
    { beat: 17, notes: [62, 65, 70] }, { beat: 25, notes: [58, 62, 67] },
    { beat: 33, notes: [65, 69, 72] }, { beat: 41, notes: [67, 72, 76] },
    { beat: 49, notes: [62, 65, 70] }, { beat: 57, notes: [62, 67, 74] },
    { beat: 65, notes: [65, 69, 72] }
  ];
  musicBox.forEach((phrase) => {
    phrase.notes.forEach((note, index) => {
      scheduleBackgroundTone({
        context,
        note,
        startTime: startTime + (phrase.beat + index * 0.62) * beatSeconds,
        duration: 1.35 * beatSeconds,
        volume: 0.009,
        type: 'triangle',
        detune: index === 1 ? 3 : -2,
        role: 'musicbox'
      });
    });
  });
}

function scheduleMintChimes(context: AudioContext, theme: BackgroundMusicTheme, startTime: number, beatSeconds: number) {
  const chimes = [
    74, 78, 81, 86, 83, 81, 78, 76,
    74, 76, 78, 83, 86, 88, 86, 83,
    78, 81, 83, 88, 90, 88, 86, 81,
    76, 78, 81, 83, 81, 78, 76, 74
  ];
  chimes.forEach((note, index) => {
    const beat = index * 1.55 + (index % 4 === 2 ? 0.18 : 0);
    scheduleBackgroundTone({
      context,
      note,
      startTime: startTime + beat * beatSeconds,
      duration: 1.05 * beatSeconds,
      volume: index % 5 === 0 ? 0.011 : 0.008,
      type: 'sine',
      detune: index % 2 === 0 ? 10 : -7,
      role: 'windbell'
    });
  });

  const glassPads = [
    { beat: 0, notes: [50, 57, 62, 66] },
    { beat: 12, notes: [45, 52, 57, 62] },
    { beat: 24, notes: [47, 54, 59, 66] },
    { beat: 36, notes: [42, 50, 57, 62] },
    { beat: 48, notes: [50, 57, 62, 69] }
  ];
  glassPads.forEach((chord) => {
    chord.notes.forEach((note, index) => {
      scheduleBackgroundTone({
        context,
        note,
        startTime: startTime + chord.beat * beatSeconds,
        duration: 8.4 * beatSeconds,
        volume: 0.0055 + index * 0.0007,
        type: 'sine',
        detune: index === 1 ? 11 : -6,
        role: 'pad'
      });
    });
  });

  const windLine = [
    { beat: 6, note: 69 }, { beat: 13, note: 74 }, { beat: 21, note: 78 }, { beat: 29, note: 81 },
    { beat: 38, note: 83 }, { beat: 46, note: 81 }, { beat: 54, note: 78 }, { beat: 61, note: 74 }
  ];
  windLine.forEach((item) => {
    scheduleBackgroundTone({
      context,
      note: item.note,
      startTime: startTime + item.beat * beatSeconds,
      duration: 3.6 * beatSeconds,
      volume: 0.009,
      type: theme.melodyWave,
      detune: 5,
      role: 'windbell'
    });
  });
}

function scheduleNightNocturne(context: AudioContext, theme: BackgroundMusicTheme, startTime: number, beatSeconds: number) {
  const drones = [
    { beat: 0, notes: [33, 40, 45, 48] },
    { beat: 16, notes: [31, 38, 43, 47] },
    { beat: 32, notes: [29, 36, 41, 45] }
  ];
  drones.forEach((chord) => {
    chord.notes.forEach((note, index) => {
      scheduleBackgroundTone({
        context,
        note,
        startTime: startTime + chord.beat * beatSeconds,
        duration: 19 * beatSeconds,
        volume: index === 0 ? 0.017 : 0.008,
        type: 'sine',
        detune: index % 2 === 0 ? -7 : 6,
        role: index === 0 ? 'drone' : 'pad'
      });
    });
  });

  const beacon = [
    { beat: 5, note: 64, duration: 6.5 }, { beat: 17, note: 67, duration: 5.5 },
    { beat: 28, note: 69, duration: 7 }, { beat: 40, note: 60, duration: 6 }
  ];
  beacon.forEach((item) => {
    scheduleBackgroundTone({
      context,
      note: item.note,
      startTime: startTime + item.beat * beatSeconds,
      duration: item.duration * beatSeconds,
      volume: 0.01,
      type: theme.melodyWave,
      detune: -2,
      role: 'beacon'
    });
  });

  const stars = [
    { beat: 11, note: 76 }, { beat: 25, note: 79 }, { beat: 37, note: 72 }, { beat: 45, note: 81 }
  ];
  stars.forEach((item) => {
    scheduleBackgroundTone({
      context,
      note: item.note,
      startTime: startTime + item.beat * beatSeconds,
      duration: 3.2 * beatSeconds,
      volume: 0.0036,
      type: 'sine',
      detune: 4,
      role: 'shimmer'
    });
  });
}

function scheduleBackgroundTone({
  context,
  note,
  startTime,
  duration,
  volume,
  type,
  detune = 0,
  role
}: {
  context: AudioContext;
  note: number;
  startTime: number;
  duration: number;
  volume: number;
  type: OscillatorType;
  detune?: number;
  role: BackgroundRole;
}) {
  const frequency = midiToFrequency(note);
  const oscillators: OscillatorNode[] = [];
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const envelope = getBackgroundEnvelope(role, duration);
  const attack = envelope.attack;
  const release = envelope.release;
  const endTime = startTime + duration;
  const filterSettings = getBackgroundFilterSettings(role, frequency);
  const chorus = getBackgroundChorus(role);
  const targetVolume = volume * chorus.gainScale;

  filter.type = filterSettings.type;
  filter.frequency.setValueAtTime(filterSettings.frequency, startTime);
  filter.Q.setValueAtTime(filterSettings.q, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(targetVolume, startTime + attack);
  gain.gain.setTargetAtTime(0.0001, Math.max(startTime + attack, endTime - release), release / 3);

  chorus.layers.forEach((layer) => {
    const oscillator = context.createOscillator();
    oscillator.type = layer.type ?? type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.detune.setValueAtTime(detune + layer.detune, startTime);
    oscillator.connect(filter);
    oscillator.onended = () => {
      bgmOscillators = bgmOscillators.filter((item) => item !== oscillator);
    };
    bgmOscillators.push(oscillator);
    oscillators.push(oscillator);
  });

  filter.connect(gain);
  gain.connect(bgmGain as GainNode);
  oscillators.forEach((oscillator) => {
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.08);
  });
}

function scheduleDirectTone({
  context,
  note,
  startTime,
  duration,
  volume,
  type,
  role
}: {
  context: AudioContext;
  note: number;
  startTime: number;
  duration: number;
  volume: number;
  type: OscillatorType;
  role: BackgroundRole;
}) {
  const output = context.createGain();
  output.gain.value = 0.8;
  output.connect(context.destination);
  const previousGain = bgmGain;
  bgmGain = output;
  scheduleBackgroundTone({ context, note, startTime, duration, volume, type, role });
  bgmGain = previousGain;
  window.setTimeout(() => {
    try {
      output.disconnect();
    } catch {
      // Output may already be cleaned up by the browser.
    }
  }, Math.ceil((startTime - context.currentTime + duration + 0.4) * 1000));
}

function getBackgroundFilterSettings(role: BackgroundRole, frequency: number) {
  if (role === 'bass') {
    return { type: 'lowpass' as BiquadFilterType, frequency: Math.min(760, Math.max(260, frequency * 3.2)), q: 0.45 };
  }
  if (role === 'drone') {
    return { type: 'lowpass' as BiquadFilterType, frequency: Math.min(520, Math.max(180, frequency * 3.1)), q: 0.38 };
  }
  if (role === 'pad') {
    return { type: 'lowpass' as BiquadFilterType, frequency: Math.min(2100, Math.max(950, frequency * 4.4)), q: 0.55 };
  }
  if (role === 'musicbox') {
    return { type: 'bandpass' as BiquadFilterType, frequency: Math.min(4200, Math.max(1500, frequency * 2.2)), q: 1.25 };
  }
  if (role === 'windbell') {
    return { type: 'bandpass' as BiquadFilterType, frequency: Math.min(8200, Math.max(2400, frequency * 1.35)), q: 2.45 };
  }
  if (role === 'shimmer') {
    return { type: 'bandpass' as BiquadFilterType, frequency: Math.min(7800, Math.max(2600, frequency)), q: 1.6 };
  }
  if (role === 'beacon') {
    return { type: 'lowpass' as BiquadFilterType, frequency: Math.min(2400, Math.max(900, frequency * 3.6)), q: 0.5 };
  }
  return { type: 'lowpass' as BiquadFilterType, frequency: Math.min(3600, Math.max(1400, frequency * 4.8)), q: 0.72 };
}

function getBackgroundChorus(role: BackgroundRole) {
  if (role === 'pad') {
    return {
      gainScale: 0.58,
      layers: [
        { detune: -7, type: 'sine' as OscillatorType },
        { detune: 6, type: 'triangle' as OscillatorType }
      ]
    };
  }
  if (role === 'drone') {
    return {
      gainScale: 0.72,
      layers: [
        { detune: -9, type: 'sine' as OscillatorType },
        { detune: 8, type: 'sine' as OscillatorType },
        { detune: 1, type: 'triangle' as OscillatorType }
      ]
    };
  }
  if (role === 'melody') {
    return {
      gainScale: 0.74,
      layers: [
        { detune: -3 },
        { detune: 4, type: 'triangle' as OscillatorType }
      ]
    };
  }
  if (role === 'beacon') {
    return {
      gainScale: 0.64,
      layers: [
        { detune: -5, type: 'sine' as OscillatorType },
        { detune: 6, type: 'triangle' as OscillatorType }
      ]
    };
  }
  if (role === 'musicbox') {
    return {
      gainScale: 0.52,
      layers: [
        { detune: -4, type: 'triangle' as OscillatorType },
        { detune: 5, type: 'sine' as OscillatorType }
      ]
    };
  }
  if (role === 'windbell') {
    return {
      gainScale: 0.46,
      layers: [
        { detune: -16, type: 'sine' as OscillatorType },
        { detune: 14, type: 'sine' as OscillatorType },
        { detune: 3, type: 'triangle' as OscillatorType }
      ]
    };
  }
  if (role === 'shimmer') {
    return {
      gainScale: 0.66,
      layers: [
        { detune: -10 },
        { detune: 12 }
      ]
    };
  }
  return {
    gainScale: 0.88,
    layers: [{ detune: 0 }]
  };
}

function getBackgroundEnvelope(role: BackgroundRole, duration: number) {
  if (role === 'pad') {
    return {
      attack: Math.min(1.4, duration * 0.38),
      release: Math.min(2.1, duration * 0.55)
    };
  }
  if (role === 'drone') {
    return {
      attack: Math.min(3.8, duration * 0.42),
      release: Math.min(4.6, duration * 0.62)
    };
  }
  if (role === 'bass') {
    return {
      attack: Math.min(0.42, duration * 0.24),
      release: Math.min(1.0, duration * 0.42)
    };
  }
  if (role === 'musicbox') {
    return {
      attack: Math.min(0.035, duration * 0.12),
      release: Math.min(1.25, duration * 0.88)
    };
  }
  if (role === 'windbell') {
    return {
      attack: Math.min(0.025, duration * 0.12),
      release: Math.min(2.2, duration * 0.92)
    };
  }
  if (role === 'beacon') {
    return {
      attack: Math.min(1.1, duration * 0.34),
      release: Math.min(2.8, duration * 0.64)
    };
  }
  if (role === 'shimmer') {
    return {
      attack: Math.min(0.7, duration * 0.36),
      release: Math.min(1.5, duration * 0.62)
    };
  }
  return {
    attack: Math.min(0.34, duration * 0.28),
    release: Math.min(1.15, duration * 0.58)
  };
}

function stopBackgroundMusic() {
  if (themeStingerAudio) {
    themeStingerAudio.pause();
    themeStingerAudio.currentTime = 0;
    themeStingerAudio.src = '';
    themeStingerAudio.load();
    themeStingerAudio = null;
  }

  if (bgmAudioFadeTimer) {
    window.clearInterval(bgmAudioFadeTimer);
    bgmAudioFadeTimer = undefined;
  }

  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    bgmAudio.src = '';
    bgmAudio.load();
    bgmAudio = null;
  }

  if (bgmTimer) {
    window.clearInterval(bgmTimer);
    bgmTimer = undefined;
  }

  const context = audioContext && audioContext.state !== 'closed' ? audioContext : null;
  if (bgmGain && context && context.state !== 'closed') {
    bgmGain.gain.cancelScheduledValues(context.currentTime);
    bgmGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.18);
  }

  bgmOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // Oscillators can already be stopped by a pending fade.
    }
  });
  bgmOscillators = [];
  [bgmFeedbackGain, bgmDelayGain, bgmDelay, bgmFilter, bgmGain].forEach((node) => {
    try {
      node?.disconnect();
    } catch {
      // Nodes may already be disconnected during a theme restart.
    }
  });
  bgmFeedbackGain = null;
  bgmDelayGain = null;
  bgmDelay = null;
  bgmFilter = null;
  bgmGain = null;
  bgmPlaying.value = false;
}

function closeAudioContext() {
  if (!audioContext || audioContext.state === 'closed') return;
  void audioContext.close();
  audioContext = null;
}

function getGeoFromScreenPoint(clientX: number, clientY: number) {
  const width = Math.max(viewportSize.value.width, 1);
  const height = Math.max(viewportSize.value.height, 1);
  const x = clamp(clientX, 0, width);
  const y = clamp(clientY, 0, height);
  const lon = mapBounds.minLon + (x / width) * (mapBounds.maxLon - mapBounds.minLon);
  const lat = mapBounds.maxLat - (y / height) * (mapBounds.maxLat - mapBounds.minLat);
  return {
    lat: Math.round(lat * 10_000) / 10_000,
    lon: Math.round(lon * 10_000) / 10_000
  };
}

function getGeoDistanceKm(left: { lat: number; lon: number }, right: { lat: number; lon: number }) {
  const latDistance = (right.lat - left.lat) * 111;
  const lonDistance = (right.lon - left.lon) * 111 * Math.cos(((left.lat + right.lat) / 2 / 180) * Math.PI);
  return Math.hypot(latDistance, lonDistance);
}

function isGeoPointInPolygon(point: { lat: number; lon: number }, polygon: readonly GeoPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [currentLon, currentLat] = polygon[index];
    const [previousLon, previousLat] = polygon[previous];
    const crosses =
      currentLat > point.lat !== previousLat > point.lat &&
      point.lon < ((previousLon - currentLon) * (point.lat - currentLat)) / (previousLat - currentLat) + currentLon;
    if (crosses) inside = !inside;
  }
  return inside;
}

function getGeoFlightZone(geo: { lat: number; lon: number }): FlightZoneId {
  if (getGeoDistanceKm(geo, mapCityPins[0]) < 46) return 'tainan';
  if (getGeoDistanceKm(geo, mapCityPins[2]) < 58) return 'wuxi';
  if (getGeoDistanceKm(geo, mapCityPins[1]) < 72) return 'shanghai';
  if (isGeoPointInPolygon(geo, taiwanOutlinePoints)) return 'taiwan';
  if (geo.lon <= 119.15 && geo.lat >= 22.6 && geo.lat <= 31.4) return 'coast';
  if (geo.lon >= 118.6 && geo.lon <= 121.15 && geo.lat >= 22.1 && geo.lat <= 26.4) return 'strait';
  if (geo.lon >= 120.6 && geo.lat >= 26.3) return 'east-sea';
  return 'sea';
}

function isPointInElementRect(selector: string, clientX: number, clientY: number) {
  const element = document.querySelector(selector);
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getFlightContentZone(clientX: number, clientY: number): FlightContentZone {
  if (isPointInElementRect('.bottom-nav', clientX, clientY)) return 'navigation';
  if (isPointInElementRect('.flight-map-stage', clientX, clientY)) return 'map';
  const elements = document.elementsFromPoint(clientX, clientY).filter((element) => {
    if (!(element instanceof Element)) return false;
    return !element.closest('.viewport-plane, .flight-zone-hint, .flight-landing-effect, .flight-geo-overlay');
  });
  const element = elements.find((item) => item instanceof Element) as Element | undefined;
  if (!element) return 'surface';
  if (element.closest('.bottom-nav')) return 'navigation';
  if (element.closest('.flight-map, .flight-map-stage')) return 'map';
  if (element.closest('.today-mode-section, .message-section, .question-section, .ritual-section')) return 'today';
  if (element.closest('.journey-summary-section, .meeting-plan-section, .meeting-checklist-section')) return 'journey';
  if (element.closest('.period-section, .period-calendar-section, .period-history-section')) return 'period';
  if (element.closest('.photo-wall-section, .secret-section, .timeline-section')) return 'memories';
  if (element.closest('.settings-section, .suitcase-section, .prep-section')) return 'prepare';
  if (element.closest('.hero-section, .flight-section, .countdown-grid, .closeness-panel')) return 'countdown';
  return 'surface';
}

function getFlightPointState(clientX: number, clientY: number) {
  const geo = getGeoFromScreenPoint(clientX, clientY);
  const contentZone = getFlightContentZone(clientX, clientY);
  const geoZone = getGeoFlightZone(geo);
  let zone = geoZone;
  if (contentZone === 'navigation') zone = 'navigation';
  else if (contentZone === 'memories') zone = 'memory';
  else if (contentZone === 'countdown' && geoZone === 'sea') zone = 'countdown';
  else if (contentZone === 'map' && geoZone === 'sea') zone = 'route';
  return {
    zone,
    contentZone,
    lat: geo.lat,
    lon: geo.lon
  };
}

function launchLandingEffect(zone: FlightZoneId, x: number, y: number, contentZone: FlightContentZone, lat: number, lon: number) {
  if (flightLandingTimer) window.clearTimeout(flightLandingTimer);
  flightLandingEffect.value = {
    id: flightLandingId++,
    zone,
    contentZone,
    x,
    y,
    label: flightZoneLabels[zone],
    detail: `${flightContentLabels[contentZone]} / ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
    lat,
    lon
  };
  gentleVibrate(zone === 'harbor' || zone === 'shanghai' ? 18 : 10);
  flightLandingTimer = window.setTimeout(() => {
    flightLandingEffect.value = null;
    flightLandingTimer = undefined;
  }, 1500);
}

function clearPlaneReturnTimers() {
  if (planeResetTimer) {
    window.clearTimeout(planeResetTimer);
    planeResetTimer = undefined;
  }
  if (planeReturnTimer) {
    window.clearTimeout(planeReturnTimer);
    planeReturnTimer = undefined;
  }
  if (planeHomeReturnTimer) {
    window.clearTimeout(planeHomeReturnTimer);
    planeHomeReturnTimer = undefined;
  }
}

function getFullscreenRouteDestinationState() {
  const destination = mapCityPins[1];
  const width = Math.max(viewportSize.value.width, 1);
  const height = Math.max(viewportSize.value.height, 1);
  const margin = 34;
  const point = projectGeoPoint(destination.lat, destination.lon, width, height);
  const zone: FlightZoneId = 'shanghai';
  const contentZone: FlightContentZone = 'map';
  return {
    screenX: clamp(point.x, margin, Math.max(margin, width - margin)),
    screenY: clamp(point.y, margin, Math.max(margin, height - margin)),
    zone,
    contentZone,
    lat: destination.lat,
    lon: destination.lon
  };
}

function beginPlaneDrag(clientX: number, clientY: number, target: HTMLElement | null) {
  const rect = target?.getBoundingClientRect();
  if (!rect) return;
  clearPlaneReturnTimers();
  const homeX = rect.left + rect.width / 2;
  const homeY = rect.top + rect.height / 2;
  const pointState = getFlightPointState(homeX, homeY);
  planeDrag.value = {
    dragging: true,
    returning: false,
    returnPhase: 'idle',
    startX: clientX - homeX,
    startY: clientY - homeY,
    offsetX: 0,
    offsetY: 0,
    screenX: homeX,
    screenY: homeY,
    homeX,
    homeY,
    ...pointState
  };
}

function movePlaneTo(clientX: number, clientY: number) {
  const margin = 28;
  const screenX = clamp(clientX - planeDrag.value.startX, margin, Math.max(margin, window.innerWidth - margin));
  const screenY = clamp(clientY - planeDrag.value.startY, margin, Math.max(margin, window.innerHeight - margin));
  const pointState = getFlightPointState(screenX, screenY);
  planeDrag.value = {
    ...planeDrag.value,
    screenX,
    screenY,
    ...pointState
  };
}

function startPlaneDrag(event: PointerEvent) {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  event.preventDefault();
  target?.setPointerCapture?.(event.pointerId);
  beginPlaneDrag(event.clientX, event.clientY, target);
}

function startPlaneMouseDrag(event: MouseEvent) {
  if (planeDrag.value.dragging || event.button !== 0) return;
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  event.preventDefault();
  beginPlaneDrag(event.clientX, event.clientY, target);
}

function movePlaneDrag(event: PointerEvent) {
  if (!planeDrag.value.dragging) return;
  event.preventDefault();
  movePlaneTo(event.clientX, event.clientY);
}

function movePlaneMouseDrag(event: MouseEvent) {
  if (!planeDrag.value.dragging) return;
  event.preventDefault();
  movePlaneTo(event.clientX, event.clientY);
}

function endPlaneDrag(event?: PointerEvent) {
  if (!planeDrag.value.dragging) return;
  const target = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (event && target?.hasPointerCapture?.(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  const landingX = planeDrag.value.screenX;
  const landingY = planeDrag.value.screenY;
  const landingZone = planeDrag.value.zone;
  const landingContentZone = planeDrag.value.contentZone;
  const landingLat = planeDrag.value.lat;
  const landingLon = planeDrag.value.lon;
  const destinationState = getFullscreenRouteDestinationState();
  launchLandingEffect(landingZone, landingX, landingY, landingContentZone, landingLat, landingLon);
  planeDrag.value = {
    ...planeDrag.value,
    dragging: false,
    returning: true,
    returnPhase: 'destination',
    screenX: landingX,
    screenY: landingY
  };
  gentleVibrate(6);
  clearPlaneReturnTimers();
  planeReturnTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      planeDrag.value = {
        ...planeDrag.value,
        ...destinationState,
        returnPhase: 'destination'
      };
    });
    planeReturnTimer = undefined;
  }, PLANE_RETURN_DESTINATION_DELAY_MS);
  planeHomeReturnTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      planeDrag.value = {
        ...planeDrag.value,
        returnPhase: 'home',
        zone: 'route',
        contentZone: 'map',
        screenX: planeDrag.value.homeX,
        screenY: planeDrag.value.homeY
      };
    });
    planeHomeReturnTimer = undefined;
  }, PLANE_RETURN_HOME_DELAY_MS);
  planeResetTimer = window.setTimeout(() => {
    planeDrag.value = createPlaneDragState();
    planeResetTimer = undefined;
  }, PLANE_RETURN_RESET_DELAY_MS);
}

function endPlaneMouseDrag() {
  endPlaneDrag();
}

function openThemeSettings() {
  activeTab.value = 'prepare';
  launchThemeBurst();
}

function gentleVibrate(duration: number) {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

function waitForPasswordSuccess() {
  if (passwordSuccessTimer) window.clearTimeout(passwordSuccessTimer);
  return new Promise<void>((resolve) => {
    passwordSuccessTimer = window.setTimeout(() => {
      passwordSuccessTimer = undefined;
      resolve();
    }, settings.value.reducedMotion ? 160 : 720);
  });
}

function finishOpening() {
  if (introTimer) {
    window.clearTimeout(introTimer);
    introTimer = undefined;
  }
  introClosing.value = false;
  introActive.value = false;
  if (localStorage.getItem(storageKey('onboarding-seen')) !== 'yes') {
    onboardingVisible.value = true;
  }
}

function startOpeningSequence() {
  if (introTimer) window.clearTimeout(introTimer);
  const seenOpening = localStorage.getItem(storageKey('intro-seen')) === 'yes';
  introMode.value = seenOpening ? 'returning' : 'first';
  localStorage.setItem(storageKey('intro-seen'), 'yes');
  introActive.value = true;
  introClosing.value = false;
  introTimer = window.setTimeout(
    finishOpening,
    settings.value.reducedMotion
      ? OPENING_REDUCED_DURATION_MS
      : introMode.value === 'returning'
        ? OPENING_RETURN_DURATION_MS
        : OPENING_DURATION_MS
  );
}

function requestFinishOpening() {
  if (!introActive.value) return;
  if (settings.value.reducedMotion) {
    finishOpening();
    return;
  }
  if (introTimer) window.clearTimeout(introTimer);
  introClosing.value = true;
  introTimer = window.setTimeout(finishOpening, OPENING_SKIP_DURATION_MS);
}

provide(appViewContextKey, {
  activeJourneyDateRange, activeJourneyDay, activeJourneyDayEntries, activeJourneyDayId,
  activeJourneyDayIndex, activeJourneyDayMeta, activeJourneyDays, activeJourneyMonthLabel,
  activeJourneyProgress, activeJourneyScheduleSections, activeJourneyTrip, activeJourneyTripId,
  activeTab, activeTabIndex, addCustomSecretCode, addDays,
  addJourneyDay,
  addJourneyEntry, addMemoryPhotos, addMoodHistory, addPeriodRecord, addWish,
  applyImportData, appUnlocked, arrivalReadyPercent, arrivalSteps,
  autoScheduleActiveJourney, backgroundBeams, backgroundMotes, BOY_NAME,
  burstParticles, cancelImportData, cancelSecretPress, capsuleEditText, capsuleShowAll,
  cancelEditCapsule, cancelEditPeriodRecord, cancelHiddenCardEdit,
  checkedInToday, checkForAppUpdate, checkins, checkinStreak,
  checkInToday, chooseRadar, clearDailyAnswer, clearDailyMessage,
  closenessLabel, cloudLoadingActive, cloudLoadingSteps, cloudStatus,
  cloudSyncBusy, cloudSyncConfigured, cloudToken, completedWishCount,
  completeTodayRitual, configuredStartDate, configuredStartDay, copyDailyReceipt,
  countdown, createBlankJourneyTrip, currentDayIndex, customSecretCodes,
  dailyAnswer, dailyMessage, dailyQuestions, dailyReceipt,
  dateKey, daysUntilMeeting, dismissOnboarding, dismissUpdateToast,
  displayBoyName, displayGirlName, draftStartDate, draftTargetDate,
  editingPeriodRecordId,
  drawFortune, editHiddenCard, editingCapsuleIndex, editingHiddenCardId, endPlaneDrag, enterUnlockedApp, exportActiveJourneyCalendar,
  exportData, exportMeetingCalendar, finishOpening, flippedCapsules,
  flipUnits, formatDateKey, formatJourneyDateLabel, fortuneDeck, fortuneLine, fortuneReady,
  fortuneTitle, gentleVibrate, getCloudSettingsUpdatedAt, getComparableCloudSnapshot,
  getInputValue, getLocalSettingsUpdatedAt, getStorageTimestamp, getTextareaValue,
  GIRL_NAME, handleAppInstalled, handleBeforeInstallPrompt, handleControllerChange,
  hiddenCardLine, hiddenCards, hiddenCardTextDraft, hiddenCardTitleDraft, importData, importJourneyFile, importJourneyRows,
  importJourneyText, importMessage, importMode, installApp,
  installedDisplayMode, installReady, introActive, introClosing,
  introMode, isArrivalMode, isIosDevice, isMeetingDay,
  isOnline, isScamRadarDay, JOURNEY_AUTO_TIME_SLOTS, journeyCalendarCells,
  journeyDayRailItems,
  journeyDays, journeyImportBusy, journeyImportHelp, journeyImportMessage,
  journeyImportText, journeyNewDayDate, journeyNewTripTitle, journeyOcrProgress,
  journeyPanelMode, journeySummaryStats, journeyTripCountdownLabel, journeyTripOptions,
  activeJourneyRouteLabel, activeJourneyNextEntry,
  journeyTrips, launchSparkles, launchThemeBurst, loadCheckins,
  loadCloudData, loadCustomSecretCodes, loadDailyState, loadJourneyTrips,
  loadMeetingChecklist, loadMeetingMoments, loadMemoryPhotos, loadMoodHistory,
  loadSecretCode, loadSettings, loadSuitcase, loadWishes,
  localDataMode, localPreviewMode, lockApp, lockSecretCode, mailSecret,
  meetingChecklist, meetingChecklistItems, meetingChecklistProgress, meetingMomentItems,
  meetingMoments, meetingSummary, meetingSummaryLine, memoryCapsuleNotes, memoryPhotos,
  milestoneFlash, moodBottleDots, moodHistory, moodOptions,
  movePlaneDrag, navIndicatorStyle, newPeriodCare, newPeriodEndDate,
  newPeriodFlow, newPeriodMoods, newPeriodNote, newPeriodPainLevel,
  newPeriodStartDate, newPeriodSymptoms, newSecretCode, newWish,
  now, onboardingSteps, onboardingVisible, openingChapters,
  openingStars, openingThemeLabel, openThemeSettings, openTodayRitual,
  packingItems, parseJourneyRowsFromImage, parseJourneyRowsFromSpreadsheetFile, passwordBusy,
  passwordInput, passwordStatus, passwordSuccess, pendingImport,
  pendingImportSummary, photoFilmstrip, planeDrag, planeStyle,
  activeRoutePercent, flightLandingEffect, flightMapClass, flightOverlayCityMarkers,
  flightOverlayClass, flightOverlayGridLines, flightOverlayIslandMarkers, flightOverlayLandMasses,
  flightOverlayRoutePath, flightOverlayViewBox, flightOverlayWaterWaveLines, flightOverlayWeatherMarkers, flightOverlayWeatherRegions, flightRoutePath,
  mapCityMarkers, mapGridLines, mapIslandMarkers, mapLandMasses,
  mapRouteStopMarkers, mapWaterWaveLines, mapWeather, mapWeatherMarkers, mapWeatherRegionMarkers, planeFlightClass, planeGeoReadout, planeHomeStyle, planeInGlobalFlight, planeZoneHintStyle, planeZoneLabel,
  showFlightGeoOverlay,
  periodAnomalyAlerts, periodCalendarOffset, periodCalendarRangeLabel,
  periodCareOptions, periodCareSuggestionCards, periodConfidenceLabel, periodCycleStats, periodDisplayName,
  periodPrivacyMode, periodRecordFormTitle, periodRecordSubmitLabel, periodReminderCards,
  periodFlowOptions, periodMessage, periodMoodOptions, periodName, periodPredictions,
  periodRecords, periodStatusLabel, periodSummaryCards, periodSymptomOptions,
  periodTimelineRecords, professionalNextPeriodPrediction, professionalPeriodCalendarDays,
  professionalPeriodInsightCards, professionalPeriodPhase, professionalPeriodPredictions,
  professionalPeriodSummaryCards, professionalPeriodTimelineRecords, periodTrendRows,
  planeTrailStyle, playSoftSound, preparationStats, previewTheme,
  previewThemeSelection, progress, progressPercent, pwaInstallGuide,
  radarChoiceId, radarChoiceResult, radarChoices, radarResult,
  radarScanned, rawDayIndex, refreshForUpdate, reloadPersistentState,
  removeCustomSecretCode, removeJourneyDay, removeJourneyEntry, removeJourneyTrip,
  removeHiddenCard, removeMemoryPhoto, removePeriodRecord, removeWish, requestCloudSync, requestFinishOpening,
  resetPeriodCalendar,
  resetSettings, resetToday, restoreSavedCloudSession, revealSecret,
  ritualComplete, ritualOpened, ritualProgress, ritualSteps,
  routeFillStyle, saveCapsuleNote, saveDailyAnswer, saveDailyMessage, saveHiddenCard, savedMessageLine,
  saveJourneyTrips, saveMemoryPhotos, saveSettings, saveWishes,
  scanRadar, sceneStyle, sceneTilt, secretCodeInput, secretCodeMessage,
  secretCodeList, secretCodeUnlocked, secretMailed, secretPressing,
  secretRevealed, secretWhisper, selectedMood, selectedMoodId,
  selectedMoodLine, selectJourneyDay, selectJourneyTrip, selectJourneyTripFromEvent,
  selectMood, setSettingsUpdatedAt, settings, settingsDraft,
  shareCopied, showPasswordInstallHint, sparkles, startCloudSyncLoop,
  shiftPeriodCalendar, startDateLabel, startEditPeriodRecord, startOpeningSequence, startPlaneDrag, startPlaneMouseDrag, startSecretPress,
  startEditCapsule,
  suitcaseChecked, suitcaseItems, suitcaseProgress, syncCloudNow,
  targetDate, targetDateLabel, targetDateShortLabel, targetDayStart,
  targetOffsetDays, targetOffsetMax, targetTimelineStyle, taskCompleted,
  theaterLights, themeClass, themeOptions, themePreviewing,
  themeTransition, timelineEvents, timelineProgressStyle, todayJourney,
  todayNote, todayQuestion, todayStart, todayTask,
  toggleCapsule, toggleJourneyEntryDone, toggleMeetingChecklist, toggleMeetingMoment, togglePeriodPrivacyMode, togglePeriodSelection,
  toggleSuitcaseItem, toggleTask, toggleWish, triggerMilestoneWave,
  unlockApp, unlockedCount, unlockSecretCode, updateActiveJourneyTitle,
  updateAppThemeChrome, updateInstalledDisplayMode, updateJourneyDayField, updateJourneyEntryField,
  updateJourneyTrip, updateOnlineState, updateReady, updateSceneTilt,
  useLocalDataForThisSession, visibleCapsules, visibleCapsulesDisplay, waitForPasswordSuccess,
  wishes
});

</script>

<template>
  <main
    class="app-shell"
    :class="[selectedMoodId ? `mood-${selectedMoodId}` : '', themeClass, { 'reduce-motion': settings.reducedMotion }]"
    :style="sceneStyle"
    @pointerdown.capture="handleAppPointerDown"
    @keydown.capture="handleAppKeyDown"
  >

    <AppShellEffects />
    <PasswordGate v-if="!appUnlocked" />

    <div v-if="appUnlocked" class="app-content">
      <CountdownView v-if="activeTab === 'countdown'" />
      <TodayView v-else-if="activeTab === 'today'" />
      <JourneyView v-else-if="activeTab === 'journey'" />
      <PeriodView v-else-if="activeTab === 'period'" />
      <MemoriesView v-else-if="activeTab === 'memories'" />
      <PrepareView v-else-if="activeTab === 'prepare'" />
      <BottomNav />
    </div>
  </main>
</template>
