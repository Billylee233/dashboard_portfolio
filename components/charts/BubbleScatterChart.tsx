'use client';
import React, { useState, useEffect } from 'react';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { bubbleSize, getQuadrantLabel, fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import type { DashboardTheme } from '@/lib/theme';
import EmptyState from '@/components/ui/EmptyState';

interface BubblePoint {
  id: string; label: string; cpa: number; cvr: number; applicant: number;
  selImp?: number; cmpImp?: number;
  trend?: 'improving' | 'stable' | 'worsening'; trendPct?: number;
}

// improving = CPA 하락 = 성과 개선 → ↑ 위
// worsening = CPA 상승 = 성과 악화 → ↓ 아래
const TREND_DIR = { improving: '↑', stable: '→', worsening: '↓' } as const;

// 4분면 색상: 모두 테마 변수 기반
function getQuadrantColor(quadrant: string, theme: DashboardTheme): string {
  switch (quadrant) {
    case '효자':     return theme.colorDeltaPos;         // 좋음 → 녹색
    case 'CVR 개선': return theme.colorChartLine;          // 주의 → 앰버/CPA 라인색
    case 'CPC 개선': return theme.colorAccent;           // 중립 → 액센트색
    case '금쪽이':   return theme.colorDeltaNeg;         // 나쁨 → 빨간색
    default:         return theme.colorTextMuted;
  }
}

function getTrendColor(trend: string, theme: DashboardTheme): string {
  if (trend === 'improving') return theme.colorDeltaPos;
  if (trend === 'worsening') return theme.colorDeltaNeg;
  return theme.colorDeltaNeutral;
}

const CustomTooltip = ({ active, payload, theme }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as BubblePoint;
  if (!d) return null;
  const t = d.trend ?? 'stable';
  const trendColor = getTrendColor(t, theme);
  return (
    <div style={{ backgroundColor:'var(--tooltip-bg)', border:'1px solid var(--tooltip-border)', borderRadius:'var(--tooltip-radius)', padding:'var(--tooltip-padding)', boxShadow:'var(--tooltip-shadow)', fontSize:'var(--font-chart-axis)', minWidth:160 }}>
      <p style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-primary)', fontWeight:700, marginBottom:6 }}>{d.label}</p>
      {[['CPA', fmt.cost(d.cpa)], ['CVR', fmt.pct(d.cvr)], ['APP', fmt.number(d.applicant)]].map(([k,v]) => (
        <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:3 }}>
          <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-muted)' }}>{k}</span>
          <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-secondary)' }}>{v}</span>
        </div>
      ))}
      {d.trend && (
        <div style={{ display:'flex', justifyContent:'space-between', gap:16, paddingTop:6, borderTop:'1px solid var(--color-border-subtle)', marginTop:4 }}>
          <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-muted)' }}>APP Trend</span>
          <span style={{ fontSize:'var(--font-chart-axis)', color:trendColor, fontWeight:700 }}>
            {TREND_DIR[d.trend]} {d.trendPct !== undefined ? fmt.deltaPct(d.trendPct) : ''}
          </span>
        </div>
      )}
    </div>
  );
};

function CustomDot(props: any) {
  const { cx, cy, payload, maxApplicant, avgCpa, avgCvr, theme } = props;
  if (!cx || !cy) return null;

  // Channel Scatter와 동일한 sqrt 기반 크기 (min18, max65)
  const r = Math.max(18, Math.sqrt((payload.applicant ?? 0) / Math.max(maxApplicant, 1)) * 65);
  const trend = payload.trend ?? 'stable';
  const trendColor = getTrendColor(trend, theme);
  const quadrant = getQuadrantLabel(payload.cpa, payload.cvr, avgCpa, avgCvr);
  const qColor = getQuadrantColor(quadrant, theme);
  // 글씨: 11px 고정 균일
  const fs = 11;
  // 글자수: 버블 크기에 따라 동적 조정
  const maxChars = r < 22 ? 3 : r < 30 ? 5 : r < 45 ? 8 : r < 55 ? 11 : 14;
  const labelText = payload.label.length > maxChars ? payload.label.slice(0, maxChars) : payload.label;

  // fill: 쿼드런트 색상 반투명, stroke: 추세 색상
  return (
    <g>
      <circle cx={cx} cy={cy} r={r}
        fill={qColor + 'bb'}
        stroke={trendColor}
        strokeWidth={2.5}
        style={{ cursor:'pointer' }}
      />
      {/* 채널명 */}
      <text x={cx} y={cy + fs * 0.35} textAnchor="middle"
        fill="#fff" fontSize={fs} fontWeight={700}
        style={{ pointerEvents:'none' }}>
        {labelText}
      </text>
      {/* 추세 화살표: improving=원 위, worsening=원 아래 */}
      {trend === 'improving' && (
        <text x={cx} y={cy - r - 4} textAnchor="middle"
          fill={trendColor} fontSize={theme.fontSizeKpiLabel} fontWeight="bold">↑</text>
      )}
      {trend === 'worsening' && (
        <text x={cx} y={cy + r + 14} textAnchor="middle"
          fill={trendColor} fontSize={theme.fontSizeKpiLabel} fontWeight="bold">↓</text>
      )}
    </g>
  );
}

export function BubbleScatterChart({ data, title, onPointClick, loading, headerSlot }: {
  data: BubblePoint[]; title?: React.ReactNode; headerSlot?: React.ReactNode;
  onPointClick?: (p: BubblePoint) => void; loading?: boolean;
}) {
  const theme = useTheme();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">{title ?? 'Channel Performance Positioning'}</div>
        <div className="skeleton" style={{ height: 288 }} />
      </div>
    );
  }

  // 선택기간 IMP > 0 채널만
  const filtered = data.filter(d =>
    d.selImp !== undefined ? d.selImp > 0 : (d.applicant > 0 || d.cpa > 0)
  );

  if (!filtered.length) {
    return (
      <div className="card"><EmptyState icon="🫧" title="데이터 없음" style={{ height: 288 }} /></div>
    );
  }

  // log 스케일 호환: cpa > 0 AND cvr > 0인 데이터만 플롯
  const plottable = filtered.filter(d => d.cpa > 0 && d.cvr > 0);

  const maxApplicant = Math.max(...filtered.map(d => d.applicant), 1);

  // 평균 — 0 값 제외
  const validCpa = plottable.filter(d => d.cpa > 0);
  const avgCpa = validCpa.length ? validCpa.reduce((s,d) => s + d.cpa, 0) / validCpa.length : 0;
  const validCvr = plottable.filter(d => d.cvr > 0);
  const avgCvr = validCvr.length ? validCvr.reduce((s,d) => s + d.cvr, 0) / validCvr.length : 0;

  // X축(CPA): log 대칭 — avgCpa가 시각적 정중앙 (reversed이므로 domain은 [min, max] 정방향)
  const logAvgCpa = avgCpa > 0 ? Math.log10(avgCpa) : 0;
  const maxLogDevCpa = validCpa.length
    ? Math.max(...validCpa.map(d => Math.abs(Math.log10(d.cpa) - logAvgCpa)))
    : logAvgCpa * 0.5 || 0.5;
  const cpaMin = Math.pow(10, logAvgCpa - maxLogDevCpa);
  const cpaMax = Math.pow(10, logAvgCpa + maxLogDevCpa);

  // Y축(CVR): log 대칭 — avgCvr가 시각적 정중앙
  const logAvgCvr = avgCvr > 0 ? Math.log10(avgCvr) : 0;
  const maxLogDevCvr = validCvr.length
    ? Math.max(...validCvr.map(d => Math.abs(Math.log10(d.cvr) - logAvgCvr)))
    : Math.abs(logAvgCvr) * 0.5 || 0.5;
  const cvrMin = Math.pow(10, logAvgCvr - maxLogDevCvr);
  const cvrMax = Math.pow(10, logAvgCvr + maxLogDevCvr);

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom:18 }}>
        <span className="card-title mb-0">{title ?? '🎯 Channel Performance Positioning'}</span>
        {headerSlot && <div style={{ display:'flex', gap:4 }}>{headerSlot}</div>}
      </div>

      <div style={{ position:'relative' }}>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={isMobile ? { top:24, right:4, bottom:20, left:4 } : { top:24, right:24, bottom:20, left:16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.colorChartGrid} />
            <XAxis dataKey="cpa" type="number" name="CPA"
              scale="log" domain={[cpaMin, cpaMax]} reversed
              tick={{ fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `₩${fmt.number(Math.round(v))}`}
              label={{ value:'CPA (←낮을수록 좋음)', position:'insideBottom', offset:-14, fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }} />
            <YAxis dataKey="cvr" type="number" name="CVR"
              scale="log" domain={[cvrMin, cvrMax]}
              tick={isMobile ? false : { fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }}
              axisLine={false} tickLine={false}
              tickFormatter={isMobile ? () => '' : v => fmt.pct(v)}
              width={isMobile ? 0 : undefined}
              label={isMobile ? undefined : { value:'CVR ↑', angle:-90, position:'insideLeft', offset:10, fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }} />
            <ReferenceLine x={avgCpa} stroke={theme.colorTextMuted} strokeDasharray="5 3" strokeOpacity={0.5}
              label={{ value:`avg ₩${fmt.number(avgCpa)}`, position:'top', fill:theme.colorTextMuted, fontSize:theme.fontSizeTiny }} />
            <ReferenceLine y={avgCvr} stroke={theme.colorTextMuted} strokeDasharray="5 3" strokeOpacity={0.5}
              label={{ value:`avg ${fmt.pct(avgCvr)}`, position:'right', fill:theme.colorTextMuted, fontSize:theme.fontSizeTiny }} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Scatter data={plottable}
              shape={(props: any) => (
                <CustomDot {...props} maxApplicant={maxApplicant} avgCpa={avgCpa} avgCvr={avgCvr} theme={theme} />
              )}
              onClick={(d: any) => onPointClick?.(d)} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize:'var(--font-small)', color:'var(--color-text-muted)', marginTop:4 }}>
        ↑ 개선 · → 유지 · ↓ 악화 (APP Trend) | 원 크기 = 지원자 수
      </p>
    </div>
  );
}
