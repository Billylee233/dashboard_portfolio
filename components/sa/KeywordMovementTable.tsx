'use client';

import React, { useMemo } from 'react';
import { fmt, deltaStyle } from '@/lib/calculations';
import type { SAKeywordMetrics } from '@/lib/types';
import { thStyle, tdStyle, rowBg, COL_W } from '@/lib/tableStyles';

// ─── 원인 지표 정의 ───────────────────────────────────────────────────────────
const CAUSE_COLS: { key: 'click' | 'cost' | 'cpc' | 'cvr'; label: string; invert?: boolean }[] = [
  { key: 'click', label: 'CLICK' },
  { key: 'cost',  label: 'COST'  },
  { key: 'cpc',   label: 'CPC',  invert: true },
  { key: 'cvr',   label: 'CVR'   },
];

const THRESHOLD = 0.05;

function getArrow(delta: number): '↑' | '↓' | '→' {
  if (delta > THRESHOLD)  return '↑';
  if (delta < -THRESHOLD) return '↓';
  return '→';
}

function causeStyle(delta: number, invert = false): React.CSSProperties {
  const arrow = getArrow(delta);
  if (arrow === '→') return { color: 'var(--color-delta-neutral)' };
  return deltaStyle(delta, invert);
}

// ─── NEW / OUT 뱃지 ───────────────────────────────────────────────────────────
function DeltaPctCell({ deltaApp, deltaAppPct, cmpApp }: {
  deltaApp: number; deltaAppPct: number; cmpApp: number;
}) {
  // 비교기간 APP = 0 → NEW
  if (deltaApp > 0 && cmpApp === 0) {
    return (
      <span style={{
        padding: '1px 6px', borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-tiny)', fontWeight: 700,
        backgroundColor: 'color-mix(in srgb, var(--color-delta-pos) 15%, transparent)',
        color: 'var(--color-delta-pos)',
        border: '1px solid color-mix(in srgb, var(--color-delta-pos) 30%, transparent)',
      }}>NEW</span>
    );
  }
  // 기준기간 APP = 0 → OUT
  if (deltaApp < 0 && (cmpApp + deltaApp) === 0) {
    return (
      <span style={{
        padding: '1px 6px', borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-tiny)', fontWeight: 700,
        backgroundColor: 'color-mix(in srgb, var(--color-delta-neg) 15%, transparent)',
        color: 'var(--color-delta-neg)',
        border: '1px solid color-mix(in srgb, var(--color-delta-neg) 30%, transparent)',
      }}>OUT</span>
    );
  }
  return (
    <span style={{ fontWeight: 700, ...deltaStyle(deltaAppPct) }}>
      {fmt.deltaPct(deltaAppPct)}
    </span>
  );
}

interface Props {
  rows:     SAKeywordMetrics[];
  loading:  boolean;
  dayCount: number;
  topN?:    number;
}

export function KeywordMovementTable({ rows, loading, dayCount, topN = 10 }: Props) {
  const isAvg = dayCount > 1;

  const { rising, falling } = useMemo(() => {
    const withDelta = rows.map(r => {
      const selApp      = r.selected.applicant / dayCount;
      const cmpApp      = r.compared.applicant / dayCount;
      const deltaApp    = r.delta.applicant    / dayCount;
      const deltaAppPct = r.deltaPercent.applicant ?? 0;

      const causes = CAUSE_COLS.map(c => {
        const cmpVal = (r.compared as any)[c.key];
        const selVal = (r.selected as any)[c.key];
        const delta  = cmpVal > 0 ? (selVal - cmpVal) / cmpVal : 0;
        return { key: c.key, label: c.label, delta, invert: c.invert };
      });

      return { ...r, selApp, cmpApp, deltaApp, deltaAppPct, causes };
    });

    const sorted = [...withDelta].sort((a, b) => b.deltaApp - a.deltaApp);
    return {
      rising:  sorted.filter(r => r.deltaApp > 0).slice(0, topN),
      falling: sorted.filter(r => r.deltaApp < 0).slice(-topN).reverse(),
    };
  }, [rows, topN, dayCount]);

  if (loading) {
    return (
      <div className="cls-grid-2" style={{ gap: 'var(--space-4)' }}>
        {[0, 1].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {[...Array(6)].map((_, j) => (
              <div key={j} className="skeleton" style={{ height: 32, borderRadius: 'var(--radius-xs)' }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // 컬럼: KEYWORD | APP | Δ APP | Δ APP% | NEW/OUT | CLICK | COST | CPC | CVR
  // 총 9컬럼 균일 배분
  const Table = ({ data, type }: { data: typeof rising; type: 'rising' | 'falling' }) => {
    const color = type === 'rising' ? 'var(--color-delta-pos)' : 'var(--color-delta-neg)';
    const icon  = type === 'rising' ? '🟢' : '🔴';
    const label = type === 'rising' ? `상승 키워드 Top ${topN}` : `하락 키워드 Top ${topN}`;

    return (
      <div style={{ overflow: 'hidden', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
        <div style={{
          padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-section-title)',
          fontWeight: 700, color, backgroundColor: 'var(--color-surface-2)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          {icon} {label}
        </div>

        {data.length === 0 ? (
          <div style={{ padding: 'var(--space-5) var(--space-3)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-small)' }}>
            데이터 없음
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: COL_W.keyword_s }} /> {/* KEYWORD */}
                <col style={{ width: COL_W.app      }} /> {/* APP */}
                <col style={{ width: COL_W.delta    }} /> {/* Δ APP */}
                <col style={{ width: COL_W.deltaPct }} /> {/* Δ APP% */}
                <col style={{ width: COL_W.badge    }} /> {/* NEW/OUT */}
                <col style={{ width: COL_W.badge    }} /> {/* CLICK */}
                <col style={{ width: COL_W.badge    }} /> {/* COST */}
                <col style={{ width: COL_W.badge    }} /> {/* CPC */}
                <col style={{ width: COL_W.badge    }} /> {/* CVR */}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>KEYWORD</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>APP{isAvg ? ' (Avg)' : ''}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Δ APP{isAvg ? ' (Avg)' : ''}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Δ APP%</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}> </th>
                  {CAUSE_COLS.map(c => (
                    <th key={c.key} style={{ ...thStyle, textAlign: 'center' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr
                    key={row.keyword}
                    style={{ backgroundColor: rowBg(idx) }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.keyword}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>
                      {fmt.number(row.selApp, 1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, ...deltaStyle(row.deltaApp) }}>
                      {row.deltaApp >= 0 ? '+' : ''}{fmt.number(row.deltaApp, 1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt.deltaPct(row.deltaAppPct)}
                    </td>
                    {/* NEW / OUT 뱃지 */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <DeltaPctCell
                        deltaApp={row.deltaApp}
                        deltaAppPct={row.deltaAppPct}
                        cmpApp={row.cmpApp}
                      />
                    </td>
                    {row.causes.map(c => {
                      const arrow = getArrow(c.delta);
                      return (
                        <td key={c.key} style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, ...causeStyle(c.delta, c.invert) }}>
                          {arrow}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="cls-grid-2" style={{ gap: 'var(--space-4)' }}>
        <Table data={rising}  type="rising"  />
        <Table data={falling} type="falling" />
      </div>
      {/* 범례 */}
      <div style={{
        marginTop: 'var(--space-2)', padding: 'var(--space-1) var(--space-3)',
        backgroundColor: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)',
        display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--font-small)',
        color: 'var(--color-text-muted)', flexWrap: 'wrap',
      }}>
        <span>
          <span style={{ padding:'1px 6px', borderRadius:'var(--radius-full)', fontSize:'var(--font-tiny)', fontWeight:700, marginRight:'var(--space-1)', backgroundColor:'color-mix(in srgb, var(--color-delta-pos) 15%, transparent)', color:'var(--color-delta-pos)', border:'1px solid color-mix(in srgb, var(--color-delta-pos) 30%, transparent)' }}>NEW</span>
          비교 기간 대비 이번에 처음 전환이 발생한 키워드
        </span>
        <span>
          <span style={{ padding:'1px 6px', borderRadius:'var(--radius-full)', fontSize:'var(--font-tiny)', fontWeight:700, marginRight:'var(--space-1)', backgroundColor:'color-mix(in srgb, var(--color-delta-neg) 15%, transparent)', color:'var(--color-delta-neg)', border:'1px solid color-mix(in srgb, var(--color-delta-neg) 30%, transparent)' }}>OUT</span>
          비교 기간에 전환이 있었으나 이번에 전환이 없어진 키워드
        </span>
      </div>
    </div>
  );
}
