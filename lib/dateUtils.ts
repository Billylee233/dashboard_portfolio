import { DateRange } from './types';

/** YYYY-MM-DD 파싱 */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** n일 전/후 */
export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** 두 날짜 사이 일수 */
export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseDate(end).getTime() - parseDate(start).getTime()) / 86400000
  );
}

/** 오늘 기준 D-1 */
export function getD1(): string {
  return addDays(formatDate(new Date()), -1);
}

/** 최근 N일 range (D-1 기준) */
export function getRecentRange(days: number): DateRange {
  const end = getD1();
  const start = addDays(end, -(days - 1));
  return { start, end };
}

/**
 * 비교 기간 자동 계산
 * - 선택기간 ≤ 7일: 전주 동요일
 * - 선택기간 ≥ 8일: 겹치지 않는 전주 동요일
 */
export function calcComparePeriod(selected: DateRange): DateRange {
  const duration = daysBetween(selected.start, selected.end) + 1;

  if (duration <= 7) {
    // 정확히 7일 전 이동
    return {
      start: addDays(selected.start, -7),
      end: addDays(selected.end, -7),
    };
  } else {
    // 겹치지 않도록: 선택 시작일 하루 전부터 역산
    const compareEnd = addDays(selected.start, -1);
    const compareStart = addDays(compareEnd, -(duration - 1));
    return { start: compareStart, end: compareEnd };
  }
}

/** 빠른 선택 preset */
export type QuickSelect = '1d' | '7d' | '14d' | '21d' | 'thisMonth';

export function getPresetRange(preset: QuickSelect, latestDate?: string): DateRange {
  const base = latestDate || getD1();
  switch (preset) {
    case '1d': return { start: base, end: base };
    case '7d':  { const start = addDays(base, -6); return { start, end: base }; }
    case '14d': { const start = addDays(base, -13); return { start, end: base }; }
    case '21d': { const start = addDays(base, -20); return { start, end: base }; }
    case 'thisMonth': {
      const d = parseDate(base);
      const start = formatDate(new Date(d.getFullYear(), d.getMonth(), 1));
      return { start, end: base };
    }
  }
}

/** 표시용 레이블 */
export function formatDateRange(range: DateRange): string {
  return `${range.start} ~ ${range.end}`;
}

/** 요일명 */
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export function getDayName(dateStr: string): string {
  return DAY_NAMES[parseDate(dateStr).getDay()];
}

/** 한국 공휴일 (2025~2026) */
export const KR_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01', '2025-05-05', '2025-05-06', '2025-06-06',
  '2025-08-15', '2025-10-03', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  '2025-11-17', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-27', '2026-01-28', '2026-01-29',
  '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25',
  '2026-06-06', '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-03', '2026-10-09', '2026-12-25',
]);

export function isHoliday(dateStr: string): boolean {
  return KR_HOLIDAYS.has(dateStr);
}

export function isWeekday(dateStr: string): boolean {
  const day = parseDate(dateStr).getDay();
  return day >= 1 && day <= 5 && !isHoliday(dateStr);
}
