'use client';

import { useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/components/ui/ThemeEditor';
import { getBubbleColor } from '@/lib/channelColors';
import { fmt } from '@/lib/calculations';

// ─── 로딩 스켈레톤 ────────────────────────────────────────────────────────────
function Skeleton({ h = 360 }: { h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 8, background: 'var(--color-surface-2)',
      animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function OverviewBubbleChart({ data, loading, onChannelClick }: {
  data: any[];
  loading: boolean;
  onChannelClick?: (channel: string) => void;
}) {
  const theme = useTheme();
  const axis  = { fill:'var(--color-text-muted)', fontSize:theme.fontSizeChartAxis };
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (loading) return <Skeleton h={360} />;

  const abbreviate = (name: string) => {
    if (name.length <= 8) return name;
    const parts = name.split('_');
    if (parts.length >= 2) return parts[0].slice(0, 5) + '_' + parts[parts.length - 1].slice(0, 4);
    return name.slice(0, 9);
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const r     = payload.r;
    const color = getBubbleColor(payload.channel);
    const fontSize = Math.min(10, Math.max(6, Math.floor(r * 0.3)));
    return (
      <g>
        <circle cx={cx} cy={cy} r={r}
          fill={color} fillOpacity={0.75} stroke={color} strokeWidth={1.5}
          style={{ cursor: onChannelClick ? 'pointer' : 'default' }}
          onClick={() => onChannelClick?.(payload.channel)} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize={fontSize} fontWeight={700} style={{ pointerEvents:'none' }}>
          {abbreviate(payload.channel)}
        </text>
      </g>
    );
  };

  return (
    <>
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart
          margin={isMobile ? { top:10, right:4, bottom:20, left:4 } : { top:10, right:10, bottom:20, left:0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
          <XAxis type="number" dataKey="x" name="CPA"
            tick={axis} axisLine={false} tickLine={false}
            tickFormatter={v => `₩${fmt.number(v)}`}
            label={{ value:'CPA ← lower is better', position:'insideBottom', offset:-14,
              fill:'var(--color-text-muted)', fontSize:theme.fontSizeChartAxis }} />
          <YAxis type="number" dataKey="y" name="Applicants"
            tick={isMobile ? false : axis} axisLine={false} tickLine={false}
            width={isMobile ? 0 : 52} />
          <ZAxis type="number" dataKey="r" range={[1, 1]} />
          <Tooltip cursor={{ strokeDasharray:'3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d     = payload[0]?.payload;
              const color = getBubbleColor(d?.channel);
              return (
                <div style={{ borderRadius:10, padding:'10px 14px',
                  background:'var(--color-surface-1)', border:`1px solid ${color}`,
                  fontSize:theme.fontSizeChartAxis, boxShadow:'var(--shadow-md)' }}>
                  <div style={{ fontWeight:700, color, marginBottom:6 }}>{d?.channel}</div>
                  <div style={{ color:'var(--color-text-tertiary)' }}>
                    Applicants: <b style={{ color:'var(--color-text-primary)' }}>{fmt.number(d?.y)}</b>
                  </div>
                  <div style={{ color:'var(--color-text-tertiary)' }}>
                    Cost: <b style={{ color:'var(--color-text-primary)' }}>₩{fmt.number(d?.cost ?? 0)}</b>
                  </div>
                  <div style={{ color:'var(--color-text-tertiary)' }}>
                    CPA: <b style={{ color:'var(--color-text-primary)' }}>₩{fmt.number(d?.x)}</b>
                  </div>
                </div>
              );
            }} />
          <Scatter data={data} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ marginTop:4, fontSize:theme.fontSizeChartAxis, color:'var(--color-text-muted)' }}>
        💡 Bubble size = Total Applicants · X-axis = CPA · Y-axis = Applicants
      </div>
    </>
  );
}
