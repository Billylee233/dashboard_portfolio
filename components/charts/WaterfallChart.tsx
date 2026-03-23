'use client';
import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';

// ─── 지표 목록 (CTR·CPC·CPA·CVR 제외 — 증감 시인성 낮아 제거) ─────────────────
type MetricKey = 'imp' | 'click' | 'cost' | 'applicant';

const METRICS: { key: MetricKey; label: string; fmtFn: (v: number) => string }[] = [
  { key: 'imp',       label: 'IMP',   fmtFn: v => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmtFn: v => fmt.number(v) },
  { key: 'cost',      label: 'COST',  fmtFn: v => fmt.cost(v)   },
  { key: 'applicant', label: 'APP',   fmtFn: v => fmt.number(v) },
];

export interface WaterfallDataItem {
  label: string;
  selected: { imp?: number; click?: number; cost?: number; applicant?: number };
  compared: { imp?: number; click?: number; cost?: number; applicant?: number };
}

interface WaterfallEntry {
  label:     string;
  dateLabel: string;   // 합계 바 내부에 표시할 날짜 텍스트
  invisible: number;
  posVal:    number;
  negVal:    number;
  isTotal:   boolean;
  isStart:   boolean;
  selectedVal: number;
  comparedVal: number;
  delta:     number;
}

function getVal(row: WaterfallDataItem['selected'], metric: MetricKey): number {
  return row[metric] ?? 0;
}

// ─── 날짜 라벨 생성 (바 내부 표시용) ──────────────────────────────────────────
// 단일일 → "2026-03-21"
// 2일 이상 → "2026-03-21\n~\n2026-03-22" (줄바꿈 구분)
function makeDateLabel(start: string, end: string): string {
  if (!start) return '';
  if (!end || start === end) return start;
  return `${start}\n~\n${end}`;
}

// ─── 합계 바 내부 날짜 라벨 — Recharts Bar label content prop ─────────────────
function TotalBarLabel(props: any) {
  const { x, y, width, height, value, fontSize } = props;
  if (!value) return null;
  const lines: string[] = String(value).split('\n').filter(Boolean);
  const fz  = fontSize ?? 9;
  const lineH = fz + 3;
  const totalTextH = lines.length * lineH;
  if (height < totalTextH + 6) return null; // 바가 너무 낮으면 생략
  const cx     = x + width / 2;
  const startY = y + height / 2 - totalTextH / 2 + lineH / 2;
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={startY + i * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.90)"
          fontSize={fz}
          fontWeight={600}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// ─── 폭포수 빌드 ──────────────────────────────────────────────────────────────
function buildWaterfall(
  items: WaterfallDataItem[],
  metric: MetricKey,
  cmpDateLabel: string,
  selDateLabel: string,
): WaterfallEntry[] {
  const filtered = items.filter(
    it => getVal(it.selected, metric) !== 0 || getVal(it.compared, metric) !== 0,
  );

  const sorted = [...filtered].sort(
    (a, b) => getVal(b.selected, metric) - getVal(a.selected, metric),
  );

  const compareTotal  = sorted.reduce((s, it) => s + getVal(it.compared, metric),  0);
  const selectedTotal = sorted.reduce((s, it) => s + getVal(it.selected, metric), 0);

  const result: WaterfallEntry[] = [];

  // 비교기간 합계 (왼쪽) — X축: "비교기간", 바 내부: 실제 날짜
  result.push({
    label: '비교기간', dateLabel: cmpDateLabel,
    invisible: 0, posVal: compareTotal, negVal: 0,
    isTotal: true, isStart: true,
    selectedVal: compareTotal, comparedVal: compareTotal, delta: 0,
  });

  let running = compareTotal;

  for (const item of sorted) {
    const sel   = getVal(item.selected, metric);
    const cmp   = getVal(item.compared, metric);
    const delta = sel - cmp;

    if (delta >= 0) {
      result.push({
        label: item.label, dateLabel: '',
        invisible: running, posVal: delta, negVal: 0,
        isTotal: false, isStart: false,
        selectedVal: sel, comparedVal: cmp, delta,
      });
    } else {
      result.push({
        label: item.label, dateLabel: '',
        invisible: Math.max(0, running + delta), posVal: 0, negVal: -delta,
        isTotal: false, isStart: false,
        selectedVal: sel, comparedVal: cmp, delta,
      });
    }
    running += delta;
  }

  // 기준기간 합계 (오른쪽) — X축: "기준기간", 바 내부: 실제 날짜
  result.push({
    label: '기준기간', dateLabel: selDateLabel,
    invisible: 0, posVal: selectedTotal, negVal: 0,
    isTotal: true, isStart: false,
    selectedVal: selectedTotal, comparedVal: compareTotal,
    delta: selectedTotal - compareTotal,
  });

  return result;
}

// ─── Y축 동적 도메인 ──────────────────────────────────────────────────────────
// 낙차 2배 강화:
//   1) 중간 바의 실제 범위(midMin~midMax)를 기준으로 삼음
//   2) Y축 하단을 midMin에서 전체 변화폭의 40% 더 내려 바 높이 차이를 극대화
//   3) 합계 바가 범위를 크게 벗어나는 경우만 포함, 그 외는 타이트하게 유지
function calcYDomain(data: WaterfallEntry[]): [number, number] {
  let midMin = Infinity, midMax = -Infinity;

  for (const d of data) {
    if (d.isTotal) continue;
    if (d.posVal > 0) {
      midMin = Math.min(midMin, d.invisible);
      midMax = Math.max(midMax, d.invisible + d.posVal);
    } else if (d.negVal > 0) {
      midMin = Math.min(midMin, d.invisible);
      midMax = Math.max(midMax, d.invisible + d.negVal);
    }
  }

  if (!isFinite(midMin) || !isFinite(midMax)) {
    const totalVals = data.filter(d => d.isTotal).map(d => d.posVal);
    if (!totalVals.length) return [0, 1];
    const tMin = Math.min(...totalVals);
    const tMax = Math.max(...totalVals);
    const r = Math.max(tMax - tMin, tMax * 0.1);
    return [Math.max(0, tMin - r * 0.4), tMax + r * 0.06];
  }

  const midRange = midMax - midMin;

  // 합계 바 포함해 전체 실제 범위 파악
  const totalVals = data.filter(d => d.isTotal).map(d => d.posVal);
  const allMax = Math.max(midMax, ...totalVals);

  // ✅ 낙차 2배 강화:
  //   하단 = midMin - (midRange * 0.40) → 바들이 차트 중단~상단에 집중, 높이 차이 극대화
  //   상단 = allMax + 소폭 패딩
  const yMin = Math.max(0, midMin - midRange * 0.40);
  const yMax = allMax + (allMax - yMin) * 0.06;

  return [yMin, yMax];
}

// ─── 커스텀 툴팁 ──────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, metric }: any) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as WaterfallEntry | undefined;
  if (!entry) return null;
  const meta = METRICS.find(m => m.key === metric)!;
  const deltaColor = entry.delta >= 0 ? 'var(--color-delta-pos)' : 'var(--color-delta-neg)';

  return (
    <div style={{
      backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)',
      borderRadius: 'var(--tooltip-radius)', padding: 'var(--tooltip-padding)',
      boxShadow: 'var(--tooltip-shadow)', fontSize: 'var(--font-chart-axis)', minWidth: 175,
    }}>
      <p style={{ fontSize: 'var(--font-chart-axis)', color: 'var(--color-text-primary)', fontWeight: 700, marginBottom: 6 }}>
        {entry.label}
      </p>
      {entry.isTotal ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{meta.label} 합계</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{meta.fmtFn(entry.selectedVal)}</span>
        </div>
      ) : (
        <>
          {[
            { lbl: '기준기간', val: entry.selectedVal },
            { lbl: '비교기간', val: entry.comparedVal },
          ].map(({ lbl, val }) => (
            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{lbl}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{meta.fmtFn(val)}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            paddingTop: 4, borderTop: '1px solid var(--color-border-subtle)', marginTop: 2,
          }}>
            <span style={{ color: 'var(--color-text-muted)' }}>변화량</span>
            <span style={{ color: deltaColor, fontWeight: 700 }}>
              {entry.delta >= 0 ? '+' : ''}{meta.fmtFn(entry.delta)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Props ─────────────────────────────────────────────────────────────────────
export interface WaterfallChartProps {
  title?: React.ReactNode;
  items: WaterfallDataItem[];
  loading?: boolean;
  // 날짜 범위 — X축 합계 바 라벨에 실제 날짜 표기
  selectedRange?: { start: string; end: string };
  compareRange?:  { start: string; end: string };
  // 계층 탭 (Channel Detail 전용)
  hierarchyTabs?: { key: string; label: string }[];
  activeHierarchyTab?: string;
  onHierarchyTabChange?: (key: string) => void;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function WaterfallChart({
  title, items, loading,
  selectedRange, compareRange,
  hierarchyTabs, activeHierarchyTab, onHierarchyTabChange,
}: WaterfallChartProps) {
  const theme = useTheme();
  const [metric, setMetric] = useState<MetricKey>('applicant');

  // 날짜 라벨 생성 (바 내부 표시용)
  const selDateLabel = selectedRange
    ? makeDateLabel(selectedRange.start, selectedRange.end)
    : '';
  const cmpDateLabel = compareRange
    ? makeDateLabel(compareRange.start, compareRange.end)
    : '';

  const data   = useMemo(
    () => buildWaterfall(items, metric, cmpDateLabel, selDateLabel),
    [items, metric, cmpDateLabel, selDateLabel],
  );
  const domain = useMemo(() => calcYDomain(data), [data]);
  const meta   = METRICS.find(m => m.key === metric)!;

  // 지표 선택 버튼 (Cost/APP/CPA 등) — accent
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  });
  // 계층 탭 버튼 (Campaign/Group/Ad) — chartBar 색으로 구분
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
    backgroundColor: active ? theme.colorChartBar : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  });

  const getCellFill = (entry: WaterfallEntry): string => {
    if (entry.isStart)    return theme.colorTextMuted;   // 비교기간 → 회색
    if (entry.isTotal)    return theme.colorAccent;      // 기준기간 → accent
    if (entry.posVal > 0) return theme.colorDeltaPos;   // 증가 → 녹색
    return 'transparent';
  };

  if (loading) {
    return (
      <div className="card">
        {title && (
          <div className="section-header" style={{ marginBottom: 8 }}>
            <span className="section-title">{title}</span>
          </div>
        )}
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  // 범례 공통 요소
  const legendItems = [
    { color: theme.colorTextMuted,  label: '비교기간 합계', opacity: 0.55 },
    { color: theme.colorDeltaPos,   label: '기여 증가',     opacity: 0.88 },
    { color: theme.colorDeltaNeg,   label: '기여 감소',     opacity: 0.85 },
    { color: theme.colorAccent,     label: '기준기간 합계', opacity: 0.88 },
  ];

  return (
    <div className="card">
      {/* 헤더: 제목 + 버튼 */}
      <div className="section-header" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        {title && <span className="section-title" style={{ flexShrink: 0 }}>{title}</span>}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {hierarchyTabs && hierarchyTabs.length > 0 && (
            <>
              {hierarchyTabs.map(tab => (
                <button key={tab.key} onClick={() => onHierarchyTabChange?.(tab.key)}
                  style={tabBtnStyle(activeHierarchyTab === tab.key)}>
                  {tab.label}
                </button>
              ))}
              <span style={{ width: 2, height: 18, backgroundColor: 'var(--color-border-subtle)', borderRadius: 1, opacity: 0.8, flexShrink: 0 }} />
            </>
          )}
          {METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)} style={btnStyle(metric === m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ✅ 범례: 차트 위로 이동 */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {legendItems.map(({ color, label, opacity }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, display: 'inline-block', opacity }} />
            <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 10, right: 24, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colorChartGrid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.colorTextMuted, fontSize: theme.fontSizeChartAxis }}
            axisLine={{ stroke: theme.colorChartGrid }}
            tickLine={false}
            height={18}
          />
          {/* ✅ 동적 Y축: 합계 제외 데이터 범위 기반 타이트한 도메인 */}
          <YAxis
            domain={domain}
            tick={{ fill: theme.colorTextMuted, fontSize: theme.fontSizeChartAxis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={meta.fmtFn}
            width={64}
          />
          <Tooltip content={<CustomTooltip metric={metric} />} />

          {/* 투명 스페이서 */}
          <Bar dataKey="invisible" stackId="wf" fill="transparent" stroke="none" isAnimationActive={false} />

          {/* 증가 / 합계 바 — 합계 바 내부에 날짜 표시 */}
          <Bar dataKey="posVal" stackId="wf" radius={[3, 3, 0, 0]} maxBarSize={80} isAnimationActive={false}
            label={(props: any): React.ReactElement<SVGElement> => {
              const entry: WaterfallEntry = data[props.index];
              if (!entry?.isTotal || !entry.dateLabel) return <g />;
              return <TotalBarLabel {...props} value={entry.dateLabel} fontSize={theme.fontSizeChartAxis} />;
            }}
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={getCellFill(entry)} fillOpacity={entry.isStart ? 0.55 : 0.88} />
            ))}
          </Bar>

          {/* 감소 바 */}
          <Bar dataKey="negVal" stackId="wf"
            fill={theme.colorDeltaNeg} fillOpacity={0.85}
            radius={[3, 3, 0, 0]} maxBarSize={80} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
