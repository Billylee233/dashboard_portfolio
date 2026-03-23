'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/components/layout/DashboardLayout';
import { KPIGrid } from '@/components/ui/KPICard';
import { TrendChart } from '@/components/charts/TrendChart';
import { PeriodComparisonChart } from '@/components/charts/PeriodComparisonChart';
import { BubbleScatterChart } from '@/components/charts/BubbleScatterChart';
import { WaterfallChart } from '@/components/charts/WaterfallChart';
import { ChannelComparisonTable } from '@/components/tables/ChannelComparisonTable';
import { CrisisPanel } from '@/components/tables/CrisisPanel';
import { useTheme } from '@/components/ui/ThemeEditor';
import { fmt } from '@/lib/calculations';
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
  const d = new Date(dateStr+'T00:00:00');
  const d2 = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum = d2.getUTCDay()||7;
  d2.setUTCDate(d2.getUTCDate()+4-dayNum);
  const yearStart = new Date(Date.UTC(d2.getUTCFullYear(),0,1));
  const week = Math.ceil((((d2.getTime()-yearStart.getTime())/86400000)+1)/7);
  return `${d2.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
function groupRowsByPeriod(rows: any[], period: Period): any[] {
  if (period==='daily') return rows;
  const keyFn = period==='weekly' ? getISOWeekKey : (d:string)=>d.slice(0,7);
  const groups = new Map<string,{rows:any[];dates:string[]}>();
  for (const row of rows) {
    const key = keyFn(row.date);
    if (!groups.has(key)) groups.set(key,{rows:[],dates:[]});
    const g = groups.get(key)!; g.rows.push(row); g.dates.push(row.date);
  }
  const result:any[]=[];
  for (const [key,{rows:gr,dates}] of groups) {
    const minDate=dates.reduce((a,b)=>a<b?a:b), maxDate=dates.reduce((a,b)=>a>b?a:b);
    const rangeStr=minDate===maxDate?formatDateShort(minDate):`${formatDateShort(minDate)} ~ ${formatDateShort(maxDate)}`;
    const label = period==='weekly'
      ? `${parseInt(key.split('-W')[1])}wk (${rangeStr})`
      : (([y,m])=>`${y.slice(2)}/${m} (${rangeStr})`)(key.split('-'));
    const imp=gr.reduce((s,r)=>s+(r.imp??0),0), click=gr.reduce((s,r)=>s+(r.click??0),0);
    const cost=gr.reduce((s,r)=>s+(r.cost??0),0), applicant=gr.reduce((s,r)=>s+(r.applicant??0),0);
    result.push({ date:label, _sortKey:minDate, imp, click, ctr:imp>0?click/imp:0,
      cost, cpc:click>0?cost/click:0, applicant, cpa:applicant>0?cost/applicant:0, cvr:click>0?applicant/click:0 });
  }
  return result.sort((a,b)=>b._sortKey.localeCompare(a._sortKey));
}
const PERIOD_BTNS: {key:Period;label:string}[] = [{key:'daily',label:'Daily'},{key:'weekly',label:'Weekly'},{key:'monthly',label:'Monthly'}];

// ─── Daily Table ──────────────────────────────────────────────────────────────
function DailyTable({ rows, loading, selStart, selEnd }: {
  rows: any[]; loading: boolean; selStart: string; selEnd: string;
}) {
  const theme = useTheme();
  const [r,g,b] = hexToRgb(theme.colorAccent);
  const [period, setPeriod] = useState<Period>('daily');
  if (loading) return (
    <div className="card">
      <div className="card-title">{ST('📋 Daily Performance', selStart, selEnd)}</div>
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  );
  const rawSorted = [...rows].sort((a,b)=>b.date.localeCompare(a.date));
  const sorted = groupRowsByPeriod(rawSorted, period);
  const hmCols = ['click','cost','applicant','cvr'] as const;
  const bounds = Object.fromEntries(hmCols.map(col=>{ const vals=sorted.map(r=>r[col]??0); return [col,{min:Math.min(...vals),max:Math.max(...vals)}]; })) as Record<string,{min:number;max:number}>;
  type RowKey='date'|'imp'|'click'|'ctr'|'cost'|'cpc'|'applicant'|'cpa'|'cvr';
  const COLS: {key:RowKey;label:string;fmtFn:(v:number|string)=>string;heatmap?:boolean}[] = [
    {key:'date',label:'DATE',fmtFn:v=>String(v)},
    {key:'imp',label:'IMP',fmtFn:v=>fmt.number(+v)},
    {key:'click',label:'CLICK',fmtFn:v=>fmt.number(+v),heatmap:true},
    {key:'ctr',label:'CTR',fmtFn:v=>fmt.pct(+v)},
    {key:'cost',label:'COST',fmtFn:v=>fmt.cost(+v),heatmap:true},
    {key:'cpc',label:'CPC',fmtFn:v=>fmt.cost(+v)},
    {key:'applicant',label:'APP',fmtFn:v=>fmt.number(+v),heatmap:true},
    {key:'cpa',label:'CPA',fmtFn:v=>fmt.cost(+v)},
    {key:'cvr',label:'CVR',fmtFn:v=>fmt.pct(+v),heatmap:true},
  ];
  const evenBg='transparent', oddBg='color-mix(in srgb,var(--color-border-subtle) 22%,transparent)';
  return (
    <div className="card">
      <div className="section-header">
        <span style={{fontWeight:700,color:'var(--color-text-primary)',fontSize:'var(--font-section-title)'}}>
          {ST('📋 Daily Performance', selStart, selEnd)}
        </span>
        <div style={{display:'flex',gap:4}}>
          {PERIOD_BTNS.map(({key,label})=>(
            <button key={key} onClick={()=>setPeriod(key)} style={{
              padding:'3px 10px',borderRadius:6,fontSize:'var(--font-label)',fontWeight:600,border:'none',cursor:'pointer',transition:'all 0.15s',
              backgroundColor:period===key?'var(--color-accent)':'transparent',
              color:period===key?'#fff':'var(--color-text-secondary)',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: TABLE_MAX_H.md }}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>
            {COLS.map(c=>(
              <th key={c.key} style={{
                ...thStyle,
                textAlign: c.key==='date' ? 'left' : 'right',
                width: c.key==='date' ? (period==='daily' ? COL_W.date : COL_W.dateLong) : undefined,
              }}>
                {c.label}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((row,idx)=>(
              <tr key={row.date} style={{backgroundColor: rowBg(idx)}}>
                {COLS.map(c=>{
                  const val=row[c.key]??0;
                  const bg=c.heatmap&&bounds[c.key]?heatmapBg(+val,bounds[c.key].min,bounds[c.key].max,[r,g,b]):'transparent';
                  const isApp=c.key==='applicant';
                  return <td key={c.key} style={{...tdStyle,color:isApp?'var(--color-accent)':'var(--color-text-secondary)',fontWeight:isApp?700:(c.key==='date'?500:400),textAlign:c.key==='date'?'left':'right',backgroundColor:bg,transition:'background-color 0.2s'}}>{c.fmtFn(val)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function OverviewDetailPage() {
  const router = useRouter();
  const { selectedRange, compareRange } = useDashboard();

  // ── 단일일이면 7일 확장 (Trend / Periodicity / Daily 전용) ─────────────────
  const isSingle = selectedRange.start === selectedRange.end;
  const trendStart = isSingle ? addD(selectedRange.end, -6) : selectedRange.start;
  const trendEnd   = selectedRange.end;
  const durDays    = isSingle ? 6 : Math.round(
    (new Date(trendEnd+'T12:00:00Z').getTime() - new Date(trendStart+'T12:00:00Z').getTime()) / 86400000
  );
  const trendCmpEnd   = addD(trendStart, -1);
  const trendCmpStart = addD(trendCmpEnd, -durDays);

  // ── fetch A: Trend / Periodicity / Daily / Crisis (trendStart~trendEnd) ────
  const [trendData, setTrendData] = useState<any>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const params = new URLSearchParams({ start:trendStart, end:trendEnd, cmpStart:trendCmpStart, cmpEnd:trendCmpEnd });
      const res = await fetch(`/api/summary?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setTrendData(await res.json());
    } catch (e: any) { console.error(e); }
    finally { setTrendLoading(false); }
  }, [trendStart, trendEnd, trendCmpStart, trendCmpEnd]);

  // ── fetch B: Period Summary / Channels (selectedRange 그대로) ───────────────
  const [selData, setSelData] = useState<any>(null);
  const [selLoading, setSelLoading] = useState(true);
  const fetchSel = useCallback(async () => {
    setSelLoading(true);
    try {
      const params = new URLSearchParams({ start:selectedRange.start, end:selectedRange.end, cmpStart:compareRange.start, cmpEnd:compareRange.end });
      const res = await fetch(`/api/summary?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setSelData(await res.json());
    } catch (e: any) { console.error(e); }
    finally { setSelLoading(false); }
  }, [selectedRange.start, selectedRange.end, compareRange.start, compareRange.end]);

  useEffect(() => { fetchTrend(); }, [fetchTrend]);
  useEffect(() => { fetchSel(); }, [fetchSel]);

  const loading = trendLoading || selLoading;

  // ── #crisis hash 스크롤 ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#crisis') return;
    if (loading) return;
    document.getElementById('crisis-section')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }, [loading]);

  const handleChannelClick = (media: string) => {
    router.push(`/channel-detail?media=${encodeURIComponent(media)}`);
  };

  // Period Summary = fetchB(selectedRange) → periodTotal
  const p = selData?.periodTotal;
  const pd = selData?.periodDeltaPercent;
  // Channels = fetchB(selectedRange) → channels
  const channels = selData?.channels ?? [];
  const latestDate = selData?.selectedRange?.end ?? selectedRange.end;
  // Crisis = fetchB(selectedRange) → crisis (latestDate 기준으로 summary API가 처리)
  const crisis = selData?.crisis ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold page-title">📋 Overview Detail</h1>
      </div>

      {/* 1. Period Summary — selectedRange 하루/기간 합계 */}
      <section>
        <div className="section-header">
          <span className="section-title">
            {ST('📅 Period Summary', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
          </span>
        </div>
        <KPIGrid
          imp={p?.imp??0} click={p?.click??0} cost={p?.cost??0} applicant={p?.applicant??0}
          ctr={p?.ctr??0} cvr={p?.cvr??0} cpc={p?.cpc??0} cpa={p?.cpa??0}
          deltaPercent={pd ?? undefined}
          loading={selLoading}
        />
      </section>

      {/* 2. Performance Trend — trendStart~trendEnd (단일일이면 21일 확장) + 비교기간 */}
      <TrendChart
        title={ST('📈 Performance Trend', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
        data={trendData?.trend ?? []}
        compareData={trendData?.compareTrend ?? []}
        loading={trendLoading}
      />

      {/* 3. Periodicity Analysis — trendStart~trendEnd + 비교기간 */}
      <PeriodComparisonChart
        title={ST('📊 Periodicity Analysis', trendStart, trendEnd, trendCmpStart, trendCmpEnd)}
        selectedData={trendData?.trend ?? []}
        compareData={trendData?.compareTrend ?? []}
        selectedRange={{ start:trendStart, end:trendEnd }}
        compareRange={{ start:trendCmpStart, end:trendCmpEnd }}
        loading={trendLoading}
      />

      {/* 4. Daily Performance — trendStart~trendEnd, 비교 없음 */}
      <DailyTable rows={trendData?.daily ?? []} loading={trendLoading} selStart={trendStart} selEnd={trendEnd} />

      {/* 5. Channel Performance Positioning — selectedRange 그대로 */}
      <BubbleScatterChart
        title={ST('🎯 Channel Performance Positioning', selectedRange.start, selectedRange.end)}
        data={channels.map((ch: any) => ({
          id:ch.media, label:ch.media,
          cpa:ch.selected.cpa, cvr:ch.selected.cvr, applicant:ch.selected.applicant,
          selImp:ch.selected.imp, cmpImp:ch.compared.imp, trend:ch.trend, trendPct:ch.trendPct,
        }))}
        onPointClick={p => handleChannelClick(p.id)}
        loading={selLoading}
      />

      {/* 5-1. Channel Contribution Waterfall — 채널별 기여도 변화 */}
      <WaterfallChart
        title={ST('💧 Channel Contribution Waterfall', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
        selectedRange={selectedRange}
        compareRange={compareRange}
        items={channels.map((ch: any) => ({
          label: ch.media,
          selected: ch.selected,
          compared: ch.compared,
        }))}
        loading={selLoading}
      />

      {/* 6. Channel Performance & Same-Day — selectedRange 그대로, 비교기간 있음 */}
      <ChannelComparisonTable
        title={ST('📊 Channel Performance & Same-Day Comparison', selectedRange.start, selectedRange.end, compareRange.start, compareRange.end)}
        data={channels.map((ch: any) => ({
          ...ch,
          isCrisis: crisis.find((c:any)=>c.media===ch.media)?.isCrisis ?? false,
        }))}
        onChannelClick={handleChannelClick}
        loading={selLoading}
      />

      {/* 7. Channel Crisis Status — latestDate 기준 (summary API가 selected.end 기준으로 처리) */}
      <div id="crisis-section">
        <CrisisPanel
          title={ST('⚠️ Channel Crisis Status', latestDate, latestDate)}
          data={crisis.map((c: any) => ({ ...c, aiSummary: null }))}
          onChannelClick={handleChannelClick}
          loading={selLoading}
        />
      </div>
    </div>
  );
}
