'use client';
import React from 'react';

import { fmt, deltaStyle } from '@/lib/calculations';
import type { MetricsRow } from '@/lib/types';
import EmptyState from '@/components/ui/EmptyState';
import { thStyle, COL_W } from '@/lib/tableStyles';

interface ChannelRow {
  media: string;
  selected: MetricsRow;
  compared: MetricsRow;
  delta: MetricsRow;
  deltaPercent: MetricsRow;
  isCrisis?: boolean;
}

const COLS: { key: keyof MetricsRow; label: string; fmt: (v: number) => string; invert?: boolean }[] = [
  { key: 'imp',       label: 'IMP',   fmt: v => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmt: v => fmt.number(v) },
  { key: 'ctr',       label: 'CTR',   fmt: v => fmt.pct(v) },
  { key: 'cost',      label: 'COST',  fmt: v => fmt.cost(v) },
  { key: 'cpc',       label: 'CPC',   fmt: v => fmt.cost(v), invert: true },
  { key: 'applicant', label: 'APP',   fmt: v => fmt.number(v) },
  { key: 'cpa',       label: 'CPA',   fmt: v => fmt.cost(v), invert: true },
  { key: 'cvr',       label: 'CVR',   fmt: v => fmt.pct(v) },
];

const ROW_LABELS = ['기준 기간', '비교 기간', 'Δ', 'Δ%'];

export function ChannelComparisonTable({ data, onChannelClick, loading, title }: {
  data: ChannelRow[]; onChannelClick?: (media: string) => void; loading?: boolean; title?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="card">
        {title
          ? <div className="section-header"><span className="section-title">{title}</span></div>
          : <div className="card-title">Channel Performance &amp; Same-Day Comparison</div>}
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32, borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="card"><EmptyState icon="📋" title="데이터 없음" /></div>
    );
  }

  // IMP 선택+비교 모두 0인 채널 필터링
  const filtered = data.filter(row => !(row.selected.imp === 0 && row.compared.imp === 0));

  return (
    <div className="card">
      {title
        ? <div className="section-header"><span className="section-title">{title}</span></div>
        : <div className="card-title">📊 Channel Performance &amp; Same-Day Comparison</div>}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left',  width: COL_W.channel }}>CHANNEL</th>
              <th style={{ ...thStyle, textAlign: 'right', width: COL_W.period  }}>PERIOD</th>
              {COLS.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rowIdx) => (
              <>
                {/* 선택 기간 */}
                <tr key={`${row.media}-sel`}
                  style={{ borderTop: `2px solid var(--color-border-subtle)`, backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                  <td rowSpan={4} style={{ verticalAlign: 'top', paddingTop: 10 }}>
                    <button onClick={() => onChannelClick?.(row.media)}
                      style={{ fontWeight: 700, color: 'var(--color-accent)', fontSize: 'var(--font-table-body)', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', padding: 0 }}>
                      {row.media}
                      {row.isCrisis && <span style={{ marginLeft: 4, fontSize: 'var(--font-body)', color: 'var(--color-delta-neg)' }}>⚠️</span>}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: 'var(--font-table-body)' }}>기준 기간</td>
                  {COLS.map(c => <td key={c.key}>{c.fmt(row.selected[c.key])}</td>)}
                </tr>
                {/* 비교 기간 */}
                <tr key={`${row.media}-cmp`} style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>비교 기간</td>
                  {COLS.map(c => <td key={c.key} style={{ color: 'var(--color-text-muted)' }}>{c.fmt(row.compared[c.key])}</td>)}
                </tr>
                {/* Delta */}
                <tr key={`${row.media}-delta`} style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>Δ</td>
                  {COLS.map(c => {
                    const v = row.delta[c.key];
                    return <td key={c.key} style={deltaStyle(v, c.invert)}>{v >= 0 ? '+' : ''}{c.fmt(v)}</td>;
                  })}
                </tr>
                {/* Delta% */}
                <tr key={`${row.media}-dpct`} style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>Δ%</td>
                  {COLS.map(c => {
                    const v = row.deltaPercent[c.key];
                    return <td key={c.key} style={{ fontWeight: 600, ...deltaStyle(v, c.invert) }}>{fmt.deltaPct(v)}</td>;
                  })}
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
