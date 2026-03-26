/**
 * lib/portfolio/transform.ts
 * 포트폴리오 모드 전용 데이터 변환 유틸
 *
 * PORTFOLIO_MODE=true 환경변수가 설정된 경우에만 동작
 * 모든 변환은 API Route 레이어(서버)에서만 실행 → 브라우저 비노출
 */

import { calcMetrics } from '@/lib/calculations';
import type { MetricsRow } from '@/lib/types';

export const IS_PORTFOLIO = process.env.PORTFOLIO_MODE === 'true';

// ─────────────────────────────────────────────────────────────
// 포트폴리오 노출 제한: 채널 화이트리스트
// ─────────────────────────────────────────────────────────────
export const PORTFOLIO_CHANNELS = [
  'Carrot Market',
  'Instagram',
  'Toss',
  'SA_Google',
  'Naver_CommAD',
] as const;

/**
 * DB 최신 날짜(maxDate)를 기준으로 포트폴리오 허용 기간을 계산.
 * max = maxDate, min = maxDate 기준 1년 전 (당일 포함)
 *
 * 사용법: 각 API route에서 queryPortfolioMaxDate()로 maxDate를 가져온 뒤 호출.
 */
export function getPortfolioDateRange(maxDate: string): { min: string; max: string } {
  const minDate = new Date(maxDate);
  minDate.setFullYear(minDate.getFullYear() - 1);
  return {
    max: maxDate,
    min: minDate.toISOString().slice(0, 10),
  };
}

/**
 * 날짜 문자열을 포트폴리오 허용 기간으로 클램핑.
 * IS_PORTFOLIO=false이거나 값이 없으면 원본 반환.
 */
export function clampPortfolioDate(
  d: string | null | undefined,
  range: { min: string; max: string }
): string | null {
  if (!IS_PORTFOLIO || !d) return d ?? null;
  if (d > range.max) return range.max;
  if (d < range.min) return range.min;
  return d;
}

/**
 * 채널 목록을 포트폴리오 화이트리스트로 필터링.
 * IS_PORTFOLIO=false면 원본 목록 그대로 반환.
 */
export function filterPortfolioChannels(channels: string[]): string[] {
  if (!IS_PORTFOLIO) return channels;
  return channels.filter(c => (PORTFOLIO_CHANNELS as readonly string[]).includes(c));
}

/**
 * BigQuery SQL용 media 화이트리스트 필터 문자열 반환.
 * IS_PORTFOLIO=true  → "AND media IN ('Carrot Market','Instagram',...)" 
 * IS_PORTFOLIO=false → "" (조건 없음)
 *
 * 사용 예: `WHERE DATE(date) BETWEEN ... ${portfolioMediaSQL()}`
 */
export function portfolioMediaSQL(): string {
  if (!IS_PORTFOLIO) return '';
  const list = (PORTFOLIO_CHANNELS as readonly string[]).map(c => `'${c}'`).join(', ');
  return `AND media IN (${list})`;
}

// ─────────────────────────────────────────────────────────────
// 수치 변환 계수
// ─────────────────────────────────────────────────────────────
const M = {
  imp:       4.5,
  click:     5.5,
  cost:      5.0,
  applicant: 5.1,
} as const;

// ─────────────────────────────────────────────────────────────
// 해시 라벨 생성 (동일 입력 → 항상 동일 출력)
// ─────────────────────────────────────────────────────────────
function hashNum(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  }
  return (h % mod) + 1;
}

export function maskChannel(name: string | null | undefined): string {
  if (!IS_PORTFOLIO || !name) return name ?? '';
  return `채널${String(hashNum(name, 90) + 9).padStart(2, '0')}`;
}

export function maskCampaign(name: string | null | undefined): string {
  if (!IS_PORTFOLIO || !name) return name ?? '';
  return `캠페인${String(hashNum(name + '_c', 90) + 9).padStart(2, '0')}`;
}

export function maskGroup(name: string | null | undefined): string {
  if (!IS_PORTFOLIO || !name) return name ?? '';
  return `그룹${String(hashNum(name + '_g', 90) + 9).padStart(2, '0')}`;
}

export function maskAd(name: string | null | undefined): string {
  if (!IS_PORTFOLIO || !name) return name ?? '';
  return `소재${String(hashNum(name + '_a', 90) + 9).padStart(2, '0')}`;
}

export function maskKeyword(name: string | null | undefined): string {
  if (!IS_PORTFOLIO || !name) return name ?? '';
  return `키워드${hashNum(name + '_k', 900) + 99}`;
}

// ─────────────────────────────────────────────────────────────
// 수치 변환 (4개 원본 지표 → 파생지표 자동 재계산)
// ─────────────────────────────────────────────────────────────
export function transformMetrics(row: MetricsRow): MetricsRow {
  if (!IS_PORTFOLIO) return row;
  return calcMetrics({
    imp:       Math.round(row.imp       * M.imp),
    click:     Math.round(row.click     * M.click),
    cost:      Math.round(row.cost      * M.cost),
    applicant: Math.round(row.applicant * M.applicant),
  });
}

// ─────────────────────────────────────────────────────────────
// 역채널 매핑 (URL 파라미터 → BQ 쿼리용)
// ─────────────────────────────────────────────────────────────
export function buildReverseChannelMap(
  realChannels: string[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ch of realChannels) {
    map.set(maskChannel(ch), ch);
  }
  return map;
}

export function reverseChannel(
  maskedName: string,
  reverseMap: Map<string, string>
): string {
  return reverseMap.get(maskedName) ?? maskedName;
}

// ─────────────────────────────────────────────────────────────
// 포트폴리오 전용 테이블명 반환
// ─────────────────────────────────────────────────────────────
export function ptable(baseName: string): string {
  return IS_PORTFOLIO ? `portfolio_${baseName}` : baseName;
}
