import type { CSSProperties } from 'react';
import type { MetricsRow, RawRow } from './types';

/** 0 나누기 방지 — 분모 0이면 0 반환 */
const safeDiv = (numerator: number, denominator: number): number => {
  if (!denominator || !isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return isFinite(result) ? result : 0;
};

/** null/undefined → 0 */
const n = (v: number | null | undefined): number => v ?? 0;

/** RawRow → MetricsRow (파생지표 계산) */
export function calcMetrics(row: {
  imp?: number | null;
  click?: number | null;
  cost?: number | null;
  applicant?: number | null;
}): MetricsRow {
  const imp = n(row.imp);
  const click = n(row.click);
  const cost = n(row.cost);
  const applicant = n(row.applicant);

  return {
    imp,
    click,
    cost,
    applicant,
    ctr: safeDiv(click, imp),           // click / imp (소수, ×100 없음)
    cvr: safeDiv(applicant, click),     // applicant / click (소수, ×100 없음)
    cpc: safeDiv(cost, click),          // cost / click
    cpa: safeDiv(cost, applicant),      // cost / applicant
  };
}

/** 집계된 숫자 더미 배열 → 합산 MetricsRow */
export function sumMetrics(rows: MetricsRow[]): MetricsRow {
  const totals = rows.reduce(
    (acc, r) => ({
      imp: acc.imp + r.imp,
      click: acc.click + r.click,
      cost: acc.cost + r.cost,
      applicant: acc.applicant + r.applicant,
    }),
    { imp: 0, click: 0, cost: 0, applicant: 0 }
  );
  return calcMetrics(totals);
}

/** 두 MetricsRow 간 Delta / Delta% 계산 */
export function calcDelta(selected: MetricsRow, compared: MetricsRow): {
  delta: MetricsRow;
  deltaPercent: MetricsRow;
} {
  const keys: (keyof MetricsRow)[] = ['imp', 'click', 'cost', 'applicant', 'ctr', 'cvr', 'cpc', 'cpa'];
  const delta = {} as MetricsRow;
  const deltaPercent = {} as MetricsRow;

  for (const k of keys) {
    delta[k] = selected[k] - compared[k];
    deltaPercent[k] = safeDiv(selected[k] - compared[k], compared[k]);
  }

  return { delta, deltaPercent };
}

/** 포맷 유틸 */
export const fmt = {
  number: (v: number | null | undefined, digits = 0) =>
    (v == null || isNaN(v) ? '–' : v.toLocaleString('ko-KR', { maximumFractionDigits: digits })),

  cost: (v: number | null | undefined) =>
    (v == null || isNaN(v) ? '–' : '₩' + v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })),

  /** CTR / CVR: 소수값을 % 문자열로 (×100) */
  pct: (v: number, digits = 2) =>
    (v * 100).toFixed(digits) + '%',

  /** Delta%: 소수값 → % 표시 */
  deltaPct: (v: number, digits = 1) =>
    (v >= 0 ? '+' : '') + (v * 100).toFixed(digits) + '%',

  cpa: (v: number) =>
    '₩' + v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }),
};

/** 산점도 4분면 레이블 */
export function getQuadrantLabel(
  cpa: number,
  cvr: number,
  avgCpa: number,
  avgCvr: number
): '효자' | 'CVR 개선' | 'CPC 개선' | '금쪽이' {
  const lowCpa = cpa <= avgCpa;
  const highCvr = cvr >= avgCvr;
  if (lowCpa && highCvr) return '효자';
  if (lowCpa && !highCvr) return 'CVR 개선';
  if (!lowCpa && highCvr) return 'CPC 개선';
  return '금쪽이';
}

/** 버블 크기 — 로그 스케일 (최소 8px, 최대 60px) */
export function bubbleSize(applicant: number, maxApplicant: number): number {
  if (maxApplicant === 0) return 8;
  const MIN = 8, MAX = 60;
  const logVal = Math.log1p(applicant);
  const logMax = Math.log1p(maxApplicant);
  return MIN + (MAX - MIN) * safeDiv(logVal, logMax);
}

/** 트렌드 계산: 현재 CPA vs 동기간 직전 주 CPA */
export function calcTrend(
  currentCpa: number,
  prevCpa: number,
  currentApp?: number,
  prevApp?: number,
): { trend: 'improving' | 'stable' | 'worsening'; pct: number } {
  // 지원자 수 기준: 지원자 늘면 improving(↑), 줄면 worsening(↓)
  if (currentApp !== undefined && prevApp !== undefined && prevApp > 0) {
    const pct = safeDiv(currentApp - prevApp, prevApp);
    if (pct > 0.05)  return { trend: 'improving', pct };
    if (pct < -0.05) return { trend: 'worsening', pct };
    return { trend: 'stable', pct };
  }
  // fallback: CPA 기준
  const pct = safeDiv(currentCpa - prevCpa, prevCpa);
  if (pct < -0.05) return { trend: 'improving', pct };
  if (pct > 0.05)  return { trend: 'worsening', pct };
  return { trend: 'stable', pct };
}

/**
 * 위기 판단: AND 조건
 * - D-1 vs 전주 동요일 30% 이상 변화
 * - AND (최근 3일 avg OR 최근 7일 avg) 30% 이상 변화
 */
export const CRISIS_THRESHOLD = 0.3; // 30%

export function isCrisisCondition(
  deltaPercent: number,
  isInverseMetric: boolean  // CPA/CPC는 증가가 위기
): boolean {
  return isInverseMetric
    ? deltaPercent >= CRISIS_THRESHOLD
    : deltaPercent <= -CRISIS_THRESHOLD;
}

// ─── Delta 색상 — inline style 방식 (CSS 변수 즉시 반영) ─────────────────────
/**
 * deltaStyle: CSSProperties 반환. invertPositive=true → CPA/CPC 등 역지표
 * CSS 변수(--color-delta-*)를 사용해 ThemeEditor 변경이 즉시 반영됨
 */
export function deltaStyle(value: number, invertPositive = false): CSSProperties {
  if (Math.abs(value) < 0.001) return { color: 'var(--color-delta-neutral)' };
  if (invertPositive) {
    return { color: value > 0 ? 'var(--color-delta-inv-pos)' : 'var(--color-delta-inv-neg)' };
  }
  return { color: value > 0 ? 'var(--color-delta-pos)' : 'var(--color-delta-neg)' };
}

/** @deprecated deltaStyle 사용 권장 */
export function deltaColor(_value: number, _invertPositive = false): string {
  return '';
}
