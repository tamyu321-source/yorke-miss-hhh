import type { Countdown, JourneyDay } from '../types';
import {
  abstractCapsuleIdeas,
  abstractNoteDetails,
  abstractNoteOpenings,
  abstractTaskIdeas,
  capsuleAdjectives,
  capsuleNouns,
  DAY_MS,
  defaultSettings,
  noteTextures,
  noteWhispers,
  relationshipPhases,
  specialJourneyDays,
  taskMotions,
  taskObjects
} from '../data/appData';

export function createJourneyDays(start: Date, target: Date): JourneyDay[] {
  const totalDays = Math.max(Math.floor((startOfDay(target).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1, 1);

  return Array.from({ length: totalDays }, (_, index) => {
    const dayNumber = index + 1;
    const date = addDays(start, index);
    const dateLabel = formatMonthDay(date);
    const specialDay = specialJourneyDays[formatDateKey(date)];

    if (specialDay) {
      return { dateLabel, ...specialDay };
    }

    const phase = getRelationshipPhase(dayNumber);
    const note = buildDailyNote(dayNumber, index, phase.label);
    const task = buildDailyTask(dateLabel, index);
    const capsule = buildDailyCapsule(dateLabel, index, phase.label);

    return { dateLabel, note, task, capsule };
  });
}

export function buildDailyNote(dayNumber: number, index: number, phaseLabel: string) {
  const opening = pick(noteTextures, index);
  const whisper = pick(noteWhispers, index * 7);
  const quietImage = pick(abstractNoteOpenings, index * 11);
  const quietDetail = pick(abstractNoteDetails, index * 13);

  return `第 ${dayNumber} 天｜${phaseLabel}。${opening}，${quietImage}。${whisper}；${quietDetail}`;
}

export function buildDailyTask(dateLabel: string, index: number) {
  const motion = pick(taskMotions, index * 5);
  const object = pick(taskObjects, index * 7);
  const softHint = pick(abstractTaskIdeas, index * 9);

  return `${dateLabel} 小任務：${motion}，像收好${object}那樣。也可以只是${softHint}。`;
}

export function buildDailyCapsule(dateLabel: string, index: number, phaseLabel: string) {
  const adjective = pick(capsuleAdjectives, index * 3);
  const noun = pick(capsuleNouns, index * 5);
  const oldImage = pick(abstractCapsuleIdeas, index * 7);

  return `${dateLabel}｜${phaseLabel}：${buildCapsuleLine(index, adjective, noun, oldImage)}`;
}

export function buildCapsuleLine(index: number, adjective: string, noun: string, oldImage: string) {
  const lines = [
    `把${adjective}的${noun}收進今天，旁邊放著${oldImage}。`,
    `${adjective}的${noun}停在頁邊，像${oldImage}。`,
    `今天留下${noun}的一點${adjective}，也留下${oldImage}。`,
    `有一點${adjective}落在${noun}上，慢慢變成${oldImage}。`,
    `${oldImage}靠著${noun}睡著，夢裡有很${adjective}的光。`,
    `把${oldImage}摺好，夾進${adjective}的${noun}裡。`,
    `${noun}沒有說話，只替${oldImage}留下一點${adjective}。`,
    `這一頁很輕，像${adjective}的${oldImage}，也像${noun}。`
  ];

  return lines[index % lines.length];
}

export function getRelationshipPhase(dayNumber: number) {
  return relationshipPhases.find((phase) => dayNumber <= phase.untilDay) ?? relationshipPhases[relationshipPhases.length - 1];
}

export function getCountdown(value: Date, target: Date): Countdown {
  if (value.getTime() >= target.getTime()) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const diff = Math.max(target.getTime() - value.getTime(), 0);

  return {
    days: Math.floor(diff / DAY_MS),
    hours: Math.floor((diff % DAY_MS) / (60 * 60 * 1000)),
    minutes: Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000)),
    seconds: Math.floor((diff % (60 * 1000)) / 1000)
  };
}

export function parseClockTime(value: string, fallback: string): [number, number] {
  const [rawHours, rawMinutes] = normalizeClockTime(value, fallback).split(':').map(Number);
  return [rawHours, rawMinutes];
}

export function normalizeClockTime(value: string, fallback: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hours = clamp(Number(match[1]), 0, 23);
  const minutes = clamp(Number(match[2]), 0, 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseDateSetting(value: string, fallback = defaultSettings.startDate): [number, number, number] {
  const normalized = normalizeDateSetting(value, fallback);
  const [year, month, day] = normalized.split('-').map(Number);
  return [year, month, day];
}

export function normalizeDateSetting(value: string, fallback = defaultSettings.startDate) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return fallback;
  const year = clamp(Number(match[1]), 2020, 2035);
  const month = clamp(Number(match[2]), 1, 12);
  const maxDay = new Date(year, month, 0).getDate();
  const day = clamp(Number(match[3]), 1, maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

export function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonthDay(value: Date) {
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日`;
}

export function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

export function getClosenessLabel(percent: number) {
  if (percent >= 100) return '故事正式開始';
  if (percent >= 88) return '快見面了';
  if (percent >= 70) return '心意很近';
  if (percent >= 48) return '慢慢靠近';
  if (percent >= 24) return '熟悉發芽';
  if (percent >= 8) return '觀察與好奇';
  return '相識第一頁';
}

export function getCheckinStreak(days: string[], fromDate: Date) {
  const daySet = new Set(days);
  let streak = 0;
  let cursor = startOfDay(fromDate);

  while (daySet.has(formatDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
