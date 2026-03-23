'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';

type ColKey = 'applicant' | 'cpa' | 'imp' | 'click' | 'ctr' | 'cost' | 'cpc' | 'cvr';

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

function hexToRgb(hex: string): [number,number,number] {
  const h = (hex || '').replace('#','');
  if (h.length < 6) return [14,165,233];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

interface Props {
  selectedData: any[];
  compareData:  any[];
  selectedRange: { start: string; end: string };
  compareRange:  { start: string; end: string };
  loading?: boolean;
}

// 툴팁: selectedDate / compareDate 둘 다 실제 날짜 표시
const CustomTooltip = ({ active, payload, fmtFn }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{ backgroundColor:'var(--tooltip-bg)', border:'1px solid var(--tooltip-border)', borderRadius:'var(--tooltip-radius)', padding:'var(--tooltip-padding)', boxShadow:'var(--tooltip-shadow)', fontSize:'var(--font-chart-axis)', minWidth:200 }}>
      {payload.map((p: any) => {
        if (p.value === null || p.value === undefined) return null;
        const date = p.dataKey === 'selected' ? p.payload.selectedDate : p.payload.compareDate;
        return (
          <div key={p.dataKey} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:p.color, flexShrink:0 }} />
            <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-muted)', minWidth:100 }}>{date ?? '-'}:</span>
            <span style={{ fontSize:'var(--font-chart-axis)', color:'var(--color-text-primary)', fontWeight:700 }}>{fmtFn(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
};

export function PeriodComparisonChart({ selectedData, compareData, selectedRange, compareRange, loading, title }: Props & { title?: React.ReactNode }) {
  const theme = useTheme();
  const [col, setCol] = useState<ColKey>('applicant');
  const colMeta = COLS.find(c => c.key === col)!;

  const [r1,g1,b1] = hexToRgb(theme.colorChartBar);

  // X축 = 선택기간 날짜 기준, 비교기간은 같은 인덱스로 매핑
  const maxLen = Math.max(selectedData.length, compareData.length);
  const merged = Array.from({ length: maxLen }, (_, i) => ({
    // X축 레이블: 선택기간 날짜 (MM-DD)
    dateLabel:    selectedData[i]?.date?.slice(5) ?? `D${i+1}`,
    // 툴팁용 전체 날짜
    selectedDate: selectedData[i]?.date ?? null,
    compareDate:  compareData[i]?.date  ?? null,
    selected: selectedData[i]?.[col] ?? null,
    compare:  compareData[i]?.[col]  ?? null,
  }));

  // Daily Performance 스타일 통일
  const colBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  });

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
        {title && <div className="section-header" style={{marginBottom:8}}><span className="section-title">{title}</span></div>}
        <div className="skeleton" style={{ height: 256 }} />
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:8 }}>
        {title && <span className="section-title">{title}</span>}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {COLS.map(c => (
            <button key={c.key} style={colBtnStyle(col===c.key)} onClick={() => setCol(c.key)}>{c.label}</button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={merged} margin={isMobile ? { top:10, right:4, bottom:0, left:4 } : { top:10, right:20, bottom:0, left:10 }}>
          <defs>
            <linearGradient id="gradSel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={`rgba(${r1},${g1},${b1},1)`} stopOpacity={0.3} />
              <stop offset="95%" stopColor={`rgba(${r1},${g1},${b1},1)`} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCmp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={`rgba(${r1},${g1},${b1},0.5)`} stopOpacity={0.15} />
              <stop offset="95%" stopColor={`rgba(${r1},${g1},${b1},0.5)`} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colorChartGrid} vertical={false} />
          {/* X축: 선택기간 날짜로 표시 */}
          <XAxis
            dataKey="dateLabel"
            tick={{ fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }}
            axisLine={{ stroke:theme.colorChartGrid }} tickLine={false}
            height={18}
          />
          <YAxis
            tick={isMobile ? false : { fill:theme.colorTextMuted, fontSize:theme.fontSizeChartAxis }}
            axisLine={false} tickLine={false}
            tickFormatter={isMobile ? () => '' : colMeta.fmtFn}
            width={isMobile ? 0 : undefined}
          />
          <Tooltip content={<CustomTooltip fmtFn={colMeta.fmtFn} />} />
          <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize:`${theme.fontSizeChartAxis}px`, color:theme.colorTextMuted, paddingBottom:'8px' }} />
          <Area type="monotone" dataKey="selected" name="기준"
            stroke={theme.colorChartBar} strokeWidth={2}
            fill="url(#gradSel)" dot={false} activeDot={{ r:4, fill:theme.colorChartBar }} />
          <Area type="monotone" dataKey="compare" name="비교"
            stroke={`rgba(${r1},${g1},${b1},0.5)`} strokeWidth={2} strokeDasharray="5 3"
            fill="url(#gradCmp)" dot={false} activeDot={{ r:3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
