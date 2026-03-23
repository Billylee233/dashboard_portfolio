'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import { filterBtnStyle } from '@/lib/buttonStyles';

type ColKey = 'applicant' | 'cpa' | 'imp' | 'click' | 'ctr' | 'cost' | 'cpc' | 'cvr';
type ChartType = 'bar' | 'line';

const COLS: { key: ColKey; label: string; fmtFn: (v: number) => string }[] = [
  { key: 'imp',       label: 'IMP',   fmtFn: v => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmtFn: v => fmt.number(v) },
  { key: 'ctr',       label: 'CTR',   fmtFn: v => fmt.pct(v)    },
  { key: 'cost',      label: 'COST',  fmtFn: v => fmt.cost(v)   },
  { key: 'cpc',       label: 'CPC',   fmtFn: v => fmt.cost(v)   },
  { key: 'applicant', label: 'APP',   fmtFn: v => fmt.number(v) },
  { key: 'cpa',       label: 'CPA',   fmtFn: v => fmt.cost(v)   },
  { key: 'cvr',       label: 'CVR',   fmtFn: v => fmt.pct(v)    },
];

// BAR는 항상 yAxisId="left", LINE은 항상 yAxisId="right"
// → 어떤 컬럼 조합이어도 항상 독립된 Y축 2개 사용
const BAR_YAXIS  = 'left'  as const;
const LINE_YAXIS = 'right' as const;

function hexToRgb(hex: string) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [14, 165, 233];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

const CustomTooltip = ({ active, payload, label, fmtMap }: any) => {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload ?? {};
  const fullDate = data.fullDate ?? label;
  const prevDate = data.prevDate ?? null;

  // sel 항목과 prior 항목 분리
  const selItems  = payload.filter((p: any) => !p.dataKey.startsWith('prev_'));
  const prevItems = payload.filter((p: any) => p.dataKey.startsWith('prev_'));

  const rowStyle = { display:'flex', alignItems:'center', gap:6, marginBottom:3 };
  const dotStyle = (color: string) => ({ width:8, height:8, borderRadius:'50%', backgroundColor:color, flexShrink:0 });
  const labelStyle = { color:'var(--color-text-muted)' };
  const valStyle = { color:'var(--color-text-primary)', fontWeight:700 };
  const dateStyle = { color:'var(--color-text-tertiary)', fontWeight:600, marginBottom:4, marginTop:4, fontSize:'var(--font-chart-axis)' };

  return (
    <div style={{ backgroundColor:'var(--tooltip-bg)', border:'1px solid var(--tooltip-border)', borderRadius:'var(--tooltip-radius)', padding:'var(--tooltip-padding)', boxShadow:'var(--tooltip-shadow)', fontSize:'var(--font-chart-axis)', minWidth:180 }}>
      <p style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-tertiary)', fontWeight:700, marginBottom:6 }}>{fullDate}</p>
      {selItems.map((p: any) => (
        <div key={p.dataKey} style={rowStyle}>
          <span style={dotStyle(p.color)} />
          <span style={labelStyle}>{p.name}:</span>
          <span style={valStyle}>{fmtMap?.[p.dataKey]?.(p.value) ?? p.value}</span>
        </div>
      ))}
      {prevItems.length > 0 && prevDate && (
        <>
          <p style={dateStyle}>{prevDate}</p>
          {prevItems.map((p: any) => (
            <div key={p.dataKey} style={rowStyle}>
              <span style={dotStyle(p.color)} />
              <span style={labelStyle}>{p.name}:</span>
              <span style={valStyle}>{fmtMap?.[p.dataKey]?.(p.value) ?? p.value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// BAR/LINE 컬럼 선택: 활성 색상은 차트 컬러, 비선택은 transparent
const colBtnStyle = (active: boolean, activeColor: string) => ({
  padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600,
  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
  backgroundColor: active ? activeColor : 'transparent',
  color: active ? '#fff' : 'var(--color-text-secondary)',
});

export function TrendChart({ data, compareData, loading, title }: { data: any[]; compareData?: any[]; loading?: boolean; title?: React.ReactNode }) {
  const theme = useTheme();
  const [barCol,   setBarCol]   = useState<ColKey>('applicant');
  const [lineCol,  setLineCol]  = useState<ColKey>('cpa');
  const [barType,  setBarType]  = useState<ChartType>('bar');

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const barMeta  = COLS.find(c => c.key === barCol)!;
  const lineMeta = COLS.find(c => c.key === lineCol)!;
  const fmtMap   = {
    ...Object.fromEntries(COLS.map(c => [c.key, c.fmtFn])),
    prev_bar:  barMeta.fmtFn,   // 비교기간 bar → 선택 bar와 동일 포맷
    prev_line: lineMeta.fmtFn,  // 비교기간 line → 선택 line과 동일 포맷
  };

  if (loading) {
    return (
      <div className="card">
        {title && <div className="section-header" style={{marginBottom:8}}><span className="section-title">{title}</span></div>}
        <div className="skeleton" style={{ height: 256 }} />
      </div>
    );
  }

  // 포지션 매칭: 선택 i번째 ↔ 비교 i번째
  const cmpArr = compareData ?? [];
  // BQ date가 객체({value:...}) 또는 문자열 모두 처리
  const toStr = (v: any): string => {
    if (!v) return '';
    if (typeof v === 'object' && v.value) return String(v.value).slice(0, 10);
    return String(v).slice(0, 10);
  };
  const formatted = data.map((d, i) => {
    const p = cmpArr[i];
    const dateStr = toStr(d.date);
    return {
      ...d,
      label:    dateStr.slice(5),
      fullDate: dateStr,
      prevDate: p ? toStr(p.date) : null,
      prev_bar:  p ? (p[barCol]  ?? null) : null,
      prev_line: p ? (p[lineCol] ?? null) : null,
    };
  });

  const typeBtnStyle = (active: boolean) => ({
    padding:'3px 10px', borderRadius:6, fontSize:theme.fontSizeChartAxis, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
    backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface-1)',
    color: active ? '#fff' : 'var(--color-text-muted)',
    border: active ? '1px solid transparent' : '1px solid var(--color-border-subtle)',
  });

  return (
    <div className="card">
      {/* 제목 + 버튼 한 줄 */}
      <div className="section-header" style={{ marginBottom:18, flexWrap:'wrap', gap:6 }}>
        {title && <span className="section-title" style={{flexShrink:0}}>{title}</span>}
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginLeft:'auto' }}>
          {/* C. BAR 컬럼 선택 — colorBar */}
          <span style={{ fontSize:'var(--font-label)', color:theme.colorChartBar, fontWeight:800, flexShrink:0 }}>BAR</span>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {COLS.map(c => (
              <button key={c.key}
                style={colBtnStyle(barCol===c.key, theme.colorChartBar)}
                onClick={() => setBarCol(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          {/* 구분선 */}
          <span style={{ width:2, height:18, backgroundColor:'var(--color-border-subtle)', borderRadius:1, opacity:0.8, flexShrink:0 }} />
          {/* D. LINE 컬럼 선택 — colorCpaLine 주황 */}
          <span style={{ fontSize:'var(--font-label)', color:theme.colorChartLine, fontWeight:800, flexShrink:0 }}>LINE</span>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {COLS.map(c => (
              <button key={c.key}
                style={colBtnStyle(lineCol===c.key, theme.colorChartLine)}
                onClick={() => setLineCol(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={formatted} margin={isMobile ? { top:10, right:4, bottom:0, left:4 } : { top:10, right:24, bottom:0, left:10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colorChartGrid} vertical={false} />

          <XAxis dataKey="label"
            tick={{ fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }}
            axisLine={{ stroke:theme.colorChartGrid }} tickLine={false}
            height={18} />

          {/* BAR 전용 Y축 — 항상 left */}
          <YAxis
            yAxisId={BAR_YAXIS}
            orientation="left"
            tick={isMobile ? false : { fill:theme.colorChartBar, fontSize:theme.fontSizeChartAxis }}
            axisLine={false} tickLine={false}
            tickFormatter={isMobile ? () => '' : barMeta.fmtFn}
            width={isMobile ? 0 : 60}
          />

          {/* LINE 전용 Y축 — 항상 right */}
          <YAxis
            yAxisId={LINE_YAXIS}
            orientation="right"
            tick={isMobile ? false : { fill:theme.colorChartLine, fontSize:theme.fontSizeChartAxis }}
            axisLine={false} tickLine={false}
            tickFormatter={isMobile ? () => '' : lineMeta.fmtFn}
            width={isMobile ? 0 : 60}
          />

          <Tooltip content={<CustomTooltip fmtMap={fmtMap} />} />
          <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize:`${theme.fontSizeChartAxis}px`, color:theme.colorTextMuted, paddingBottom:'8px' }} />

          {/* BAR 시리즈 — 항상 yAxisId="left" */}
          {barType === 'bar'
            ? <Bar yAxisId={BAR_YAXIS} dataKey={barMeta.key} name={barMeta.label}
                fill={theme.colorChartBar} fillOpacity={0.85}
                radius={[3,3,0,0]} maxBarSize={Math.floor(theme.barMaxWidth * 1.3)} />
            : <Line yAxisId={BAR_YAXIS} type="monotone" dataKey={barMeta.key} name={barMeta.label}
                stroke={theme.colorChartBar} strokeWidth={2.5} dot={false}
                activeDot={{ r:4, fill:theme.colorChartBar }} />
          }

          {/* LINE 시리즈 — 항상 yAxisId="right" */}
          <Line yAxisId={LINE_YAXIS} type="monotone" dataKey={lineMeta.key} name={lineMeta.label}
            stroke={theme.colorChartLine} strokeWidth={2.5} dot={false}
            activeDot={{ r:4, fill:theme.colorChartLine }} />

          {/* 비교기간 BAR (prev_bar) */}
          {cmpArr.length > 0 && (barType === 'bar'
            ? <Bar yAxisId={BAR_YAXIS} dataKey="prev_bar" name={`비교 ${barMeta.label}`}
                fill={theme.colorChartBar + '55'} fillOpacity={0.7}
                radius={[2,2,0,0]} maxBarSize={Math.floor(theme.barMaxWidth * 1.3)} />
            : <Line yAxisId={BAR_YAXIS} type="monotone" dataKey="prev_bar" name={`비교 ${barMeta.label}`}
                stroke={theme.colorChartBar + '77'} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} />
          )}

          {/* 비교기간 LINE (prev_line) */}
          {cmpArr.length > 0 && (
            <Line yAxisId={LINE_YAXIS} type="monotone" dataKey="prev_line" name={`비교 ${lineMeta.label}`}
              stroke={theme.colorChartLine + '77'} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>


    </div>
  );
}
