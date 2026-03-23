import type { CSSProperties } from 'react';
// React CSSProperties 타입 사용 (Next.js 14 환경)
import { fmt } from '@/lib/calculations';

// ─────────────────────────────────────────────────────────────
// 1. 컬럼 표준 Width  (각 컴포넌트는 필요에 따라 오버라이드 가능)
// ─────────────────────────────────────────────────────────────
export const COL_W = {
  rank:       32,
  keyword:   160,
  keyword_s: 120,  // 좁은 키워드 (Movement용)
  campaign:  128,
  group:     128,
  creative:  128,
  channel:   120,
  date:       90,
  dateLong:  200,
  period:     80,
  period_s:   50,
  imp:        80,
  click:      72,
  ctr:        72,
  cost:       96,
  cpc:        80,
  app:        60,
  cpa:        88,
  cvr:        72,
  ratio:      88,  // vs 평균(%)
  delta:      72,  // Δ
  deltaPct:   80,  // Δ%
  action:    120,  // 편집/삭제
  badge:      52,  // NEW/OUT 등
} as const;

// ─────────────────────────────────────────────────────────────
// 2. th / td 공통 스타일
// ─────────────────────────────────────────────────────────────
export const thStyle: CSSProperties = {
  padding: 'var(--table-row-padding) 8px',
  fontSize: 'var(--font-table-header)',
  fontWeight: 600,
  color: 'var(--color-text-tertiary)',
  letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--color-border-subtle)',
  backgroundColor: 'var(--color-surface-2)',
  whiteSpace: 'nowrap',
};

/** sticky thead 전용 — thStyle 확장 */
export const thStickyStyle: CSSProperties = {
  ...thStyle,
  position: 'sticky',
  top: 0,
  zIndex: 2,
};

export const tdStyle: CSSProperties = {
  padding: 'var(--table-row-padding) 8px',
  fontSize: 'var(--font-table-body)',
  borderBottom: '1px solid var(--color-border-subtle)',
  whiteSpace: 'nowrap',
};

/** 우측 정렬 td 전용 — tdStyle 확장 */
export const tdRStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
};

// ─────────────────────────────────────────────────────────────
// 3. 줄무늬 행 배경  (opacity 22%로 통일)
// ─────────────────────────────────────────────────────────────
const ODD_BG = 'color-mix(in srgb, var(--color-border-subtle) 22%, transparent)';

export const rowBg = (idx: number): string =>
  idx % 2 === 0 ? 'transparent' : ODD_BG;

// ─────────────────────────────────────────────────────────────
// 4. 테이블 컨테이너 maxHeight 표준
// ─────────────────────────────────────────────────────────────
export const TABLE_MAX_H = {
  sm: 320,
  md: 400,
  lg: 480,
} as const;

// ─────────────────────────────────────────────────────────────
// 5. 히트맵 유틸
// ─────────────────────────────────────────────────────────────
export const HEATMAP_OPACITY = 0.32;

/** hex 색상 → [R, G, B] 튜플  (accent 기본값: #0ea5e9) */
export function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [14, 165, 233];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 값의 min~max 범위에서 opacity를 계산해 rgba 배경색 반환 */
export function heatmapBg(
  value: number,
  min: number,
  max: number,
  rgb: [number, number, number],
): string {
  if (max === min) return 'transparent';
  const t = (value - min) / (max - min);
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(t * HEATMAP_OPACITY).toFixed(3)})`;
}

/** rows 배열에서 지정 key들의 min/max 범위 계산 */
export function calcHeatmapRanges(
  rows: Record<string, number>[],
  keys: string[],
): Record<string, { min: number; max: number }> {
  const result: Record<string, { min: number; max: number }> = {};
  keys.forEach(k => {
    const vals = rows.map(r => Number(r[k] ?? 0));
    result[k] = { min: Math.min(...vals), max: Math.max(...vals) };
  });
  return result;
}

// ─────────────────────────────────────────────────────────────
// 6. 지표 메타데이터  (label · width · fmtFn · invert · heatmap)
//    컴포넌트에서 컬럼 루프를 돌 때 참조용으로 사용
// ─────────────────────────────────────────────────────────────
export type MetricKey = 'imp' | 'click' | 'ctr' | 'cost' | 'cpc' | 'applicant' | 'cpa' | 'cvr';

export const METRIC_META: Record<MetricKey, {
  label: string;
  width: number;
  fmtFn: (v: number) => string;
  invert: boolean;
  heatmap: boolean;
}> = {
  imp:       { label: 'IMP',   width: COL_W.imp,   fmtFn: v => fmt.number(v),  invert: false, heatmap: false },
  click:     { label: 'CLICK', width: COL_W.click,  fmtFn: v => fmt.number(v),  invert: false, heatmap: true  },
  ctr:       { label: 'CTR',   width: COL_W.ctr,    fmtFn: v => fmt.pct(v),     invert: false, heatmap: false },
  cost:      { label: 'COST',  width: COL_W.cost,   fmtFn: v => fmt.cost(v),    invert: false, heatmap: true  },
  cpc:       { label: 'CPC',   width: COL_W.cpc,    fmtFn: v => fmt.cost(v),    invert: true,  heatmap: false },
  applicant: { label: 'APP',   width: COL_W.app,    fmtFn: v => fmt.number(v),  invert: false, heatmap: true  },
  cpa:       { label: 'CPA',   width: COL_W.cpa,    fmtFn: v => fmt.cost(v),    invert: true,  heatmap: false },
  cvr:       { label: 'CVR',   width: COL_W.cvr,    fmtFn: v => fmt.pct(v),     invert: false, heatmap: true  },
};
