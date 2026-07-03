type CalendarEvent = {
  title: string;
  description: string;
  start: Date;
  end: Date;
};

export function downloadCalendar(events: CalendarEvent[], filename: string) {
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//count-to-814//first-meeting//ZH-TW',
    'CALSCALE:GREGORIAN',
    ...events.flatMap(formatEvent),
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatEvent(event: CalendarEvent) {
  const uid = `${event.start.getTime()}-${slug(event.title)}@count-to-814`;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtcDate(new Date())}`,
    `DTSTART:${formatUtcDate(event.start)}`,
    `DTEND:${formatUtcDate(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    'END:VEVENT'
  ];
}

function formatUtcDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function slug(value: string) {
  return encodeURIComponent(value).replace(/%/g, '').slice(0, 28);
}
