'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmt, calcMetrics, deltaColor } from '@/lib/calculations';
import { calcDelta } from '@/lib/calculations';
import type { MetricsRow, DateRange } from '@/lib/types';
import { thStyle, COL_W } from '@/lib/tableStyles';

interface CompareRow {
  id: string;
  media: string;
  campaign: string;
  group: string;
  ad: string;
  dateRange: DateRange;
  metrics: MetricsRow | null;
  loading: boolean;
}

const EMPTY_METRICS: MetricsRow = {
  imp: 0, click: 0, cost: 0, applicant: 0,
  ctr: 0, cvr: 0, cpc: 0, cpa: 0,
};

const COLS = [
  { key: 'imp',       label: 'IMP',   fmtFn: (v: number) => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmtFn: (v: number) => fmt.number(v) },
  { key: 'ctr',       label: 'CTR',   fmtFn: (v: number) => fmt.pct(v) },
  { key: 'cost',      label: 'COST',  fmtFn: (v: number) => fmt.cost(v),   invert: true },
  { key: 'cpc',       label: 'CPC',   fmtFn: (v: number) => fmt.cost(v),   invert: true },
  { key: 'applicant', label: 'APP',   fmtFn: (v: number) => fmt.number(v) },
  { key: 'cpa',       label: 'CPA',   fmtFn: (v: number) => fmt.cost(v),   invert: true },
  { key: 'cvr',       label: 'CVR',   fmtFn: (v: number) => fmt.pct(v) },
] as const;

let rowCounter = 0;
function newRow(defaultRange: DateRange): CompareRow {
  return {
    id: `row-${++rowCounter}`,
    media: '', campaign: '', group: '', ad: '',
    dateRange: { ...defaultRange },
    metrics: null,
    loading: false,
  };
}

interface PeerCompareTableProps {
  defaultRange: DateRange;
  media: string;
  cascadeOptions: {
    campaigns: string[];
    groups: Record<string, string[]>;
    ads: Record<string, string[]>;
  };
}

// 공통 셀렉트 스타일
const selectStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '4px 8px',
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-table-body)',
  outline: 'none',
  cursor: 'pointer',
};

const dateInputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 6px',
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-table-body)',
  outline: 'none',
  width: 105,
};

export function PeerCompareTable({ defaultRange, media, cascadeOptions }: PeerCompareTableProps) {
  const d1 = defaultRange;
  const [rows, setRows] = useState<CompareRow[]>([newRow(d1), newRow(d1)]);
  const [unifyDates, setUnifyDates] = useState(false);

  const handleUnify = (checked: boolean) => {
    setUnifyDates(checked);
    if (checked && rows.length > 0) {
      const base = rows[0].dateRange;
      setRows(prev => prev.map(r => ({ ...r, dateRange: { ...base } })));
    }
  };

  const updateRow = useCallback((id: string, patch: Partial<CompareRow>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch };
      if (patch.campaign !== undefined) { updated.group = ''; updated.ad = ''; }
      if (patch.group !== undefined) { updated.ad = ''; }
      return updated;
    }));
  }, []);

  const handleDateChange = useCallback((id: string, field: 'start' | 'end', value: string) => {
    setRows(prev => {
      if (!unifyDates) {
        return prev.map(r =>
          r.id === id ? { ...r, dateRange: { ...r.dateRange, [field]: value } } : r
        );
      }
      if (prev[0].id === id) {
        const newDate = { ...prev[0].dateRange, [field]: value };
        return prev.map(r => ({ ...r, dateRange: { ...newDate } }));
      }
      return prev;
    });
  }, [unifyDates]);

  const addRow = () => {
    const base = unifyDates ? rows[0].dateRange : defaultRange;
    setRows(prev => [...prev, newRow(base)]);
  };
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const fetchMetrics = async (row: CompareRow) => {
    if (!row.media || !row.campaign || !row.group || !row.ad) return;
    updateRow(row.id, { loading: true });
    try {
      const params = new URLSearchParams({
        media: row.media, campaign: row.campaign,
        group: row.group, ad: row.ad,
        start: row.dateRange.start, end: row.dateRange.end,
      });
      const res = await fetch(`/api/ad-performance?${params}`);
      const json = await res.json();
      updateRow(row.id, {
        metrics: json.data ? calcMetrics(json.data) : null,
        loading: false,
      });
    } catch {
      updateRow(row.id, { loading: false });
    }
  };

  useEffect(() => {
    rows.forEach(row => {
      if (row.ad && !row.loading) fetchMetrics(row);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => `${r.ad}${r.dateRange.start}${r.dateRange.end}`).join('|')]);

  const bestIdx: Record<string, number> = {};
  COLS.forEach(c => {
    const vals = rows.map(r => (r.metrics as any)?.[c.key] ?? null);
    const validVals = vals.filter(v => v !== null) as number[];
    if (!validVals.length) return;
    const best = (c as any).invert ? Math.min(...validVals) : Math.max(...validVals);
    bestIdx[c.key] = vals.indexOf(best);
  });

  return (
    <div className="card">
      <div className="section-header">
        <span className="section-title">🔬 동계층 비교 분석</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
          <input
            type="checkbox"
            checked={unifyDates}
            onChange={e => handleUnify(e.target.checked)}
            style={{
              accentColor: 'var(--color-accent)',
              width: 14, height: 14,
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          />
          1행 기준 기간 통일
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <th style={{ ...thStyle, textAlign: 'left', width: COL_W.rank }}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', width: COL_W.campaign }}>캠페인</th>
              <th style={{ ...thStyle, textAlign: 'left', width: COL_W.group }}>그룹</th>
              <th style={{ ...thStyle, textAlign: 'left', width: COL_W.creative }}>소재</th>
              <th style={{ ...thStyle, textAlign: 'left', width: COL_W.dateLong }}>기간</th>
              {COLS.map(c => (
                <th key={c.key} style={thStyle}>{c.label}</th>
              ))}
              <th style={{ width: COL_W.rank }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-accent) 4%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {/* 행 번호 */}
                <td style={{ padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)', fontSize: 'var(--font-table-body)', color: 'var(--color-text-muted)' }}>
                  {idx + 1}
                </td>

                {/* 캠페인 */}
                <td style={{ padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)' }}>
                  <select
                    value={row.campaign}
                    onChange={e => updateRow(row.id, { campaign: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="">선택</option>
                    {cascadeOptions.campaigns.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>

                {/* 그룹 */}
                <td style={{ padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)' }}>
                  <select
                    value={row.group}
                    onChange={e => updateRow(row.id, { group: e.target.value })}
                    disabled={!row.campaign}
                    style={{ ...selectStyle, opacity: !row.campaign ? 0.4 : 1 }}
                  >
                    <option value="">선택</option>
                    {(cascadeOptions.groups[row.campaign] ?? []).map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </td>

                {/* 소재 */}
                <td style={{ padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)' }}>
                  <select
                    value={row.ad}
                    onChange={e => updateRow(row.id, { ad: e.target.value })}
                    disabled={!row.group}
                    style={{ ...selectStyle, opacity: !row.group ? 0.4 : 1 }}
                  >
                    <option value="">선택</option>
                    {(cascadeOptions.ads[`${row.campaign}__${row.group}`] ?? []).map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </td>

                {/* 기간 */}
                <td style={{ padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="date"
                      value={row.dateRange.start}
                      onChange={e => handleDateChange(row.id, 'start', e.target.value)}
                      disabled={unifyDates && idx > 0}
                      style={{ ...dateInputStyle, opacity: unifyDates && idx > 0 ? 0.4 : 1 }}
                    />
                    <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>~</span>
                    <input
                      type="date"
                      value={row.dateRange.end}
                      onChange={e => handleDateChange(row.id, 'end', e.target.value)}
                      disabled={unifyDates && idx > 0}
                      style={{ ...dateInputStyle, opacity: unifyDates && idx > 0 ? 0.4 : 1 }}
                    />
                  </div>
                </td>

                {/* 지표 */}
                {row.loading ? (
                  <td colSpan={COLS.length} style={{ textAlign: 'center', padding: 'var(--table-cell-padding-y)', fontSize: 'var(--font-table-body)', color: 'var(--color-text-muted)' }}>
                    로딩 중...
                  </td>
                ) : row.metrics ? (
                  COLS.map(c => {
                    const v = (row.metrics as any)[c.key];
                    const isBest = bestIdx[c.key] === idx;
                    return (
                      <td
                        key={c.key}
                        style={{
                          textAlign: 'right',
                          padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
                          fontSize: 'var(--font-table-body)',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: isBest ? 700 : 400,
                          color: isBest ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {c.fmtFn(v)}
                        {isBest && <span style={{ marginLeft: 2, fontSize: 'var(--font-tiny)' }}>★</span>}
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={COLS.length} style={{ textAlign: 'center', padding: 'var(--table-cell-padding-y)', fontSize: 'var(--font-table-body)', color: 'var(--color-text-muted)' }}>
                    {row.ad ? '데이터 없음' : '소재 선택 후 자동 조회'}
                  </td>
                )}

                {/* 삭제 */}
                <td style={{ padding: 'var(--table-cell-padding-y) 4px' }}>
                  {rows.length > 2 && (
                    <button
                      onClick={() => removeRow(row.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 'var(--font-body)', color: 'var(--color-text-muted)',
                        transition: 'color var(--transition-fast)', padding: 2,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-error)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addRow}
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 'var(--space-4)' }}
      >
        + 행 추가
      </button>
    </div>
  );
}
