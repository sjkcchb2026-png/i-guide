/**
 * Date and time formatting utilities strictly locked to Asia/Kuala_Lumpur (UTC+8)
 */

export const MALAYSIA_TIMEZONE = 'Asia/Kuala_Lumpur';

export function getTodayDateString(baseDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(baseDate); // YYYY-MM-DD
}

export function getCurrentMalaysiaTimeString(): string {
  return new Intl.DateTimeFormat('zh-MY', {
    timeZone: MALAYSIA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function formatTimeFromTimestamp(timestamp: any): string {
  if (!timestamp) return '--:--';
  let date: Date;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (timestamp._seconds) {
    date = new Date(timestamp._seconds * 1000);
  } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    return '--:--';
  }

  return new Intl.DateTimeFormat('zh-MY', {
    timeZone: MALAYSIA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatShortTime(timestamp: any): string {
  if (!timestamp) return '--:--';
  let date: Date;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (timestamp._seconds) {
    date = new Date(timestamp._seconds * 1000);
  } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    return '--:--';
  }

  return new Intl.DateTimeFormat('zh-MY', {
    timeZone: MALAYSIA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  
  const formatterZh = new Intl.DateTimeFormat('zh-MY', {
    timeZone: MALAYSIA_TIMEZONE,
    weekday: 'long',
  });
  const formatterMs = new Intl.DateTimeFormat('ms-MY', {
    timeZone: MALAYSIA_TIMEZONE,
    weekday: 'long',
  });

  const weekdayZh = formatterZh.format(date);
  const weekdayMs = formatterMs.format(date);

  return `${year}年${Number(month)}月${Number(day)}日 (${weekdayZh} / ${weekdayMs})`;
}

export function calculateDuration(checkIn: any, checkOut: any): string {
  if (!checkIn || !checkOut) return '-';
  const t1 = checkIn.toDate
    ? checkIn.toDate().getTime()
    : checkIn._seconds
    ? checkIn._seconds * 1000
    : new Date(checkIn).getTime();
  const t2 = checkOut.toDate
    ? checkOut.toDate().getTime()
    : checkOut._seconds
    ? checkOut._seconds * 1000
    : new Date(checkOut).getTime();

  const diffMinutes = Math.max(0, Math.floor((t2 - t1) / (1000 * 60)));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours > 0) {
    return `${hours}小时 ${mins}分钟 (${hours}j ${mins}m)`;
  }
  return `${mins}分钟 (${mins}m)`;
}
