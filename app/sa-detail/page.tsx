'use client';

import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDashboard } from '@/components/layout/DashboardLayout';
import { KPIGrid } from '@/components/ui/KPICard';
import { TrendChart } from '@/components/charts/TrendChart';
import { PeriodComparisonChart } from '@/components/charts/PeriodComparisonChart';
import { useTheme } from '@/components/ui/ThemeEditor';
import { fmt } from '@/lib/calculations';
import { filterBtnStyle } from '@/lib/buttonStyles';
import { thStickyStyle, tdStyle, rowBg, hexToRgb, heatmapBg, TABLE_MAX_H, COL_W } from '@/lib/tableStyles';
import { parseFilterFromParams } from '@/components/sa/SAFilterBar';
import { KeywordLeaderboard } from '@/components/sa/KeywordLeaderboard';
import { KeywordMovementTable } from '@/components/sa/KeywordMovementTable';
import { KeywordActionList, type ActionSettings } from '@/components/sa/KeywordActionList';
import { KeywordExplorer } from '@/components/sa/KeywordExplorer';

// ─── 날짜 유틸 — overview-detail과 동일 ──────────────────────────────────────
const addD = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function daysBetween(start: string, end: string): number {
  return Math.max(1, Math.round(
    (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000
  ) + 1);
}

// ─── DateLabel / ST ───────────────────────────────────────────────────────────
function DateLabel({ selStart, selEnd, cmpStart, cmpEnd }: {
  selStart: string; selEnd: string; cmpStart?: string; cmpEnd?: string;
}) {
  if (!selStart) return null;
  const s   = selStart === selEnd ? selStart : `${selStart} ~ ${selEnd}`;
  const cmp = cmpStart && cmpEnd ? (cmpStart === cmpEnd ? cmpStart : `${cmpStart} ~ ${cmpEnd}`) : '';
  return (
    <span style={{ fontSize: 'var(--font-small)', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>
      · {cmp ? `${s} vs ${cmp}` : s}
    </span>
  );
}
function ST(label: string, ss: string, se: string, cs?: string, ce?: string): React.ReactNode {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
      <span>{label}</span>
      <DateLabel selStart={ss} selEnd={se} cmpStart={cs} cmpEnd={ce} />
    </span>
  );
}

// ─── Daily Table ──────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';

function DailyTable({ daily, weekly, monthly, loading, period, onPeriodChange }: {
  daily: any[]; weekly: any[]; monthly: any[]; loading: boolean;
  period: Period; onPeriodChange: (p: Period) => void;
}) {
  const theme = useTheme();
  const accentRgb = useMemo(() => hexToRgb(theme.colorAccent ?? '#0ea5e9'), [theme.colorAccent]);
  const rows = period === 'daily' ? daily : period === 'weekly' ? weekly : monthly;

  const HEAT_KEYS = ['click', 'cost', 'applicant', 'cvr'];
  const ranges = useMemo(() => {
    const r: Record<string, { min: number; max: number }> = {};
    HEAT_KEYS.forEach(k => {
      const vals = rows.map((row: any) => row[k] ?? 0);
      r[k] = { min: Math.min(...vals, 0), max: Math.max(...vals, 0) };
    });
    return r;
  }, [rows]);

  if (loading) return (
    <div>{[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 32, marginBottom: 'var(--space-1)', borderRadius: 'var(--radius-xs)' }} />)}</div>
  );

  const dateLabel = (row: any) => {
    if (period === 'daily')  return row.date;
    if (period === 'weekly') return `${row.week}wk (${row.week_start} ~ ${row.week_end})`;
    return `${row.month}`;
  };

  return (
    <div style={{ overflowX: 'auto', maxHeight: TABLE_MAX_H.md }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStickyStyle, textAlign: 'left', width: period === 'daily' ? COL_W.date : COL_W.dateLong }}>DATE</th>
            {['IMP','CLICK','CTR','COST','CPC','APP','CPA','CVR'].map(h => (
              <th key={h} style={{ ...thStickyStyle, textAlign: 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row: any, idx: number) => (
            <tr key={idx} style={{ backgroundColor: rowBg(idx), transition: `background-color var(--transition-fast)` }}>
              <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'left' }}>{dateLabel(row)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmt.number(row.imp)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)', backgroundColor: heatmapBg(row.click, ranges['click'].min, ranges['click'].max, accentRgb), transition: 'background-color 0.2s' }}>{fmt.number(row.click)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.pct(row.ctr)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)', backgroundColor: heatmapBg(row.cost, ranges['cost'].min, ranges['cost'].max, accentRgb), transition: 'background-color 0.2s' }}>{fmt.cost(row.cost)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.cost(row.cpc)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)', backgroundColor: heatmapBg(row.applicant, ranges['applicant'].min, ranges['applicant'].max, accentRgb), transition: 'background-color 0.2s' }}>{fmt.number(row.applicant)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.cost(row.cpa)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)', backgroundColor: heatmapBg(row.cvr, ranges['cvr'].min, ranges['cvr'].max, accentRgb), transition: 'background-color 0.2s' }}>{fmt.pct(row.cvr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Daily Section (버튼 우측 배치) ──────────────────────────────────────────
function DailySection({ trendData, trendLoading, trendStart, trendEnd }: {
  trendData: any; trendLoading: boolean; trendStart: string; trendEnd: string;
}) {
  const [period, setPeriod] = useState<Period>('daily');
  return (
    <div className="card">
      <div className="section-header">
        <span className="section-title">{ST('📋 Daily Performance', trendStart, trendEnd)}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-label)', fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'all var(--transition-normal)',
                backgroundColor: period === p ? 'var(--color-accent)' : 'transparent',
                color: period === p ? '#fff' : 'var(--color-text-secondary)',
              }}
            >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
      </div>
      <DailyTable
        daily={trendData?.daily ?? []}
        weekly={trendData?.weekly ?? []}
        monthly={trendData?.monthly ?? []}
        loading={trendLoading}
        period={period}
        onPeriodChange={setPeriod}
      />
    </div>
  );
}

// ─── 메인 페이지 내부 ─────────────────────────────────────────────────────────
function SADetailContent() {
  const searchParams = useSearchParams();
  const { selectedRange, compareRange, dateReady } = useDashboard();

  // URL params에서 필터 읽기
  const filter = useMemo(() => parseFilterFromParams(searchParams), [searchParams.toString()]); // eslint-disable-line

  // 단일일 7일 확장 — overview-detail과 동일
  const isSingle   = selectedRange.start === selectedRange.end;
  const trendStart = isSingle ? addD(selectedRange.end, -6) : selectedRange.start;
  const trendEnd   = selectedRange.end;
  const durDays    = isSingle ? 6 : Math.round(
    (new Date(trendEnd + 'T12:00:00Z').getTime() - new Date(trendStart + 'T12:00:00Z').getTime()) / 86400000
  );
  const trendCmpEnd   = addD(trendStart, -1);
  const trendCmpStart = addD(trendCmpEnd, -durDays);

  // fetch A: Trend / Periodicity / Daily
  const [trendData,    setTrendData]    = useState<any>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // fetch B: Period Summary + Keywords
  const [selData,    setSelData]    = useState<any>(null);
  const [selLoading, setSelLoading] = useState(false);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filter.media.length)    p.media    = filter.media.join(',');
    if (filter.campaign.length) p.campaign = filter.campaign.join(',');
    if (filter.group.length)    p.group    = filter.group.join(',');
    if (filter.keywords.length) p.keywords = filter.keywords.join(',');
    if (filter.topN.length)     p.topN     = filter.topN.join(',');
    return p;
  }, [filter]);

  const fetchTrend = useCallback(async () => {
    if (!dateReady || !filter.media.length) return;
    setTrendLoading(true);
    try {
      const params = new URLSearchParams({ type: 'trend', start: trendStart, end: trendEnd, cmpStart: trendCmpStart, cmpEnd: trendCmpEnd, ...filterParams });
      const res = await fetch(`/api/sa-detail?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setTrendData(await res.json());
    } catch (e: any) { console.error('[SA trend]', e); }
    finally { setTrendLoading(false); }
  }, [dateReady, trendStart, trendEnd, trendCmpStart, trendCmpEnd, filterParams]);

  const fetchSel = useCallback(async () => {
    if (!dateReady || !filter.media.length) return;
    setSelLoading(true);
    try {
      const params = new URLSearchParams({ start: selectedRange.start, end: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end, ...filterParams });
      const res = await fetch(`/api/sa-detail?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setSelData(await res.json());
    } catch (e: any) { console.error('[SA sel]', e); }
    finally { setSelLoading(false); }
  }, [dateReady, selectedRange, compareRange, filterParams]);

  useEffect(() => { fetchTrend(); }, [fetchTrend]);
  useEffect(() => { fetchSel();   }, [fetchSel]);

  const dayCount = useMemo(() => dateReady ? daysBetween(selectedRange.start, selectedRange.end) : 1, [dateReady, selectedRange]);
  const ps = selData?.periodSummary;

  // ── 공유 Action 설정 (BigQuery) ───────────────────────────────────────────
  const [actionRules,    setActionRules]    = useState<any[]>([]);
  const [actionExcludes, setActionExcludes] = useState<any[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    setSettingsLoading(true);
    fetch('/api/sa-detail/action-settings')
      .then(r => r.json())
      .then(d => {
        if (d.settings?.action_criteria) setActionRules(d.settings.action_criteria);
        if (d.settings?.exclusion_rules) setActionExcludes(d.settings.exclusion_rules);
      })
      .catch(e => console.error('[action-settings load]', e))
      .finally(() => setSettingsLoading(false));
  }, []);

  const handleSettingsChange = useCallback((newRules: any[], newExcludes: any[]) => {
    setActionRules(newRules);
    setActionExcludes(newExcludes);
  }, []);

  // ── 공유 평균 계산 (제외 조건 적용 후) ───────────────────────────────────
  const keywords = selData?.keywords ?? [];

  const allKeywords = useMemo(() => {
    if (!actionExcludes.length) return keywords;
    return keywords.filter((r: any) => {
      return !actionExcludes.some((ex: any) => {
        let v = ((r.selected as any)[ex.metric] ?? 0) / dayCount;
        switch (ex.operator) {
          case '<':  return v <  ex.value;
          case '<=': return v <= ex.value;
          case '>':  return v >  ex.value;
          case '>=': return v >= ex.value;
          case '=':  return Math.abs(v - ex.value) < 0.0001;
          default:   return false;
        }
      });
    });
  }, [keywords, actionExcludes, dayCount]);

  const sharedAvg = useMemo(() => {
    const n = allKeywords.length;
    if (!n) return { avgCpa: 0, avgCvr: 0, totalAvg: { cpa: 0, cvr: 0, app: 0 } };
    const avgCpa = allKeywords.reduce((s: number, r: any) => s + r.selected.cpa, 0) / n;
    const avgCvr = allKeywords.reduce((s: number, r: any) => s + r.selected.cvr, 0) / n;
    return {
      avgCpa,
      avgCvr,
      totalAvg: {
        cpa: avgCpa,
        cvr: avgCvr,
        app: allKeywords.reduce((s: number, r: any) => s + r.selected.applicant, 0) / n / dayCount,
      },
    };
  }, [allKeywords, dayCount]);

  const actionSettings: ActionSettings = {
    rules:           actionRules,
    excludes:        actionExcludes,
    avgCpa:          sharedAvg.avgCpa,
    avgCvr:          sharedAvg.avgCvr,
    totalAvg:        sharedAvg.totalAvg,
    allKeywords,
    onSettingsChange: handleSettingsChange,
    settingsLoading,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold page-title">
          🔎 SA Detail
          {dateReady && (
            <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginLeft: 6, fontWeight: 400 }}>
              · {selectedRange.start} ~ {selectedRange.end}
            </span>
          )}
        </h1>
      </div>

      {!filter.media.length && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-body)' }}>
          상단 필터에서 매체를 1개 이상 선택해 주세요
        </div>
      )}

      {filter.media.length > 0 && (
        <>
          {/* 섹션 1: Period Summary */}
          <section>
            <div className="section-header">
              <span className="section-title">
                {ST('📊 Period Summary', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
              </span>
            </div>
            <KPIGrid
              imp={ps?.selected.imp ?? 0} click={ps?.selected.click ?? 0}
              cost={ps?.selected.cost ?? 0} applicant={ps?.selected.applicant ?? 0}
              ctr={ps?.selected.ctr ?? 0} cvr={ps?.selected.cvr ?? 0}
              cpc={ps?.selected.cpc ?? 0} cpa={ps?.selected.cpa ?? 0}
              deltaPercent={ps?.deltaPercent as any} loading={selLoading}
            />
          </section>

          {/* 섹션 2: Performance Trend */}
          <TrendChart
            title={ST('📈 Performance Trend', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
            data={trendData?.daily ?? []}
            compareData={trendData?.dailyCmp ?? []}
            loading={trendLoading}
          />

          {/* 섹션 3: Periodicity Analysis */}
          <PeriodComparisonChart
            title={ST('📊 Periodicity Analysis', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
            selectedData={trendData?.daily ?? []}
            compareData={trendData?.dailyCmp ?? []}
            selectedRange={{ start: trendStart, end: trendEnd }}
            compareRange={{ start: trendCmpStart, end: trendCmpEnd }}
            loading={trendLoading}
          />

          {/* 섹션 4: Daily Performance */}
          <DailySection trendData={trendData} trendLoading={trendLoading} trendStart={trendStart} trendEnd={trendEnd} />

          {/* 섹션 5: Keyword Leaderboard */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">
                {ST('🏆 Keyword Leaderboard', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
              </span>
            </div>
            <KeywordLeaderboard rows={selData?.keywords ?? []} loading={selLoading} />
          </div>

          {/* 섹션 6: Keyword Movement */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">
                {ST(`🔄 Keyword Movement${dayCount > 1 ? ' (Avg)' : ''}`, selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
              </span>
            </div>
            <KeywordMovementTable rows={selData?.keywords ?? []} loading={selLoading} dayCount={dayCount} />
          </div>

          {/* 섹션 7: Keyword Action List */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">
                {ST('⚡ Keyword Action List', selectedRange.start, selectedRange.end)}
              </span>
            </div>
            <KeywordActionList rows={keywords} dayCount={dayCount} loading={selLoading} settings={actionSettings} />
          </div>

          {/* 섹션 8: Keyword Explorer */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">🔍 Keyword Explorer</span>
            </div>
            <KeywordExplorer rows={keywords} loading={selLoading} dayCount={dayCount} rules={actionRules} avgCpa={sharedAvg.avgCpa} avgCvr={sharedAvg.avgCvr} />
          </div>

        </>
      )}
    </div>
  );
}

// ─── 메인 페이지 (Suspense 래핑 — useSearchParams 필수) ──────────────────────
export default function SADetailPage() {
  return (
    <Suspense fallback={<div className="space-y-6"><div className="skeleton" style={{ height: 200 }} /></div>}>
      <SADetailContent />
    </Suspense>
  );
}
