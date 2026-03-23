'use client';

import React, { useState, useMemo } from 'react';
import { fmt, deltaStyle } from '@/lib/calculations';
import type { SAKeywordMetrics } from '@/lib/types';
import type { MetricsRow } from '@/lib/types';
import { thStyle, COL_W } from '@/lib/tableStyles';

// ─── 컬럼 정의 — ChannelComparisonTable과 동일 순서 ──────────────────────────
const COLS: { key: keyof MetricsRow; label: string; fmtFn: (v: number) => string; invert?: boolean }[] = [
  { key: 'imp',       label: 'IMP',   fmtFn: v => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmtFn: v => fmt.number(v) },
  { key: 'ctr',       label: 'CTR',   fmtFn: v => fmt.pct(v) },
  { key: 'cost',      label: 'COST',  fmtFn: v => fmt.cost(v) },
  { key: 'cpc',       label: 'CPC',   fmtFn: v => fmt.cost(v),   invert: true },
  { key: 'applicant', label: 'APP',   fmtFn: v => fmt.number(v) },
  { key: 'cpa',       label: 'CPA',   fmtFn: v => fmt.cost(v),   invert: true },
  { key: 'cvr',       label: 'CVR',   fmtFn: v => fmt.pct(v) },
];

type SortKey = keyof MetricsRow;

interface Props {
  rows:    SAKeywordMetrics[];
  loading: boolean;
}

export function KeywordLeaderboard({ rows, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('applicant');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a.selected as any)[sortKey] ?? 0;
      const bv = (b.selected as any)[sortKey] ?? 0;
      return sortAsc ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-body)' }}>
        데이터가 없습니다
      </div>
    );
  }

  // IMP 기준/비교 모두 0인 키워드 제외
  const filtered = sorted.filter(r => !(r.selected.imp === 0 && r.compared.imp === 0));

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480 }}>
      <table className="data-table" style={{ position: 'relative' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'var(--color-surface-1)' }}>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left',  width: COL_W.keyword, position: 'sticky', top: 0 }}>KEYWORD</th>
            <th style={{ ...thStyle, textAlign: 'right', width: COL_W.period,  position: 'sticky', top: 0 }}>PERIOD</th>
            {COLS.map(c => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                style={{
                  ...thStyle,
                  position: 'sticky',
                  top: 0,
                  cursor: 'pointer',
                  userSelect: 'none',
                  color: sortKey === c.key ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              >
                {c.label}{sortKey === c.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, rowIdx) => (
            <React.Fragment key={row.keyword}>
              {/* 기준 기간 */}
              <tr
                style={{
                  borderTop: '2px solid var(--color-border-subtle)',
                  backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)',
                }}
              >
                <td rowSpan={4} style={{ verticalAlign: 'top', paddingTop: 10, fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 'var(--font-table-body)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.keyword}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: 'var(--font-table-body)' }}>기준 기간</td>
                {COLS.map(c => (
                  <td key={c.key} style={{ color: c.key === 'applicant' ? 'var(--color-accent)' : undefined, fontWeight: c.key === 'applicant' ? 700 : undefined }}>
                    {c.fmtFn(row.selected[c.key])}
                  </td>
                ))}
              </tr>
              {/* 비교 기간 */}
              <tr style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>비교 기간</td>
                {COLS.map(c => (
                  <td key={c.key} style={{ color: 'var(--color-text-muted)' }}>
                    {c.fmtFn(row.compared[c.key])}
                  </td>
                ))}
              </tr>
              {/* Δ */}
              <tr style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>Δ</td>
                {COLS.map(c => {
                  const v = row.delta[c.key];
                  return (
                    <td key={c.key} style={deltaStyle(v, c.invert)}>
                      {v >= 0 ? '+' : ''}{c.fmtFn(v)}
                    </td>
                  );
                })}
              </tr>
              {/* Δ% */}
              <tr style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 3%, transparent)' }}>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)' }}>Δ%</td>
                {COLS.map(c => {
                  const v = row.deltaPercent[c.key];
                  return (
                    <td key={c.key} style={{ fontWeight: 600, ...deltaStyle(v, c.invert) }}>
                      {fmt.deltaPct(v)}
                    </td>
                  );
                })}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
