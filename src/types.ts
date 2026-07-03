export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
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
  targetTime: string;
  welcomeLine: string;
  reducedMotion: boolean;
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

export type ActiveTab = 'countdown' | 'today' | 'memories' | 'prepare';
