export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type CountdownUnit = keyof Countdown;

export type BurstParticle = {
  id: number;
  x: number;
  y: number;
  delay: string;
};

export type JourneyDay = {
  dateLabel: string;
  note: string;
  task: string;
  capsule: string;
};

export type Sparkle = {
  id: number;
  x: number;
  y: number;
};

export type MoodOption = {
  id: string;
  icon: string;
  label: string;
  line: string;
};

export type Fortune = {
  title: string;
  line: string;
};

export type TimelineEvent = {
  date: string;
  title: string;
  text: string;
  dayIndex: number;
};

export type PlaneDragState = {
  dragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
};

export type MemoryPhoto = {
  id: string;
  name: string;
  dataUrl: string;
};

export type DailyQuestion = {
  prompt: string;
  hint: string;
};

export type RadarChoice = {
  id: string;
  label: string;
  result: string;
};

export type ThemeId = 'peach' | 'mint' | 'night';

export type AppSettings = {
  boyName: string;
  girlName: string;
  theme: ThemeId;
  startDate: string;
  startTime: string;
  targetDate: string;
  targetTime: string;
  welcomeLine: string;
  reducedMotion: boolean;
  soundFeedback: boolean;
};

export type WishItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export type MeetingMoment = {
  id: string;
  label: string;
};

export type JourneyEntry = {
  id: string;
  time: string;
  endTime: string;
  city: string;
  plan: string;
  stay: string;
  transport: string;
  duration: string;
  note: string;
  done: boolean;
};

export type JourneyEditableEntryField = 'time' | 'endTime' | 'city' | 'plan' | 'stay' | 'transport' | 'duration' | 'note';

export type JourneyImportRow = {
  dayLabel: string;
  date: string;
  city: string;
  plan: string;
  stay: string;
  transport: string;
  duration: string;
  note: string;
};

export type JourneyPanelMode = 'schedule' | 'import';

export type JourneyScheduleSection = {
  id: string;
  label: string;
  caption: string;
  entries: JourneyEntry[];
};

export type JourneyPlanDay = {
  id: string;
  dayLabel: string;
  date: string;
  city: string;
  stay: string;
  entries: JourneyEntry[];
};

export type JourneyTrip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string;
  days: JourneyPlanDay[];
};

export type ActiveTab = 'countdown' | 'today' | 'journey' | 'memories' | 'prepare';
