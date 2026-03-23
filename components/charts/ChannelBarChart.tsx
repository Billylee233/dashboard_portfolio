'use client';

import { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/components/ui/ThemeEditor';
import { fmt } from '@/lib/calculations';
import EmptyState from '@/components/ui/EmptyState';

// ─── 지표 옵션 ────────────────────────────────────────────────────────────────
export const BAR_OPTIONS = [
  { value:'app',   prevKey:'prevApp',   label:'Applicants', fmtFn:(v:number)=>fmt.number(v) },
  { value:'click', prevKey:'prevClick', label:'Clicks',     fmtFn:(v:number)=>fmt.number(v) },
  { value:'cost',  prevKey:'prevCost',  label:'Cost',       fmtFn:(v:number)=>fmt.cost(v)   },
  { value:'imp',   prevKey:'prevImp',   label:'Impressions',fmtFn:(v:number)=>fmt.number(v) },
];
export const LINE_OPTIONS = [
  { value:'cpa', prevKey:'prevCpa', label:'CPA', fmtFn:(v:number)=>fmt.cost(v) },
  { value:'cpc', prevKey:'prevCpc', label:'CPC', fmtFn:(v:number)=>fmt.cost(v) },
  { value:'cvr', prevKey:'prevCvr', label:'CVR', fmtFn:(v:number)=>fmt.pct(v)  },
  { value:'ctr', prevKey:'prevCtr', label:'CTR', fmtFn:(v:number)=>fmt.pct(v)  },
];

// ─── 로딩 스켈레톤 ────────────────────────────────────────────────────────────
function Skeleton({ h = 360 }: { h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 8, background: 'var(--color-surface-2)',
      animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />
  );
}

// ─── 툴팁 ─────────────────────────────────────────────────────────────────────
function OverviewTooltip({ active, payload, label }: any) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;

  const data        = payload[0]?.payload ?? {};
  const channelName = data.channel ?? label;
  const selDate     = data.selDate  ?? null;
  const prevDate    = data.prevDate ?? null;
  const selItems    = payload.filter((p: any) => !String(p.dataKey).startsWith('prev'));
  const prevItems   = payload.filter((p: any) =>  String(p.dataKey).startsWith('prev'));

  const fmtVal = (name: string, value: number) => {
    const n = String(name);
    if (n.includes('CPA') || n.includes('CPC') || n.includes('Cost')) return fmt.cost(value);
    if (n.includes('CTR') || n.includes('CVR')) return fmt.pct(value);
    return fmt.number(value);
  };

  const rowEl = (p: any, i: number) => {
    if (p.value === null || p.value === undefined) return null;
    return (
      <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
        <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:p.color, flexShrink:0 }} />
        <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-muted)' }}>{p.name}:</span>
        <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-primary)', fontWeight:700 }}>
          {fmtVal(p.name, p.value)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ backgroundColor:'var(--tooltip-bg)', border:'1px solid var(--tooltip-border)',
      borderRadius:'var(--tooltip-radius)', padding:'var(--tooltip-padding)',
      boxShadow:'var(--tooltip-shadow)', fontSize:'var(--font-chart-axis)', minWidth:180 }}>
      <p style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-primary)', fontWeight:700, marginBottom:4 }}>{channelName}</p>
      {selDate && <p style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-tertiary)', fontWeight:600, marginBottom:4 }}>{selDate}</p>}
      {selItems.map((p: any, i: number) => rowEl(p, i))}
      {prevItems.length > 0 && (
        <>
          {prevDate && <p style={{ color:'var(--color-text-tertiary)', fontWeight:600, marginBottom:4, marginTop:6, fontSize:'var(--font-chart-axis)' }}>{prevDate}</p>}
          {prevItems.map((p: any, i: number) => rowEl(p, i))}
        </>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function ChannelBarChart({ data, loading, barKey, lineKey }: {
  data: any[]; loading: boolean; barKey: string; lineKey: string;
}) {
  const theme = useTheme();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const barOpt   = BAR_OPTIONS.find(o => o.value === barKey)  ?? BAR_OPTIONS[0];
  const lineOpt  = LINE_OPTIONS.find(o => o.value === lineKey) ?? LINE_OPTIONS[0];
  const barColor = theme.colorChartBar;
  const prevBarColor = barColor + '55';
  const lineColor    = theme.colorChartLine;
  const axis = { fill:'var(--color-text-muted)', fontSize:theme.fontSizeChartAxis };

  if (loading) return <Skeleton h={360} />;
  if (!data.length) return <EmptyState icon="📭" title="선택 기간 데이터 없음" style={{ height: 360 }} />;

  return (
    <>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={data}
          margin={isMobile ? { top:10, right:4, bottom:0, left:4 } : { top:10, right:10, bottom:0, left:5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
          <XAxis dataKey="channel" tick={axis} axisLine={false} tickLine={false}
            angle={-35} textAnchor="end" interval={0} height={52} />
          <YAxis yAxisId="bar" tick={isMobile ? false : axis} axisLine={false} tickLine={false}
            tickFormatter={isMobile ? () => '' : v => barOpt.fmtFn(v)} width={isMobile ? 0 : 48} />
          <YAxis yAxisId="line" orientation="right" tick={isMobile ? false : axis} axisLine={false} tickLine={false}
            tickFormatter={isMobile ? () => '' : v => lineOpt.fmtFn(v)} width={isMobile ? 0 : 52} />
          <Tooltip content={<OverviewTooltip />} />
          <Legend verticalAlign="top" align="center"
            wrapperStyle={{ fontSize:`${theme.fontSizeChartAxis}px`, paddingBottom:'6px' }} />
          <Bar yAxisId="bar" dataKey={barOpt.value}   name={`기준 ${barOpt.label}`}
            fill={barColor}     maxBarSize={Math.floor(theme.barMaxWidth * 1.4)} radius={[3,3,0,0]} />
          <Bar yAxisId="bar" dataKey={barOpt.prevKey} name={`비교 ${barOpt.label}`}
            fill={prevBarColor} maxBarSize={Math.floor(theme.barMaxWidth * 1.4)} radius={[2,2,0,0]} />
          <Line yAxisId="line" type="linear" dataKey={lineOpt.value}   name={`기준 ${lineOpt.label}`}
            stroke={lineColor} strokeWidth={2} dot={{ fill:lineColor, r:3, strokeWidth:0 }} connectNulls />
          <Line yAxisId="line" type="linear" dataKey={lineOpt.prevKey} name={`비교 ${lineOpt.label}`}
            stroke={lineColor + '77'} strokeWidth={1.5} strokeDasharray="4 4"
            dot={{ fill:lineColor + '77', r:2, strokeWidth:0 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
