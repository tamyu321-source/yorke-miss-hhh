<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
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
  saveCloudState
} from './cloudSync';
import { loadStoredPhotos, mergePhotos, savePhotos } from './photoDb';
import { checkForAppUpdate as checkServiceWorkerUpdate, refreshForWaitingServiceWorker } from './pwa';
import { restoreAppLocalStorage, storageKey } from './storage';
import CountdownView from './views/CountdownView.vue';
import JourneyView from './views/JourneyView.vue';
import MemoriesView from './views/MemoriesView.vue';
import PrepareView from './views/PrepareView.vue';
import TodayView from './views/TodayView.vue';
import type {
  ActiveTab,
  AppSettings,
  BurstParticle,
  CountdownUnit,
  Countdown,
  JourneyEditableEntryField,
  JourneyImportRow,
  JourneyPanelMode,
  JourneyScheduleSection,
  JourneyTrip,
  MemoryPhoto,
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
const planeDrag = ref<PlaneDragState>({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
const secretCodeInput = ref('');
const secretCodeUnlocked = ref(false);
const memoryPhotos = ref<MemoryPhoto[]>([]);
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
let introTimer: number | undefined;
let passwordSuccessTimer: number | undefined;
let themeTransitionTimer: number | undefined;
let themePreviewTimer: number | undefined;
let milestoneTimer: number | undefined;
let cloudSyncTimer: number | undefined;
let pendingCloudSync = false;
let deferredInstallPrompt: Event | null = null;
let refreshingForUpdate = false;
let sparkleId = 0;
let burstId = 0;
let previousProgressMilestone = 0;
let lastCloudSnapshot = '';
let loadingCloudSnapshot = false;
let cloudLoadRequestId = 0;
let localCloudFallbackRequested = false;
let audioContext: AudioContext | null = null;
let bgmGain: GainNode | null = null;
let bgmTimer: number | undefined;
let bgmOscillators: OscillatorNode[] = [];

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
const planeStyle = computed(() => {
  const x = 11 + progress.value * 75;
  const y = 72 - progress.value * 47;
  return {
    left: `calc(${x}% + ${planeDrag.value.offsetX}px)`,
    top: `calc(${y}% + ${planeDrag.value.offsetY}px)`
  };
});
const planeTrailStyle = computed(() => {
  const x = 11 + progress.value * 75;
  const y = 72 - progress.value * 47;
  return {
    left: `${x}%`,
    top: `${y}%`,
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
const pendingImportSummary = computed(() => {
  if (!pendingImport.value) return '';
  return `準備${importMode.value === 'replace' ? '覆蓋' : '合併'}：${Object.keys(pendingImport.value.localStorage).length} 筆紀錄、${pendingImport.value.photos.length} 張照片。`;
});
const sceneStyle = computed(() => ({
  '--scene-tilt-x': `${sceneTilt.value.x}deg`,
  '--scene-tilt-y': `${sceneTilt.value.y}deg`
}));
const activeTabIndex = computed(() => {
  const tabs: ActiveTab[] = ['countdown', 'today', 'journey', 'memories', 'prepare'];
  return Math.max(tabs.indexOf(activeTab.value), 0);
});
const navIndicatorStyle = computed(() => ({
  transform: `translateX(calc(${activeTabIndex.value * 100}% + ${activeTabIndex.value * 6}px))`
}));

const visibleCapsules = computed(() =>
  journeyDays.value.map((day, index) => {
    const unlockDate = addDays(configuredStartDay.value, index);
    const daysToUnlock = Math.max(Math.ceil((unlockDate.getTime() - todayStart.value.getTime()) / DAY_MS), 1);
    return {
      text: day.capsule,
      lockedText: `${day.dateLabel} 的膠囊還沒到時間，還有 ${daysToUnlock} 天會自己打開。`,
      dateLabel: day.dateLabel,
      index,
      unlocked: index < unlockedCount.value,
      flipped: flippedCapsules.value.includes(index)
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
  loadMeetingChecklist();
  loadWishes();
  loadMeetingMoments();
  checkForAppUpdate();
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('pointermove', updateSceneTilt);
  navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
  updateInstalledDisplayMode();
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
  if (planeResetTimer) window.clearTimeout(planeResetTimer);
  if (introTimer) window.clearTimeout(introTimer);
  if (passwordSuccessTimer) window.clearTimeout(passwordSuccessTimer);
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  if (themePreviewTimer) window.clearTimeout(themePreviewTimer);
  if (milestoneTimer) window.clearTimeout(milestoneTimer);
  if (cloudSyncTimer) window.clearInterval(cloudSyncTimer);
  stopBackgroundMusic();
  closeAudioContext();
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
  window.removeEventListener('pointermove', updateSceneTilt);
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
        restoreAppLocalStorage(cloudData.localStorage, 'replace');
        if (localSettings && localSettingsUpdatedAt > cloudSettingsUpdatedAt) {
          localStorage.setItem(storageKey('settings'), localSettings);
          setSettingsUpdatedAt(localSettingsUpdatedAt);
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

async function syncCloudNow(force = false) {
  if (!cloudToken.value || loadingCloudSnapshot) return;
  if (cloudSyncBusy.value) {
    pendingCloudSync = pendingCloudSync || force;
    return;
  }

  const snapshot = getComparableCloudSnapshot();
  if (!force && snapshot === lastCloudSnapshot) return;

  cloudSyncBusy.value = true;
  cloudStatus.value = '正在同步雲端...';

  try {
    await saveCloudState(cloudToken.value, createExportData(memoryPhotos.value));
    localDataMode.value = false;
    lastCloudSnapshot = snapshot;
    cloudStatus.value = `已同步 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    cloudStatus.value = '同步失敗，稍後會再試一次';
  } finally {
    cloudSyncBusy.value = false;
    if (pendingCloudSync) {
      pendingCloudSync = false;
      window.setTimeout(() => {
        void syncCloudNow(true);
      }, 0);
    }
  }
}

function requestCloudSync() {
  if (localDataMode.value) return;
  void syncCloudNow(true);
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

function getLocalSettingsUpdatedAt() {
  return getStorageTimestamp(localStorage.getItem(storageKey(SETTINGS_UPDATED_KIND)));
}

function getCloudSettingsUpdatedAt(data: AppExportData) {
  return getStorageTimestamp(data.localStorage[storageKey(SETTINGS_UPDATED_KIND)]);
}

function getStorageTimestamp(value: string | null | undefined) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
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
    requestCloudSync();
    launchThemeBurst();
    playSoftSound('success');
    gentleVibrate(12);
    return;
  }

  localStorage.removeItem(key);
  requestCloudSync();
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
    requestCloudSync();
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
  requestCloudSync();
}

function clearDailyMessage() {
  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
  requestCloudSync();
}

function selectMood(moodId: string) {
  selectedMoodId.value = moodId;
  localStorage.setItem(storageKey('mood', dateKey.value), moodId);
  addMoodHistory(moodId);
  requestCloudSync();
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
  requestCloudSync();
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
  requestCloudSync();
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
  requestCloudSync();
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
  requestCloudSync();
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
  requestCloudSync();
  cancelSecretPress();
  launchThemeBurst();
  playSoftSound('secret');
  gentleVibrate(16);
}

function mailSecret() {
  if (!secretRevealed.value || secretMailed.value) return;
  secretMailed.value = true;
  localStorage.setItem(storageKey('secret-mailed', dateKey.value), 'yes');
  requestCloudSync();
  playSoftSound('paper');
  gentleVibrate(12);
}

function unlockSecretCode() {
  const normalized = secretCodeInput.value.trim();
  if (!secretCodeList.value.includes(normalized)) return;
  secretCodeUnlocked.value = true;
  localStorage.setItem(storageKey('secret-code'), 'open');
  requestCloudSync();
  playSoftSound('secret');
  gentleVibrate(18);
}

function loadSecretCode() {
  secretCodeUnlocked.value = localStorage.getItem(storageKey('secret-code')) === 'open';
}

function addCustomSecretCode() {
  const code = newSecretCode.value.trim();
  if (!code || secretCodeList.value.includes(code)) return;
  customSecretCodes.value = [...customSecretCodes.value, code];
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
  newSecretCode.value = '';
  requestCloudSync();
}

function removeCustomSecretCode(code: string) {
  customSecretCodes.value = customSecretCodes.value.filter((item) => item !== code);
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
  requestCloudSync();
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

function saveDailyAnswer() {
  const answer = dailyAnswer.value.trim();
  if (answer) {
    dailyAnswer.value = answer;
    localStorage.setItem(storageKey('question-answer', dateKey.value), answer);
    requestCloudSync();
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('question-answer', dateKey.value));
  requestCloudSync();
}

function clearDailyAnswer() {
  dailyAnswer.value = '';
  localStorage.removeItem(storageKey('question-answer', dateKey.value));
  requestCloudSync();
}

function addMemoryPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, 4);
  if (!files.length) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl.startsWith('data:image/')) return;
      memoryPhotos.value = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          dataUrl
        },
        ...memoryPhotos.value
      ].slice(0, 8);
      saveMemoryPhotos();
      launchThemeBurst();
    };
    reader.readAsDataURL(file);
  });

  input.value = '';
  gentleVibrate(10);
}

function removeMemoryPhoto(id: string) {
  memoryPhotos.value = memoryPhotos.value.filter((photo) => photo.id !== id);
  saveMemoryPhotos();
}

async function saveMemoryPhotos() {
  await savePhotos(memoryPhotos.value);
  requestCloudSync();
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
  requestCloudSync();
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
  loadMeetingChecklist();
  loadSettings();
  loadWishes();
  loadMeetingMoments();
  loadJourneyTrips();
}

function resetToday() {
  [
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
  ].forEach((kind) => localStorage.removeItem(storageKey(kind, dateKey.value)));
  checkins.value = checkins.value.filter((day) => day !== dateKey.value);
  moodHistory.value = moodHistory.value.filter((entry) => !entry.startsWith(`${dateKey.value}:`));
  localStorage.setItem(storageKey('checkins'), JSON.stringify(checkins.value));
  localStorage.setItem(storageKey('mood-history'), JSON.stringify(moodHistory.value));
  if (isMeetingDay.value) {
    meetingChecklist.value = [];
    localStorage.removeItem(storageKey('meeting-checklist'));
  }
  loadDailyState(dateKey.value);
  requestCloudSync();
}

function openTodayRitual() {
  ritualOpened.value = true;
  localStorage.setItem(storageKey('ritual-opened', dateKey.value), 'yes');
  requestCloudSync();
  gentleVibrate(10);
}

function completeTodayRitual() {
  if (ritualProgress.value < 100) return;
  ritualComplete.value = true;
  localStorage.setItem(storageKey('ritual-complete', dateKey.value), 'yes');
  requestCloudSync();
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
  requestCloudSync();
  gentleVibrate(10);
}

function resetSettings() {
  settings.value = { ...defaultSettings };
  settingsDraft.value = { ...defaultSettings };
  previewTheme.value = '';
  localStorage.removeItem(storageKey('settings'));
  setSettingsUpdatedAt();
  requestCloudSync();
}

function previewThemeSelection(theme: ThemeId) {
  settingsDraft.value.theme = theme;
  previewTheme.value = theme;
  themeTransition.value = true;
  if (themePreviewTimer) window.clearTimeout(themePreviewTimer);
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  themeTransitionTimer = window.setTimeout(() => {
    themeTransition.value = false;
  }, 900);
  themePreviewTimer = window.setTimeout(() => {
    previewTheme.value = '';
  }, 2000);
}

function dismissOnboarding() {
  onboardingVisible.value = false;
  localStorage.setItem(storageKey('onboarding-seen'), 'yes');
  requestCloudSync();
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
  requestCloudSync();
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
  requestCloudSync();
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

function updateOnlineState() {
  isOnline.value = navigator.onLine;
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
  if (sync) requestCloudSync();
}

function selectJourneyTrip(tripId: string) {
  activeJourneyTripId.value = tripId;
  activeJourneyDayId.value = '';
  localStorage.setItem(storageKey('active-journey-trip'), tripId);
  requestCloudSync();
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
type BackgroundNote = { note: number; beat: number; duration: number; volume: number };
type BackgroundChord = { notes: number[]; beat: number; duration: number; volume: number };
type BackgroundMusicTheme = {
  bpm: number;
  loopBeats: number;
  masterVolume: number;
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
    bpm: 72,
    loopBeats: 64,
    masterVolume: 0.72,
    padWave: 'sine',
    melodyWave: 'triangle',
    bassWave: 'sine',
    chordBeats: 4,
    chordVolume: 0.015,
    bassVolume: 0.018,
    melodyVolume: 0.032,
    shimmerVolume: 0.011,
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
    bpm: 84,
    loopBeats: 64,
    masterVolume: 0.62,
    padWave: 'triangle',
    melodyWave: 'sine',
    bassWave: 'triangle',
    chordBeats: 4,
    chordVolume: 0.012,
    bassVolume: 0.014,
    melodyVolume: 0.029,
    shimmerVolume: 0.014,
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
    bpm: 64,
    loopBeats: 64,
    masterVolume: 0.8,
    padWave: 'sine',
    melodyWave: 'sine',
    bassWave: 'sine',
    chordBeats: 4,
    chordVolume: 0.018,
    bassVolume: 0.02,
    melodyVolume: 0.028,
    shimmerVolume: 0.009,
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

function createBackgroundMusicTheme(config: {
  bpm: number;
  loopBeats: number;
  masterVolume: number;
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
    bpm: config.bpm,
    loopBeats: config.loopBeats,
    masterVolume: config.masterVolume,
    padWave: config.padWave,
    melodyWave: config.melodyWave,
    bassWave: config.bassWave,
    chords: config.chords.map((notes, index) => ({
      notes,
      beat: index * config.chordBeats,
      duration: config.chordBeats + 0.65,
      volume: config.chordVolume
    })),
    bass: makeBackgroundLine(config.bassNotes, [2, 2], 0, 1.85, config.bassVolume),
    melody: makeBackgroundLine(config.melodyNotes, [0.75, 0.5, 0.75, 1, 1, 0.5, 0.75, 0.75], 0, 0.86, config.melodyVolume),
    shimmer: makeBackgroundLine(config.shimmerNotes, [2, 2, 1, 1, 2, 2], 0.35, 0.76, config.shimmerVolume)
  };
}

function makeBackgroundLine(notes: number[], rhythm: number[], startBeat: number, sustainRatio: number, volume: number) {
  let beat = startBeat;
  const line: BackgroundNote[] = [];

  notes.forEach((note, index) => {
    const step = rhythm[index % rhythm.length];
    if (note >= 0) {
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

  const theme = backgroundMusicThemes[previewTheme.value || settings.value.theme];
  bgmGain = context.createGain();
  bgmGain.gain.setValueAtTime(0.0001, context.currentTime);
  bgmGain.gain.exponentialRampToValueAtTime(theme.masterVolume, context.currentTime + 1.4);
  bgmGain.connect(context.destination);

  bgmPlaying.value = true;
  scheduleBackgroundPhrase();
  bgmTimer = window.setInterval(scheduleBackgroundPhrase, Math.round((theme.loopBeats * 60 * 1000) / theme.bpm));
}

function scheduleBackgroundPhrase() {
  const context = audioContext && audioContext.state !== 'closed' ? audioContext : null;
  if (!context || !bgmGain || !settings.value.soundFeedback) return;

  const theme = backgroundMusicThemes[previewTheme.value || settings.value.theme];
  const beatSeconds = 60 / theme.bpm;
  const startTime = context.currentTime + 0.12;

  theme.chords.forEach((chord) => {
    chord.notes.forEach((note, index) => {
      scheduleBackgroundTone({
        context,
        note,
        startTime: startTime + chord.beat * beatSeconds,
        duration: chord.duration * beatSeconds,
        volume: chord.volume * (index === 0 ? 0.9 : 1),
        type: theme.padWave,
        detune: index % 2 === 0 ? -2 : 2
      });
    });
  });

  theme.bass.forEach((note) => {
    scheduleBackgroundTone({
      context,
      note: note.note,
      startTime: startTime + note.beat * beatSeconds,
      duration: note.duration * beatSeconds,
      volume: note.volume,
      type: theme.bassWave,
      detune: -4
    });
  });

  theme.melody.forEach((note) => {
    scheduleBackgroundTone({
      context,
      note: note.note,
      startTime: startTime + note.beat * beatSeconds,
      duration: note.duration * beatSeconds,
      volume: note.volume,
      type: theme.melodyWave
    });
  });

  theme.shimmer.forEach((note) => {
    scheduleBackgroundTone({
      context,
      note: note.note,
      startTime: startTime + note.beat * beatSeconds,
      duration: note.duration * beatSeconds,
      volume: note.volume,
      type: 'sine',
      detune: 3
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
  detune = 0
}: {
  context: AudioContext;
  note: number;
  startTime: number;
  duration: number;
  volume: number;
  type: OscillatorType;
  detune?: number;
}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = Math.min(0.22, duration * 0.28);
  const release = Math.min(0.5, duration * 0.45);
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(midiToFrequency(note), startTime);
  oscillator.detune.setValueAtTime(detune, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + attack);
  gain.gain.setTargetAtTime(0.0001, Math.max(startTime + attack, endTime - release), release / 3);
  oscillator.connect(gain);
  gain.connect(bgmGain as GainNode);
  oscillator.onended = () => {
    bgmOscillators = bgmOscillators.filter((item) => item !== oscillator);
  };
  bgmOscillators.push(oscillator);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.08);
}

function stopBackgroundMusic() {
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
  bgmGain = null;
  bgmPlaying.value = false;
}

function closeAudioContext() {
  if (!audioContext || audioContext.state === 'closed') return;
  void audioContext.close();
  audioContext = null;
}

function startPlaneDrag(event: PointerEvent) {
  planeDrag.value = {
    dragging: true,
    startX: event.clientX - planeDrag.value.offsetX,
    startY: event.clientY - planeDrag.value.offsetY,
    offsetX: planeDrag.value.offsetX,
    offsetY: planeDrag.value.offsetY
  };
}

function movePlaneDrag(event: PointerEvent) {
  if (!planeDrag.value.dragging) return;
  planeDrag.value = {
    ...planeDrag.value,
    offsetX: clamp(event.clientX - planeDrag.value.startX, -46, 46),
    offsetY: clamp(event.clientY - planeDrag.value.startY, -36, 36)
  };
}

function endPlaneDrag() {
  if (!planeDrag.value.dragging) return;
  planeDrag.value = { ...planeDrag.value, dragging: false };
  gentleVibrate(6);
  if (planeResetTimer) window.clearTimeout(planeResetTimer);
  planeResetTimer = window.setTimeout(() => {
    planeDrag.value = { dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
  }, 450);
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
  addJourneyEntry, addMemoryPhotos, addMoodHistory, addWish,
  applyImportData, appUnlocked, arrivalReadyPercent, arrivalSteps,
  autoScheduleActiveJourney, backgroundBeams, backgroundMotes, BOY_NAME,
  burstParticles, cancelImportData, cancelSecretPress, capsuleShowAll,
  checkedInToday, checkForAppUpdate, checkins, checkinStreak,
  checkInToday, chooseRadar, clearDailyAnswer, clearDailyMessage,
  closenessLabel, cloudLoadingActive, cloudLoadingSteps, cloudStatus,
  cloudSyncBusy, cloudSyncConfigured, cloudToken, completedWishCount,
  completeTodayRitual, configuredStartDate, configuredStartDay, copyDailyReceipt,
  countdown, createBlankJourneyTrip, currentDayIndex, customSecretCodes,
  dailyAnswer, dailyMessage, dailyQuestions, dailyReceipt,
  dateKey, daysUntilMeeting, dismissOnboarding, dismissUpdateToast,
  displayBoyName, displayGirlName, draftStartDate, draftTargetDate,
  drawFortune, endPlaneDrag, enterUnlockedApp, exportActiveJourneyCalendar,
  exportData, exportMeetingCalendar, finishOpening, flippedCapsules,
  flipUnits, formatDateKey, formatJourneyDateLabel, fortuneDeck, fortuneLine, fortuneReady,
  fortuneTitle, gentleVibrate, getCloudSettingsUpdatedAt, getComparableCloudSnapshot,
  getInputValue, getLocalSettingsUpdatedAt, getStorageTimestamp, getTextareaValue,
  GIRL_NAME, handleAppInstalled, handleBeforeInstallPrompt, handleControllerChange,
  hiddenCardLine, importData, importJourneyFile, importJourneyRows,
  importJourneyText, importMessage, importMode, installApp,
  installedDisplayMode, installReady, introActive, introClosing,
  introMode, isArrivalMode, isIosDevice, isMeetingDay,
  isOnline, isScamRadarDay, JOURNEY_AUTO_TIME_SLOTS, journeyCalendarCells,
  journeyDays, journeyImportBusy, journeyImportHelp, journeyImportMessage,
  journeyImportText, journeyNewDayDate, journeyNewTripTitle, journeyOcrProgress,
  journeyPanelMode, journeySummaryStats, journeyTripCountdownLabel, journeyTripOptions,
  journeyTrips, launchSparkles, launchThemeBurst, loadCheckins,
  loadCloudData, loadCustomSecretCodes, loadDailyState, loadJourneyTrips,
  loadMeetingChecklist, loadMeetingMoments, loadMemoryPhotos, loadMoodHistory,
  loadSecretCode, loadSettings, loadSuitcase, loadWishes,
  localDataMode, localPreviewMode, lockApp, mailSecret,
  meetingChecklist, meetingChecklistItems, meetingChecklistProgress, meetingMomentItems,
  meetingMoments, meetingSummary, meetingSummaryLine, memoryPhotos,
  milestoneFlash, moodBottleDots, moodHistory, moodOptions,
  movePlaneDrag, navIndicatorStyle, newSecretCode, newWish,
  now, onboardingSteps, onboardingVisible, openingChapters,
  openingStars, openingThemeLabel, openThemeSettings, openTodayRitual,
  packingItems, parseJourneyRowsFromImage, parseJourneyRowsFromSpreadsheetFile, passwordBusy,
  passwordInput, passwordStatus, passwordSuccess, pendingImport,
  pendingImportSummary, photoFilmstrip, planeDrag, planeStyle,
  planeTrailStyle, playSoftSound, preparationStats, previewTheme,
  previewThemeSelection, progress, progressPercent, pwaInstallGuide,
  radarChoiceId, radarChoiceResult, radarChoices, radarResult,
  radarScanned, rawDayIndex, refreshForUpdate, reloadPersistentState,
  removeCustomSecretCode, removeJourneyDay, removeJourneyEntry, removeJourneyTrip,
  removeMemoryPhoto, removeWish, requestCloudSync, requestFinishOpening,
  resetSettings, resetToday, restoreSavedCloudSession, revealSecret,
  ritualComplete, ritualOpened, ritualProgress, ritualSteps,
  routeFillStyle, saveDailyAnswer, saveDailyMessage, savedMessageLine,
  saveJourneyTrips, saveMemoryPhotos, saveSettings, saveWishes,
  scanRadar, sceneStyle, sceneTilt, secretCodeInput,
  secretCodeList, secretCodeUnlocked, secretMailed, secretPressing,
  secretRevealed, secretWhisper, selectedMood, selectedMoodId,
  selectedMoodLine, selectJourneyDay, selectJourneyTrip, selectJourneyTripFromEvent,
  selectMood, setSettingsUpdatedAt, settings, settingsDraft,
  shareCopied, showPasswordInstallHint, sparkles, startCloudSyncLoop,
  startDateLabel, startOpeningSequence, startPlaneDrag, startSecretPress,
  suitcaseChecked, suitcaseItems, suitcaseProgress, syncCloudNow,
  targetDate, targetDateLabel, targetDateShortLabel, targetDayStart,
  targetOffsetDays, targetOffsetMax, targetTimelineStyle, taskCompleted,
  theaterLights, themeClass, themeOptions, themePreviewing,
  themeTransition, timelineEvents, timelineProgressStyle, todayJourney,
  todayNote, todayQuestion, todayStart, todayTask,
  toggleCapsule, toggleJourneyEntryDone, toggleMeetingChecklist, toggleMeetingMoment,
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
      <MemoriesView v-else-if="activeTab === 'memories'" />
      <PrepareView v-else-if="activeTab === 'prepare'" />
      <BottomNav />
    </div>
  </main>
</template>
