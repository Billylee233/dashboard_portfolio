'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDashboard } from '@/components/layout/DashboardLayout';
import { KPIGrid } from '@/components/ui/KPICard';
import { TrendChart } from '@/components/charts/TrendChart';
import { PeriodComparisonChart } from '@/components/charts/PeriodComparisonChart';
import { BubbleScatterChart } from '@/components/charts/BubbleScatterChart';
import { WaterfallChart } from '@/components/charts/WaterfallChart';
import { AIDiagnosisBox } from '@/components/ui/AIDiagnosisBox';
import { HierarchyTable } from '@/components/tables/HierarchyTable';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import EmptyState from '@/components/ui/EmptyState';
import { thStyle, tdStyle, rowBg, hexToRgb, heatmapBg, TABLE_MAX_H, COL_W } from '@/lib/tableStyles';

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────
const addD = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ─── DateLabel / ST ───────────────────────────────────────────────────────────
function DateLabel({ selStart, selEnd, cmpStart, cmpEnd }: {
  selStart: string; selEnd: string; cmpStart?: string; cmpEnd?: string;
}) {
  if (!selStart) return null;
  const s   = selStart === selEnd ? selStart : `${selStart} ~ ${selEnd}`;
  const cmp = cmpStart && cmpEnd
    ? (cmpStart === cmpEnd ? cmpStart : `${cmpStart} ~ ${cmpEnd}`) : '';
  const full = cmp ? `${s} vs ${cmp}` : s;
  return (
    <span style={{ fontSize:'var(--font-small)', fontWeight:400, color:'var(--color-text-muted)', marginLeft:6 }}>
      · {full}
    </span>
  );
}
function ST(label: string, ss: string, se: string, cs?: string, ce?: string, isAvg?: boolean): React.ReactNode {
  const avg = (isAvg && ss !== se) ? ' (Avg)' : '';
  return (
    <span style={{ display:'inline-flex', flexWrap:'wrap' as const, alignItems:'baseline' }}>
      <span>{label}{avg}</span>
      <DateLabel selStart={ss} selEnd={se} cmpStart={cs} cmpEnd={ce} />
    </span>
  );
}

// ─── Period Grouping ──────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';
function formatDateShort(d: string) { const [y,m,dd]=d.split('-'); return `${y.slice(2)}/${parseInt(m)}/${parseInt(dd)}`; }
function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d2.getUTCDay() || 7;
  d2.setUTCDate(d2.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d2.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d2.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function groupRowsByPeriod(rows: any[], period: Period): any[] {
  if (period === 'daily') return rows;
  const keyFn = period === 'weekly' ? getISOWeekKey : (d: string) => d.slice(0, 7);
  const groups = new Map<string, { rows: any[]; dates: string[] }>();
  for (const row of rows) {
    const key = keyFn(row.date);
    if (!groups.has(key)) groups.set(key, { rows: [], dates: [] });
    const g = groups.get(key)!; g.rows.push(row); g.dates.push(row.date);
  }
  const result: any[] = [];
  for (const [key, { rows: gr, dates }] of groups) {
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    const rangeStr = minDate === maxDate ? formatDateShort(minDate) : `${formatDateShort(minDate)} ~ ${formatDateShort(maxDate)}`;
    const label = period === 'weekly'
      ? `${parseInt(key.split('-W')[1])}wk (${rangeStr})`
      : (([y, m]) => `${y.slice(2)}/${m} (${rangeStr})`)(key.split('-'));
    const imp = gr.reduce((s, r) => s + (r.imp ?? 0), 0);
    const click = gr.reduce((s, r) => s + (r.click ?? 0), 0);
    const cost = gr.reduce((s, r) => s + (r.cost ?? 0), 0);
    const applicant = gr.reduce((s, r) => s + (r.applicant ?? 0), 0);
    result.push({ date: label, _sortKey: minDate, imp, click, ctr: imp > 0 ? click / imp : 0, cost, cpc: click > 0 ? cost / click : 0, applicant, cpa: applicant > 0 ? cost / applicant : 0, cvr: click > 0 ? applicant / click : 0 });
  }
  return result.sort((a, b) => b._sortKey.localeCompare(a._sortKey));
}
const PERIOD_BTNS: { key: Period; label: string }[] = [{ key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' }];

// ─── Daily Performance Table ──────────────────────────────────────────────────
function DailyTable({ rows, loading, selStart, selEnd }: {
  rows: any[]; loading: boolean; selStart: string; selEnd: string;
}) {
  const theme = useTheme();
  const [r, g, b] = hexToRgb(theme.colorAccent);
  const [period, setPeriod] = useState<Period>('daily');
  if (loading) return (
    <div className="card">
      <div className="card-title">{ST('📋 Daily Performance', selStart, selEnd)}</div>
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  );
  const rawSorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const sorted = groupRowsByPeriod(rawSorted, period);
  const hmCols = ['click', 'cost', 'applicant', 'cvr'] as const;
  const bounds = Object.fromEntries(hmCols.map(col => { const vals = sorted.map(r => r[col] ?? 0); return [col, { min: Math.min(...vals), max: Math.max(...vals) }]; })) as Record<string, { min: number; max: number }>;
  type RowKey = 'date' | 'imp' | 'click' | 'ctr' | 'cost' | 'cpc' | 'applicant' | 'cpa' | 'cvr';
  const COLS: { key: RowKey; label: string; fmtFn: (v: number | string) => string; heatmap?: boolean }[] = [
    { key: 'date', label: 'DATE', fmtFn: v => String(v) },
    { key: 'imp', label: 'IMP', fmtFn: v => fmt.number(+v) },
    { key: 'click', label: 'CLICK', fmtFn: v => fmt.number(+v), heatmap: true },
    { key: 'ctr', label: 'CTR', fmtFn: v => fmt.pct(+v) },
    { key: 'cost', label: 'COST', fmtFn: v => fmt.cost(+v), heatmap: true },
    { key: 'cpc', label: 'CPC', fmtFn: v => fmt.cost(+v) },
    { key: 'applicant', label: 'APP', fmtFn: v => fmt.number(+v), heatmap: true },
    { key: 'cpa', label: 'CPA', fmtFn: v => fmt.cost(+v) },
    { key: 'cvr', label: 'CVR', fmtFn: v => fmt.pct(+v), heatmap: true },
  ];
  const evenBg = 'transparent', oddBg = 'color-mix(in srgb, var(--color-border-subtle) 22%, transparent)';
  return (
    <div className="card">
      <div className="section-header">
        <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 'var(--font-section-title)' }}>
          {ST('📋 Daily Performance', selStart, selEnd)}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIOD_BTNS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: period === key ? 'var(--color-accent)' : 'transparent', color: period === key ? '#fff' : 'var(--color-text-secondary)' }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: TABLE_MAX_H.md }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {COLS.map(c => (
              <th key={c.key} style={{
                ...thStyle,
                textAlign: c.key === 'date' ? 'left' : 'right',
                width: c.key === 'date' ? (period === 'daily' ? COL_W.date : COL_W.dateLong) : undefined,
              }}>{c.label}</th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={row.date} style={{ backgroundColor: rowBg(idx) }}>
                {COLS.map(c => {
                  const val = row[c.key] ?? 0;
                  const bg = c.heatmap && bounds[c.key] ? heatmapBg(+val, bounds[c.key].min, bounds[c.key].max, [r, g, b]) : 'transparent';
                  const isApp = c.key === 'applicant';
                  return <td key={c.key} style={{ ...tdStyle, color: isApp ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: isApp ? 700 : (c.key === 'date' ? 500 : 400), textAlign: c.key === 'date' ? 'left' : 'right', backgroundColor: bg, transition: 'background-color 0.2s' }}>{c.fmtFn(val)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Channel Detail Page ──────────────────────────────────────────────────────
function ChannelDetailPage() {
  const theme = useTheme();
  const searchParams = useSearchParams();
  const media = searchParams.get('media') ?? '';
  const { selectedRange, compareRange } = useDashboard();
  const [allChannels, setAllChannels] = useState<string[]>([]);
  const [bubbleTab, setBubbleTab] = useState<'campaign' | 'group' | 'ad'>('campaign');
  const [waterfallHierTab, setWaterfallHierTab] = useState<'campaign' | 'group' | 'ad'>('campaign');

  // 전체 채널 목록 (AI 진단용) — selectedRange 그대로
  useEffect(() => {
    const params = new URLSearchParams({ selStart: selectedRange.start, selEnd: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end });
    fetch(`/api/channels?${params}`).then(r => r.json()).then(d => setAllChannels(d.channels ?? [])).catch(() => {});
  }, [selectedRange, compareRange]);

  // ── 단일일이면 7일 확장 (Trend / Periodicity / Daily 전용) ────────────────
  const isSingle = selectedRange.start === selectedRange.end;
  const trendStart = isSingle ? addD(selectedRange.end, -6) : selectedRange.start;
  const trendEnd   = selectedRange.end;
  const durDays    = isSingle ? 6 : Math.round(
    (new Date(trendEnd + 'T12:00:00Z').getTime() - new Date(trendStart + 'T12:00:00Z').getTime()) / 86400000
  );
  const trendCmpEnd   = addD(trendStart, -1);
  const trendCmpStart = addD(trendCmpEnd, -durDays);

  // ── fetch A: Trend / Periodicity / Daily (trendStart~trendEnd) ──────────────
  const [trendData, setTrendData] = useState<any>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const fetchTrend = useCallback(async () => {
    if (!media) return;
    setTrendLoading(true);
    try {
      const params = new URLSearchParams({ media, start: trendStart, end: trendEnd, cmpStart: trendCmpStart, cmpEnd: trendCmpEnd });
      const res = await fetch(`/api/detail?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setTrendData(await res.json());
    } catch (e: any) { console.error(e); }
    finally { setTrendLoading(false); }
  }, [media, trendStart, trendEnd, trendCmpStart, trendCmpEnd]);

  // ── fetch B: Period Summary / Hierarchy / Bubble (selectedRange 그대로) ────
  const [selData, setSelData] = useState<any>(null);
  const [selLoading, setSelLoading] = useState(true);
  const fetchSel = useCallback(async () => {
    if (!media) return;
    setSelLoading(true);
    try {
      const params = new URLSearchParams({ media, start: selectedRange.start, end: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end });
      const res = await fetch(`/api/detail?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setSelData(await res.json());
    } catch (e: any) { console.error(e); }
    finally { setSelLoading(false); }
  }, [media, selectedRange.start, selectedRange.end, compareRange.start, compareRange.end]);

  useEffect(() => { fetchTrend(); }, [fetchTrend]);
  useEffect(() => { fetchSel(); }, [fetchSel]);

  if (!media) {
    return (
      <EmptyState
        icon="📡"
        title="채널을 선택해주세요"
        description="상단 채널 버튼 또는 Overview에서 채널명을 클릭하세요"
        style={{ height: 256 }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold page-title">🔍 Channel Detail</h1>
          <p className="font-semibold mt-0.5" style={{ fontSize: 'var(--font-body)', color: 'var(--color-accent)' }}>{media}</p>
        </div>
      </div>

      {/* 1. Period Summary — selectedRange 하루/기간 합계 */}
      <section>
        <div className="section-header">
          <span className="section-title">
            {ST('📅 Period Summary', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
          </span>
        </div>
        <KPIGrid
          imp={selData?.periodSummary?.imp ?? 0}
          click={selData?.periodSummary?.click ?? 0}
          cost={selData?.periodSummary?.cost ?? 0}
          applicant={selData?.periodSummary?.applicant ?? 0}
          ctr={selData?.periodSummary?.ctr ?? 0}
          cvr={selData?.periodSummary?.cvr ?? 0}
          cpc={selData?.periodSummary?.cpc ?? 0}
          cpa={selData?.periodSummary?.cpa ?? 0}
          deltaPercent={selData?.periodDeltaPercent ?? undefined}
          loading={selLoading}
        />
      </section>

      {/* 2. AI Diagnosis */}
      <AIDiagnosisBox media={media} latestDate={selData?.latestDate ?? null} allChannels={allChannels} />

      {/* 3. Performance Trend — trendStart~trendEnd + 비교기간 */}
      <TrendChart
        title={ST('📈 Performance Trend', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
        data={trendData?.trend ?? []}
        compareData={trendData?.compareTrend ?? []}
        loading={trendLoading}
      />

      {/* 4. Periodicity Analysis — trendStart~trendEnd + 비교기간 */}
      <PeriodComparisonChart
        title={ST('📊 Periodicity Analysis', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
        selectedData={trendData?.trend ?? []}
        compareData={trendData?.compareTrend ?? []}
        selectedRange={{ start: trendStart, end: trendEnd }}
        compareRange={{ start: trendCmpStart, end: trendCmpEnd }}
        loading={trendLoading}
      />

      {/* 5. Daily Performance — trendStart~trendEnd, 비교 없음 */}
      <DailyTable rows={trendData?.daily ?? []} loading={trendLoading} selStart={trendStart} selEnd={trendEnd} />

      {/* 6. Hierarchy Performance Positioning — selectedRange 그대로 */}
      <BubbleScatterChart
        title={ST('🎯 Hierarchy Performance Positioning', selectedRange.start, selectedRange.end)}
        headerSlot={
          <div style={{ display:'flex', gap:4 }}>
            {(['campaign', 'group', 'ad'] as const).map(tab => (
              <button key={tab} onClick={() => setBubbleTab(tab)} style={{ padding:'4px 12px', borderRadius:8, fontSize:'var(--font-label)', fontWeight:600, border:'none', cursor:'pointer', transition:'all 0.15s', backgroundColor: bubbleTab===tab?'var(--color-accent)':'transparent', color: bubbleTab===tab?'#fff':'var(--color-text-secondary)' }}>
                {tab==='campaign'?'Campaign':tab==='group'?'Group':'Ad'}
              </button>
            ))}
          </div>
        }
        data={(selData?.bubbles?.[bubbleTab] ?? []).map((b: any) => ({ id: b.id, label: b.label, cpa: b.cpa, cvr: b.cvr, applicant: b.applicant, selImp: b.imp, cmpImp: b.cmpImp, trend: b.trend, trendPct: b.trendPct }))}
        loading={selLoading}
      />

      {/* 6-1. Hierarchy Contribution Waterfall — 계층별 기여도 변화 */}
      <WaterfallChart
        title={ST('💧 Hierarchy Contribution Waterfall', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
        selectedRange={selectedRange}
        compareRange={compareRange}
        hierarchyTabs={[
          { key: 'campaign', label: 'Campaign' },
          { key: 'group',    label: 'Group'    },
          { key: 'ad',       label: 'Ad'       },
        ]}
        activeHierarchyTab={waterfallHierTab}
        onHierarchyTabChange={k => setWaterfallHierTab(k as 'campaign' | 'group' | 'ad')}
        items={(selData?.comparison?.[waterfallHierTab] ?? []).map((item: any) => ({
          label:    item.key ?? item.campaign ?? item.group ?? item.ad ?? '—',
          selected: item.selected ?? {},
          compared: item.compared ?? {},
        }))}
        loading={selLoading}
      />

      {/* 7. Hierarchy Daily Performance — selectedRange 그대로 */}
      <HierarchyTable
        mode="daily"
        title={ST('📋 Hierarchy Daily Performance', selectedRange.start, selectedRange.end)}
        hierarchyData={selData?.hierarchy ?? []}
        loading={selLoading}
      />

      {/* 8. Hierarchy Period Comparison — selectedRange 그대로, 비교기간 있음 */}
      <HierarchyTable
        mode="comparison"
        title={ST('🔄 Hierarchy Period Comparison', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
        comparisonData={selData?.comparison}
        selectedRange={selectedRange}
        compareRange={compareRange}
        loading={selLoading}
      />
    </div>
  );
}

export default function ChannelDetailPageWrapper() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--color-text-muted)', padding: 32 }}>로딩 중...</div>}>
      <ChannelDetailPage />
    </Suspense>
  );
}
