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
// ex) /channel-detail?media=채널10 → BigQuery에는 원본명으로 조회
//
// 해시는 단방향이라 역변환 불가 → 채널 목록을 조회해서 매칭
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
// IS_PORTFOLIO=true → portfolio_ prefix 테이블 사용
// ─────────────────────────────────────────────────────────────
export function ptable(baseName: string): string {
  return IS_PORTFOLIO ? `portfolio_${baseName}` : baseName;
}
