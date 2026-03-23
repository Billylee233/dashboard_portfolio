'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/components/layout/DashboardLayout';
import { useTheme } from '@/components/ui/ThemeEditor';
import { getChColor } from '@/lib/channelColors';
import { isLightColor } from '@/lib/theme';
import { KPIGrid } from '@/components/ui/KPICard';
import { fmt, deltaStyle } from '@/lib/calculations';
import EmptyState from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/charts/TrendChart';
import { ChannelBarChart, BAR_OPTIONS, LINE_OPTIONS } from '@/components/charts/ChannelBarChart';
import { OverviewBubbleChart } from '@/components/charts/OverviewBubbleChart';
import { thStickyStyle, tdStyle } from '@/lib/tableStyles';

// ── 날짜 유틸 ──────────────────────────────────────────────────────────────────
const toDateStr = (v: any): string => {
  if (!v) return '';
  if (typeof v === 'object' && v.value) return String(v.value).slice(0, 10);
  return String(v).slice(0, 10);
};
const utcMs = (s: string) => new Date(s + 'T12:00:00Z').getTime();
const addD  = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── 섹션 날짜 라벨: CSS media query 인라인으로 PC/MO 분기 ──────────────────────
function DateLabel({
  selStart, selEnd, cmpStart, cmpEnd,
}: { selStart: string; selEnd: string; cmpStart?: string; cmpEnd?: string }) {
  if (!selStart) return null;
  const s   = selStart === selEnd ? selStart : `${selStart} ~ ${selEnd}`;
  const cmp = cmpStart && cmpEnd
    ? (cmpStart === cmpEnd ? cmpStart : `${cmpStart} ~ ${cmpEnd}`)
    : '';
  const full = cmp ? `${s} vs ${cmp}` : s;
  return (
    <>
      {/* PC: 같은 줄에 · 날짜 */}
      <style>{`@media(min-width:640px){.date-mo{display:none!important}}.date-pc{display:none}@media(min-width:640px){.date-pc{display:inline}}`}</style>
      <span className="date-pc" style={{ fontSize: 'var(--font-small)', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>
        · {full}
      </span>
      {/* MO: 아래 줄에 날짜만 */}
      <span className="date-mo" style={{ display: 'block', fontSize: 'var(--font-small)', fontWeight: 400, color: 'var(--color-text-muted)', marginTop: 2 }}>
        {full}
      </span>
    </>
  );
}

// ── 섹션 제목 빌더: label + (Avg) + DateLabel ──────────────────────────────────
function ST(
  label: string, selStart: string, selEnd: string,
  cmpStart?: string, cmpEnd?: string, isAvg?: boolean
): React.ReactNode {
  const avg = (isAvg && selStart !== selEnd) ? ' (Avg)' : '';
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
      <span>{label}{avg}</span>
      <DateLabel selStart={selStart} selEnd={selEnd} cmpStart={cmpStart} cmpEnd={cmpEnd} />
    </span>
  );
}

// ── 채널 컬러 ──────────────────────────────────────────────────────────────────
// 채널 컬러는 lib/channelColors.ts에서 공통 관리

// ── Section ────────────────────────────────────────────────────────────────────
function Section({ title, headerRight, children, noBorder }: {
  title: React.ReactNode; headerRight?: React.ReactNode;
  children: React.ReactNode; noBorder?: boolean;
}) {
  const theme = useTheme();
  return (
    <div style={{ overflow:'hidden', backgroundColor:'var(--color-surface-1)',
      border:'1px solid var(--color-border-subtle)', borderRadius:`${theme.cardBorderRadius}px`,
      display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 16px',
        borderBottom: noBorder ? 'none' : '1px solid var(--color-border-subtle)',
        gap:8, flexWrap:'wrap' as const }}>
        <span style={{ fontWeight:700, color:'var(--color-text-primary)', fontSize:'var(--font-section-title)' }}>
          {title}
        </span>
        {headerRight}
      </div>
      <div style={{ padding:20, flex:1 }}>{children}</div>
    </div>
  );
}

function Skeleton({ h=200 }: { h?: number }) {
  return <div style={{ height:h, borderRadius:8, background:'var(--color-surface-2)',
    animation:'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />;
}

function ChannelBadge({ channel }: { channel: string }) {
  const theme = useTheme();
  const isDark = !isLightColor(theme.colorBg);
  const c = getChColor(channel, isDark);
  return (
    <span style={{ display:'inline-block', backgroundColor:c.bg, border:`1px solid ${c.border}`,
      color:c.text, borderRadius:4, padding:'1px 6px', fontSize:'var(--font-small)', fontWeight:700, whiteSpace:'nowrap' as const }}>
      {channel}
    </span>
  );
}

// ── 고정 높이 테이블 ───────────────────────────────────────────────────────────
function FixedTable({ children }: { children: React.ReactNode }) {
  return <div style={{ height:280, overflowY:'auto', overflowX:'auto' }}>{children}</div>;
}

const dropStyle = {
  backgroundColor:'var(--color-surface-1)', border:'1px solid var(--color-accent)',
  borderRadius:6, padding:'2px 8px', fontSize:'var(--font-label)', fontWeight:700 as const,
  color:'var(--color-accent)', cursor:'pointer', outline:'none',
};

function daysRemaining(endDate: string): string {
  if (!endDate) return '—';
  const diff = Math.ceil((utcMs(endDate) - Date.now()) / 86400000);
  if (diff < 0) return `D+${Math.abs(diff)}`;
  if (diff === 0) return 'D-Day';
  return `D-${diff}`;
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { selectedRange, compareRange } = useDashboard();
  const theme  = useTheme();
  const router = useRouter();

  const [ovData,  setOvData]  = useState<any>(null);
  const [sumData, setSumData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [barKey,  setBarKey]  = useState('app');
  const [lineKey, setLineKey] = useState('cpa');
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);


  useEffect(() => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      d1:       selectedRange.end,
      selStart: selectedRange.start,
      selEnd:   selectedRange.end,
      cmpStart: compareRange.start,
      cmpEnd:   compareRange.end,
    });

    fetch(`/api/overview?${params}`)
      .then(r => r.json())
      .then(ov => {
        setOvData(ov);
        const latest: string = ov?.latestDate ?? selectedRange.end;

        // DashboardLayout에서 latestDate 세팅을 처리하므로 여기서는 생략
        // summary API: periodStart/periodEnd + compareRange 그대로 사용
        const pStart   = ov?.periodStart ?? latest;
        const pEnd     = ov?.periodEnd   ?? latest;
        // 비교기간은 DashboardLayout의 compareRange를 그대로 사용 (calcComparePeriod 결과)
        const cmpS = compareRange.start;
        const cmpE = compareRange.end;
        return fetch(`/api/summary?start=${pStart}&end=${pEnd}&cmpStart=${cmpS}&cmpEnd=${cmpE}`)
          .then(r => r.json())
          .then(sum => ({ sum, latest, adjStart: pStart, adjCmpStart: cmpS, adjCmpEnd: cmpE, pEnd }));
      })
      .then(({ sum, latest, adjStart, adjCmpStart, adjCmpEnd, pEnd }:
        { sum:any; latest:string; adjStart:string; adjCmpStart:string; adjCmpEnd:string; pEnd:string }) => {
        setSumData({ ...sum, _adjStart:adjStart, _latest:pEnd, _adjCmpStart:adjCmpStart, _adjCmpEnd:adjCmpEnd });
        setLoading(false);
      })
      .catch((e: any) => { setError(e.message ?? 'Load failed'); setLoading(false); });
  }, [selectedRange, compareRange]);

  // ── 날짜 변수 ───────────────────────────────────────────────────────────────
  const latestDate   = ovData?.latestDate ?? selectedRange.end;
  // 실제 clamp된 periodStart/periodEnd (API에서 반환)
  const periodStart  = ovData?.periodStart ?? latestDate;
  const periodEnd    = ovData?.periodEnd   ?? latestDate;
  const isSinglePeriod = periodStart === periodEnd;

  // Period Summary 표시 기간 (sum API 기준)
  const sumStart = sumData?._adjStart    ?? periodStart;
  const sumEnd   = sumData?._latest      ?? latestDate;
  const cmpStart = sumData?._adjCmpStart ?? compareRange.start;
  const cmpEnd   = sumData?._adjCmpEnd   ?? compareRange.end;

  // ── 스타일 ──────────────────────────────────────────────────────────────────
  const clickRow: React.CSSProperties = { cursor:'pointer' };
  // ── PERIOD SUMMARY = 항상 합계 (sumData.periodTotal) ──────────────────────
  const kpiData = sumData?.periodTotal ?? null;

  // ── 21-Day Trend (selectedRange에 반응) ──────────────────────────────────────
  // 선택기간 일별 데이터 (API에서 periodStart~periodEnd로 가져온 것)
  const trendSel = (ovData?.trendSel ?? []) as any[];
  const trendCmp = (ovData?.trendCmp ?? []) as any[];
  // 포지션 매칭: 선택기간 i번째 ↔ 비교기간 i번째
  const recentSlice = trendSel;
  const trendStart     = recentSlice.length > 0 ? toDateStr(recentSlice[0].date) : periodStart;
  const trendEnd       = recentSlice.length > 0 ? toDateStr(recentSlice[recentSlice.length-1].date) : periodEnd;
  const trendPrevStart = trendCmp.length > 0 ? toDateStr(trendCmp[0].date) : '';
  const trendPrevEnd   = trendCmp.length > 0 ? toDateStr(trendCmp[trendCmp.length-1].date) : '';

  // 포지션 매칭: 선택 i번째 ↔ 비교 i번째 (D-7 하드코딩 완전 제거)
  const trendChart = recentSlice.map((d: any, i: number) => {
    const dateStr = toDateStr(d.date);
    const p = trendCmp[i] as any;
    return {
      label:    dateStr.slice(5),
      fullDate: dateStr,
      prevDate: p ? toDateStr(p.date) : null,
      app:     Math.round(d.applicant ?? 0),
      cpa:     Math.round(d.cpa       ?? 0),
      prevApp: p ? Math.round(p.applicant ?? 0) : null,
      prevCpa: p ? Math.round(p.cpa       ?? 0) : null,
    };
  });

  // ── Channel 차트 ─────────────────────────────────────────────────────────────
  const channelSel    = (ovData?.channelSel  ?? []) as any[];
  const prevPeriodMap = new Map((ovData?.prevPeriod ?? []).map((d:any) => [d.media, d]));
  const channelChart  = channelSel.map((d:any) => {
    const p = prevPeriodMap.get(d.media) as any;
    return {
      channel:   d.media.replace(/_/g,' ').slice(0,14),
      selDate:   periodStart && periodEnd ? (periodStart === periodEnd ? periodStart : `${periodStart} ~ ${periodEnd}`) : '',
      prevDate:  (ovData?.prevStart && ovData?.prevEnd) ? (ovData.prevStart === ovData.prevEnd ? ovData.prevStart : `${ovData.prevStart} ~ ${ovData.prevEnd}`) : '',
      app:       +(d.applicant??0),  prevApp:   +(p?.applicant??0),
      cpa:       +(d.cpa??0),        prevCpa:   +(p?.cpa??0),
      click:     +(d.click??0),      prevClick: +(p?.click??0),
      cpc:       +(d.cpc??0),        prevCpc:   +(p?.cpc??0),
      cost:      +(d.cost??0),       prevCost:  +(p?.cost??0),
      cvr:       +(d.cvr??0),        prevCvr:   +(p?.cvr??0),
      imp:       +(d.imp??0),        prevImp:   +(p?.imp??0),
      ctr:       +(d.ctr??0),        prevCtr:   +(p?.ctr??0),
    };
  }).sort((a,b) => b.app-a.app);

  // ── 버블 차트 ────────────────────────────────────────────────────────────────
  const bubbleItems = (ovData?.bubble ?? []) as any[];
  const maxApp = Math.max(...bubbleItems.map((d:any) => d.applicant??0), 1);
  const bubbleData = bubbleItems.map((d:any) => ({
    x:Math.round(d.cpa??0), y:Math.round(d.applicant??0), cost:Math.round(d.cost??0),
    r:Math.max(18, Math.sqrt((d.applicant??0)/maxApp)*65), channel:d.media,
  }));

  // 비교기간 (Channel 차트)
  const chanCmpStart = ovData?.prevStart ?? addD(periodEnd||latestDate, -7);
  const chanCmpEnd   = ovData?.prevEnd   ?? addD(periodEnd||latestDate, -7);

  // Issue Channels = sumData.crisis (Overview Detail CrisisPanel과 동일 소스)
  const crisisChannels = ((sumData?.crisis ?? []) as any[]).filter((c: any) => c.isCrisis);
  const abTests         = (ovData?.abTests        ?? []) as any[];
  const newChannels     = (ovData?.newChannels    ?? []) as any[];
  const recentActions   = (ovData?.recentActions  ?? []) as any[];
  const truncate = (s:string, n:number) => s?.length>n ? s.slice(0,n)+'…' : (s??'');

  const chartControls = (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:'var(--font-small)', color:'var(--color-text-muted)' }}>Bar</span>
      <select value={barKey} onChange={e=>setBarKey(e.target.value)} style={dropStyle}>
        {BAR_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ fontSize:'var(--font-small)', color:'var(--color-text-muted)', marginLeft:4 }}>Line</span>
      <select value={lineKey} onChange={e=>setLineKey(e.target.value)} style={dropStyle}>
        {LINE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h1 style={{ fontWeight:700, color:'var(--color-text-primary)', fontSize:'var(--font-page-title)', margin:0 }}>
          📊 Overview
        </h1>
        {!loading && latestDate && latestDate !== selectedRange.end && (
          <span style={{ fontSize:'var(--font-label)', color:'var(--color-chart-line)', background:'rgba(245,158,11,0.1)',
            border:'1px solid rgba(245,158,11,0.3)', borderRadius:6, padding:'3px 10px' }}>
            ⚠️ Latest data: {latestDate}
          </span>
        )}
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
          borderRadius:10, padding:'12px 16px', color:'var(--color-delta-neg)', fontSize:'var(--font-table-body)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── 1. PERIOD SUMMARY ── */}
      <div>
        <div style={{ marginBottom:8, paddingLeft:2 }}>
          <span style={{ fontWeight:700, color:'var(--color-text-muted)', fontSize:'var(--font-section-title)' }}>
            📅 Period Summary
            <DateLabel selStart={sumStart} selEnd={sumEnd} cmpStart={cmpStart} cmpEnd={cmpEnd} />
          </span>
        </div>
        <KPIGrid
          imp={kpiData?.imp??0} click={kpiData?.click??0}
          cost={kpiData?.cost??0} applicant={kpiData?.applicant??0}
          ctr={kpiData?.ctr??0} cvr={kpiData?.cvr??0}
          cpc={kpiData?.cpc??0} cpa={kpiData?.cpa??0}
          deltaPercent={sumData?.periodDeltaPercent ?? undefined}
          loading={loading}
        />
      </div>

      {/* ── 2. Performance Trend ── */}
      <TrendChart
        data={trendSel}
        compareData={trendCmp}
        loading={loading}
        title={ST('📈 Performance Trend', trendStart, trendEnd, trendPrevStart, trendPrevEnd)}
      />

      {/* ── 3. Channel Performance | Scatter ── */}
      <div className="cls-grid-2">
        <Section
          noBorder
          title={ST('📊 Channel Performance', periodStart, periodEnd, chanCmpStart, chanCmpEnd, !isSinglePeriod)}
          headerRight={chartControls}
        >
          <ChannelBarChart data={channelChart} loading={loading} barKey={barKey} lineKey={lineKey} />
        </Section>

        <Section noBorder title={ST('🫧 Channel Scatter', periodStart, periodEnd, undefined, undefined, !isSinglePeriod)}>
          <OverviewBubbleChart data={bubbleData} loading={loading}
            onChannelClick={ch => router.push(`/channel-detail?media=${encodeURIComponent(ch)}`)} />
        </Section>
      </div>

      {/* ── 4. Issue Channels | New Channels ── */}
      <div className="cls-grid-2">
        <Section
          noBorder
          title={ST('⚠️ Issue Channels', latestDate, latestDate)}
          headerRight={
            <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' as const }}>
              전주 동요일 대비 Delta(%)
            </span>
          }
        >
          {loading ? <Skeleton h={280} /> : crisisChannels.length === 0 ? (
            <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--color-text-muted)', fontSize:'var(--font-table-body)' }}>No issue channels ✓</div>
          ) : (
            <FixedTable>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>Channel</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Δ App</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Δ Click</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Δ CPC</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Δ CPA</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Δ CVR</th>
                </tr></thead>
                <tbody>
                  {crisisChannels.map((row:any) => (
                    <tr key={row.media} style={clickRow}
                      onClick={() => router.push('/overview-detail#crisis')}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ ...tdStyle }}><ChannelBadge channel={row.media} /></td>
                      {[
                        { val: row.d1VsPrevWeek?.applicant ?? 0, inv: false },
                        { val: row.d1VsPrevWeek?.click     ?? 0, inv: false },
                        { val: row.d1VsPrevWeek?.cpc       ?? 0, inv: true  },
                        { val: row.d1VsPrevWeek?.cpa       ?? 0, inv: true  },
                        { val: row.d1VsPrevWeek?.cvr       ?? 0, inv: false },
                      ].map((item, idx) => (
                        <td key={idx} style={{ ...tdStyle, textAlign:'right' }}>
                          <span style={{ fontWeight:700, ...deltaStyle(item.val, item.inv) }}>
                            {item.val >= 0 ? '+' : ''}{fmt.pct(item.val)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </FixedTable>
          )}
        </Section>

        <Section noBorder title="🆕 New Channels · first live within 28D">
          {loading ? <Skeleton h={280} /> : newChannels.length === 0 ? (
            <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--color-text-muted)', fontSize:'var(--font-table-body)' }}>No new channels in last 28 days</div>
          ) : (
            <FixedTable>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>Channel</th>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>First Live</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Cost/day</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>App/day</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>CPA</th>
                </tr></thead>
                <tbody>
                  {newChannels.map((ch:any) => (
                    <tr key={ch.media} style={clickRow}
                      onClick={() => router.push(`/channel-detail?media=${encodeURIComponent(ch.media)}`)}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={tdStyle}><ChannelBadge channel={ch.media} /></td>
                      <td style={{ ...tdStyle,  color:'var(--color-text-tertiary)' }}>{toDateStr(ch.first_live)}</td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>₩{fmt.number(ch.cost??0)}</td>
                      <td style={{ ...tdStyle, textAlign:'right', color:'var(--color-accent)', fontWeight:700 }}>
                        {fmt.number(ch.applicant)}
                      </td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>₩{fmt.number(ch.cpa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FixedTable>
          )}
        </Section>
      </div>

      {/* ── 5. A/B Tests | Recent Actions ── */}
      <div className="cls-grid-2">
        <Section noBorder title="🧪 Active A/B Tests">
          {loading ? <Skeleton h={280} /> : abTests.length === 0 ? (
            <EmptyState icon="🧪" title="진행 중인 A/B 테스트 없음" style={{ height: 280 }} />
          ) : (
            <FixedTable>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>Channel</th>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>Test Name</th>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>Start</th>
                  <th style={{ ...thStickyStyle, textAlign:'left'  }}>End</th>
                  <th style={{ ...thStickyStyle, textAlign:'right' }}>Remaining</th>
                </tr></thead>
                <tbody>
                  {abTests.map((t:any) => {
                    const remaining = daysRemaining(toDateStr(t.test_date_end));
                    const isExpired = remaining.startsWith('D+');
                    return (
                      <tr key={t.test_id}>
                        <td style={{ ...tdStyle, ...clickRow }}
                          onClick={() => router.push(`/a-b-test?highlight=${t.test_id}`)}>
                          {(t.channels??[]).length>0
                            ? (t.channels as string[]).map((ch:string)=>(
                                <span key={ch} style={{ marginRight:4, display:'inline-block', marginBottom:2 }}>
                                  <ChannelBadge channel={ch} />
                                </span>
                              ))
                            : <span style={{ color:'var(--color-text-muted)', fontSize:'var(--font-label)' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, ...clickRow, color:'var(--color-text-secondary)' }}
                          onClick={() => router.push(`/a-b-test?highlight=${t.test_id}`)}>
                          {t.test_name}
                        </td>
                        <td style={{ ...tdStyle, ...clickRow,  color:'var(--color-text-tertiary)', whiteSpace:'nowrap' as const }}
                          onClick={() => router.push(`/a-b-test?highlight=${t.test_id}`)}>
                          {toDateStr(t.test_date_start)||'—'}
                        </td>
                        <td style={{ ...tdStyle, ...clickRow,  color:'var(--color-text-tertiary)', whiteSpace:'nowrap' as const }}
                          onClick={() => router.push(`/a-b-test?highlight=${t.test_id}`)}>
                          {toDateStr(t.test_date_end)||'—'}
                        </td>
                        <td style={{ ...tdStyle, ...clickRow, textAlign:'right', fontWeight:700,
                          color:isExpired?'var(--color-text-muted)':remaining==='D-Day'?'var(--color-chart-line)':'var(--color-accent)' }}
                          onClick={() => router.push(`/a-b-test?highlight=${t.test_id}`)}>
                          {remaining}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </FixedTable>
          )}
        </Section>

        <Section noBorder title={ST('📝 Recent Actions', addD(latestDate||selectedRange.end,-6), latestDate||selectedRange.end)}>
          {loading ? <Skeleton h={280} /> : recentActions.length === 0 ? (
            <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--color-text-muted)', fontSize:'var(--font-table-body)' }}>No recent actions in last 7 days</div>
          ) : (
            <FixedTable>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStickyStyle, textAlign:'left' }}>Date</th>
                  <th style={{ ...thStickyStyle, textAlign:'left' }}>Channel</th>
                  <th style={{ ...thStickyStyle, textAlign:'left' }}>Type</th>
                  <th style={{ ...thStickyStyle, textAlign:'left' }}>Description</th>
                </tr></thead>
                <tbody>
                  {recentActions.map((r:any, idx:number) => (
                    <tr key={idx} style={clickRow}
                      onClick={() => router.push(`/action-record?highlight=${encodeURIComponent(r.id||'')}`)}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ ...tdStyle,  color:'var(--color-text-tertiary)', whiteSpace:'nowrap' as const }}>
                        {toDateStr(r.date)}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace:'nowrap' as const }}>
                        <ChannelBadge channel={r.channel} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace:'nowrap' as const }}>
                        <span style={{ display:'inline-block', background:'var(--color-surface-2)',
                          border:'1px solid var(--color-border-default)', color:'var(--color-text-tertiary)',
                          borderRadius:4, padding:'1px 6px', fontSize:'var(--font-small)' }}>{r.type??'—'}</span>
                      </td>
                      <td style={{ ...tdStyle, color:'var(--color-text-tertiary)', maxWidth:200 }}>{truncate(r.description,42)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FixedTable>
          )}
        </Section>
      </div>

    </div>
  );
}
