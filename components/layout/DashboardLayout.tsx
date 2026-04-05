'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, Suspense } from 'react';
import { useChannels } from '@/lib/useChannels';
import Link from 'next/link';
import { SAHeaderFilter } from '@/components/sa/SAFilterBar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DateRange } from '@/lib/types';
import { calcComparePeriod, getPresetRange, getD1, QuickSelect } from '@/lib/dateUtils';
import { ThemeProvider } from '@/components/ui/ThemeEditor';

// ─── Dashboard Context ────────────────────────────────────────────────────────
interface DashboardContextType {
  selectedRange: DateRange;
  compareRange: DateRange;
  dateReady: boolean;
  latestDate: string;
  activePreset: QuickSelect | null;
  setSelectedRange: (r: DateRange) => void;
  setCompareRange: (r: DateRange) => void;
  applyPreset: (p: QuickSelect) => void;
  setLatestDate: (d: string) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);
export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

// ─── 탭 정의 ─────────────────────────────────────────────────────────────────
const TABS = [
  { label: '📊 Overview',        href: '/' },
  { label: '📋 Overview Detail', href: '/overview-detail' },
  { label: '🤖 Channel Detail + AI Agent',  href: '/channel-detail' },
  { label: '🔎 SA Detail',       href: '/sa-detail' },
  { label: '💰 Budget Planner',  href: '/budget-planner' },
  { label: '🧪 A/B Test',        href: '/a-b-test' },
  { label: '💡 Insights',        href: '/insights' },
  { label: '📝 Action Record',   href: '/action-record' }, 
  { label: '🎨 Theme',           href: '/theme' },
];

const QUICK_PRESETS: { label: string; value: QuickSelect }[] = [
  { label: '1일',  value: '1d' },
  { label: '7일',  value: '7d' },
  { label: '14일', value: '14d' },
  { label: '21일', value: '21d' },
  { label: '이달', value: 'thisMonth' },
];

// ─── DateInput ───────────────────────────────────────────────────────────────
function DateInput({ label, value, onChange, min, max }: {
  label: string; value: string; onChange: (v: string) => void;
  min?: string; max?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: 'var(--font-table-header)', fontWeight: 600,
        color: 'var(--color-text-muted)', letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <input
        type="date" value={value} min={min} max={max}
        onChange={e => onChange(e.target.value)}
        style={{
          backgroundColor: 'var(--color-surface-2)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 10px',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--font-table-body)',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color var(--transition-fast)',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--color-border-default)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        onMouseEnter={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}
        onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
      />
    </div>
  );
}

// ─── SyncButton ──────────────────────────────────────────────────────────────
function SyncButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const handleSync = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    setMsg('');
    try {
      const res = await fetch('/api/sync-bigquery', { method: 'POST' });
      const data = await res.json();
      if (data.ok) { setStatus('success'); setMsg('동기화 완료'); }
      else { setStatus('error'); setMsg(data.message ?? '오류 발생'); }
    } catch {
      setStatus('error'); setMsg('네트워크 오류');
    } finally {
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-nav-tab)', fontWeight: 600,
    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
    border: '1px solid',
    transition: 'all var(--transition-fast)',
    ...(status === 'idle'    && { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-default)' }),
    ...(status === 'loading' && { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }),
    ...(status === 'success' && { backgroundColor: 'var(--color-success-muted)', color: 'var(--color-success)', borderColor: 'var(--color-success)' }),
    ...(status === 'error'   && { backgroundColor: 'var(--color-error-muted)', color: 'var(--color-error)', borderColor: 'var(--color-error)' }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button onClick={handleSync} disabled={status === 'loading'} style={btnStyle} title="시트 → BigQuery 동기화">
        <span style={status === 'loading' ? { display: 'inline-block', animation: 'spin 1s linear infinite' } : {}}>🔄</span>
        {status === 'loading' ? '동기화 중...' : 'DB 동기화'}
      </button>
      {msg && (
        <span style={{ fontSize: 'var(--font-small)', color: status === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
          {msg}
        </span>
      )}
    </div>
  );
}

// ─── Budget Planner 전용 채널+기간 컨트롤 ────────────────────────────────────
function BudgetPlannerControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const days = Number(searchParams.get('days') ?? '90');
  const mediaParam = searchParams.get('media') ?? '';
  const { selectedRange, compareRange } = useDashboard();
  const chRange = { selStart: selectedRange.start, selEnd: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end };
  const { channels, loading: chLoading } = useChannels(chRange);

  // 채널 로드 후 URL에 media 없으면 첫 번째 채널로 자동 세팅
  useEffect(() => {
    if (!mediaParam && channels.length > 0) {
      router.replace(`/budget-planner?days=${days}&media=${encodeURIComponent(channels[0])}`);
    }
  }, [channels, mediaParam]); // eslint-disable-line

  const media = mediaParam || channels[0] || '';

  const navigate = (newDays: number, newMedia: string) => {
    router.push(`/budget-planner?days=${newDays}&media=${encodeURIComponent(newMedia)}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[30, 60, 90, 180].map(d => (
          <button key={d} onClick={() => navigate(d, media)}
            style={{
              fontSize: 'var(--font-label)', padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontWeight: 700,
              backgroundColor: days === d ? 'var(--color-accent)' : 'transparent',
              color: days === d ? '#fff' : 'var(--color-text-secondary)',
              border: 'none',
              cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}>
            {d}일
          </button>
        ))}
      </div>
      <div style={{ borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: 8 }}>
        {chLoading ? (
          <span style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', padding: '3px 8px' }}>로딩...</span>
        ) : (
          <select value={media} onChange={e => navigate(days, e.target.value)}
            style={{
              backgroundColor: 'var(--color-surface-1)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)', padding: '3px 8px',
              fontSize: 'var(--font-label)', fontWeight: 700,
              color: 'var(--color-accent)', cursor: 'pointer', outline: 'none', minWidth: 140,
            }}>
            {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// ─── Channel Select Dropdown (Channel Detail 전용) ────────────────────────────
function ChannelRadioSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMedia = searchParams.get('media') ?? '';
  const [channels, setChannels] = useState<string[]>([]);
  const { selectedRange, compareRange } = useDashboard();

  useEffect(() => {
    const params = new URLSearchParams({
      selStart: selectedRange.start,
      selEnd: selectedRange.end,
      cmpStart: compareRange.start,
      cmpEnd: compareRange.end,
    });
    fetch(`/api/channels?${params}`)
      .then(r => r.json())
      .then(d => setChannels(d.channels ?? []))
      .catch(() => {});
  }, [selectedRange.start, selectedRange.end, compareRange.start, compareRange.end]);

  if (!channels.length) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: 12,
    }}>
      <span style={{ fontSize: 'var(--font-small)', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
        Channel
      </span>
      <select
        value={currentMedia}
        onChange={e => router.push(`/channel-detail?media=${encodeURIComponent(e.target.value)}`)}
        style={{
          backgroundColor: 'var(--color-surface-1)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          fontSize: 'var(--font-label)', fontWeight: 700,
          color: 'var(--color-accent)', cursor: 'pointer', outline: 'none', minWidth: 140,
        }}
      >
        {!currentMedia && <option value="">-- 채널 선택 --</option>}
        {channels.map(ch => (
          <option key={ch} value={ch}>{ch}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
function VDivider() {
  return (
    <div style={{ width: 1, height: 32, backgroundColor: 'var(--color-border-default)', flexShrink: 0 }}
      className="hidden sm:block" />
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
function DashboardHeader() {
  const pathname = usePathname();
  const { selectedRange, compareRange, latestDate, dateReady, activePreset, setSelectedRange, setCompareRange, applyPreset } = useDashboard();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false); // MO 배너 접기/펼치기

  const isChannelDetail = pathname === '/channel-detail';
  const isBudgetPlanner = pathname === '/budget-planner';
  const isSADetail      = pathname === '/sa-detail';

  return (
    <header
      className="sticky top-0 w-full"
      style={{
        backgroundColor: 'var(--color-surface-1)',
        borderBottom: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-md)',
        zIndex: 'var(--z-sticky)',
      }}
    >
      {/* Row 1: Logo + Tabs */}
      <div style={{ borderBottom: '1px solid var(--color-border-subtle)', padding: '0 16px' }}
        className="md:px-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, height: 48, maxWidth: 1600, margin: '0 auto' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 24, flexShrink: 0 }}>
            <span style={{ fontWeight: 900, color: 'var(--color-accent)', fontSize: 'var(--font-kpi-label)', letterSpacing: 'var(--tracking-tight)' }}>
              Demo
            </span>
            <span className="hidden sm:block" style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, fontSize: 'var(--font-small)' }}>
              Dashboard
            </span>
          </div>

          {/* Tabs — desktop only (md+) */}
          <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 4, flex: 1, overflowX: 'auto' }}>
            {TABS.map(tab => {
              const active = pathname === tab.href;
              return (
                <Link key={tab.href} href={tab.href}
                  style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-nav-tab)', fontWeight: 600, whiteSpace: 'nowrap',
                    transition: 'all var(--transition-fast)', textDecoration: 'none',
                    ...(active
                      ? { backgroundColor: 'var(--color-accent)', color: '#fff', boxShadow: 'var(--shadow-accent)' }
                      : { backgroundColor: 'transparent', color: 'var(--color-text-tertiary)' }
                    ),
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile: hamburger only (탭은 햄버거 메뉴로만 이동) */}
          <button
            className="md:hidden"
            style={{ marginLeft: 'auto', padding: 8, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setMobileOpen(o => !o)}
          >
            <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>

          {/* Mobile dropdown menu */}
          {mobileOpen && (
            <div
              className="absolute md:hidden"
              style={{
                top: 48, left: 0, right: 0,
                backgroundColor: 'var(--color-surface-1)',
                borderBottom: '1px solid var(--color-border-subtle)',
                zIndex: 'var(--z-dropdown)',
              }}
            >
              {TABS.map(tab => (
                <Link key={tab.href} href={tab.href} onClick={() => setMobileOpen(false)}
                  style={{
                    display: 'block', padding: '12px 16px',
                    fontSize: 'var(--font-nav-tab)', fontWeight: 500, textDecoration: 'none',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    color: pathname === tab.href ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    backgroundColor: pathname === tab.href ? 'var(--color-accent-muted)' : 'transparent',
                  }}>
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: 날짜 피커 / Budget Planner 컨트롤 */}
      <div style={{ padding: '0 16px' }} className="md:px-6">

        {/* ── PC (md+): 기존과 동일, 절대 변경 없음 ── */}
        <div className="hidden md:block">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '10px 0', maxWidth: 1600, margin: '0 auto' }}>
            {isBudgetPlanner ? (
              <>
                <Suspense fallback={null}><BudgetPlannerControls /></Suspense>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <SyncButton />
                </div>
              </>
            ) : (
              <>
                {/* 선택 기간 */}
                {!dateReady ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} className="skeleton" style={{ width: 130, height: 52 }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <DateInput label="기준 시작" value={selectedRange.start}
                      max={selectedRange.end}
                      onChange={v => setSelectedRange({ ...selectedRange, start: v })} />
                    <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>~</span>
                    <DateInput label="기준 종료" value={selectedRange.end}
                      min={selectedRange.start} max={latestDate || undefined}
                      onChange={v => setSelectedRange({ ...selectedRange, end: v })} />
                  </div>
                )}
                <VDivider />
                {/* 비교 기간 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <DateInput label="비교 시작" value={compareRange.start}
                    onChange={v => setCompareRange({ ...compareRange, start: v })} />
                  <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>~</span>
                  <DateInput label="비교 종료" value={compareRange.end}
                    onChange={v => setCompareRange({ ...compareRange, end: v })} />
                </div>
                <VDivider />
                {/* 빠른 프리셋 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {QUICK_PRESETS.map(p => (
                    <button key={p.value} onClick={() => applyPreset(p.value)}
                      style={{
                        padding: '3px 10px', borderRadius: 6,
                        fontSize: 'var(--font-label)', fontWeight: 600, cursor: 'pointer',
                        backgroundColor: activePreset === p.value ? 'var(--color-accent)' : 'transparent',
                        color: activePreset === p.value ? '#fff' : 'var(--color-text-secondary)',
                        border: 'none',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {/* Latest date 배지 */}
                <span style={{
                  fontSize: 'var(--font-small)', color: 'var(--color-text-muted)',
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)', padding: '3px 8px', whiteSpace: 'nowrap',
                }}>
                  📅 Latest: {latestDate}
                </span>
                {isChannelDetail && (
                  <Suspense fallback={null}><ChannelRadioSelector /></Suspense>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <SyncButton />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Row 3: SA Detail 전용 필터 (PC, md+) ── */}
        {isSADetail && (
          <div className="hidden md:block md:px-6" style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '0 16px' }}>
            <Suspense fallback={null}><SAHeaderFilter /></Suspense>
          </div>
        )}

        {/* ── MO only (md 미만) ── */}
        <div className="md:hidden">
          {isBudgetPlanner ? (
            <div style={{ padding: '8px 0' }}>
              <Suspense fallback={null}><BudgetPlannerControls /></Suspense>
            </div>
          ) : (
            <>
              {/* 항상 표시: 기준 시작 ~ 기준 종료 + 접기/펼치기 버튼 */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 0' }}>
                {!dateReady ? (
                  <>
                    <div className="skeleton" style={{ width: 120, height: 52 }} />
                    <div className="skeleton" style={{ width: 120, height: 52 }} />
                  </>
                ) : (
                  <>
                    <DateInput label="기준 시작" value={selectedRange.start}
                      max={selectedRange.end}
                      onChange={v => setSelectedRange({ ...selectedRange, start: v })} />
                    <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>~</span>
                    <DateInput label="기준 종료" value={selectedRange.end}
                      min={selectedRange.start} max={latestDate || undefined}
                      onChange={v => setSelectedRange({ ...selectedRange, end: v })} />
                  </>
                )}
                {/* 접기/펼치기 버튼 */}
                <button
                  onClick={() => setMobileExpanded(o => !o)}
                  style={{
                    marginLeft: 'auto', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '6px 10px', borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-small)', fontWeight: 600, cursor: 'pointer',
                    backgroundColor: mobileExpanded ? 'var(--color-accent-muted)' : 'var(--color-surface-2)',
                    color: mobileExpanded ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    border: `1px solid ${mobileExpanded ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
                    transition: 'all var(--transition-fast)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <svg
                    style={{
                      width: 13, height: 13,
                      transition: 'transform 0.2s',
                      transform: mobileExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  {mobileExpanded ? '접기' : '더보기'}
                </button>
              </div>

              {/* 펼쳤을 때: 비교기간 + 프리셋 + Latest + Sync */}
              {mobileExpanded && (
                <div style={{ paddingBottom: 10 }}>
                  {/* 비교 기간 */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 10 }}>
                    <DateInput label="비교 시작" value={compareRange.start}
                      onChange={v => setCompareRange({ ...compareRange, start: v })} />
                    <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', paddingBottom: 8 }}>~</span>
                    <DateInput label="비교 종료" value={compareRange.end}
                      onChange={v => setCompareRange({ ...compareRange, end: v })} />
                  </div>

                  {/* 빠른 프리셋 + Latest */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
                    {QUICK_PRESETS.map(p => (
                      <button key={p.value} onClick={() => applyPreset(p.value)}
                        style={{
                          padding: '5px 10px', borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-nav-tab)', fontWeight: 600, cursor: 'pointer',
                          backgroundColor: 'var(--color-surface-2)',
                          color: 'var(--color-text-tertiary)',
                          border: '1px solid var(--color-border-default)',
                          transition: 'all var(--transition-fast)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--color-accent-muted)';
                          e.currentTarget.style.color = 'var(--color-accent)';
                          e.currentTarget.style.borderColor = 'var(--color-accent)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'var(--color-surface-2)';
                          e.currentTarget.style.color = 'var(--color-text-tertiary)';
                          e.currentTarget.style.borderColor = 'var(--color-border-default)';
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                    <span style={{
                      fontSize: 'var(--font-small)', color: 'var(--color-text-muted)',
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)', padding: '3px 8px', whiteSpace: 'nowrap',
                    }}>
                      📅 Latest: {latestDate}
                    </span>
                  </div>

                  {isChannelDetail && (
                    <div style={{ paddingBottom: 8 }}>
                      <Suspense fallback={null}><ChannelRadioSelector /></Suspense>
                    </div>
                  )}

                  {isSADetail && (
                    <div style={{ paddingBottom: 8 }}>
                      <Suspense fallback={null}><SAHeaderFilter /></Suspense>
                    </div>
                  )}

                  {/* DB 동기화 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SyncButton />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </header>
  );
}

// ─── Provider + Layout ────────────────────────────────────────────────────────
export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const d1 = getD1();
  const defaultSelected: DateRange = { start: d1, end: d1 };

  const [latestDate, setLatestDate] = useState<string>('');
  const [selectedRange, setSelectedRangeState] = useState<DateRange | null>(null);
  const [compareRange, setCompareRangeState] = useState<DateRange | null>(null);
  const [activePreset, setActivePreset] = useState<QuickSelect>('1d');

  useEffect(() => {
    fetch(`/api/overview?d1=${d1}`)
      .then(r => r.json())
      .then(data => {
        const latest = data?.latestDate ?? d1;
        const sel = { start: latest, end: latest };
        setLatestDate(latest);
        setSelectedRangeState(sel);
        setCompareRangeState(calcComparePeriod(sel));
        setActivePreset('1d');
      })
      .catch(() => {
        const sel = { start: d1, end: d1 };
        setLatestDate(d1);
        setSelectedRangeState(sel);
        setCompareRangeState(calcComparePeriod(sel));
        setActivePreset('1d');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setSelectedRange = useCallback((r: DateRange) => {
    setSelectedRangeState(r);
    setCompareRangeState(calcComparePeriod(r));
    setActivePreset(null as any);
  }, []);

  const dateReady = selectedRange !== null && compareRange !== null;
  const safeSelected = selectedRange ?? defaultSelected;
  const safeCompare  = compareRange ?? calcComparePeriod(defaultSelected);
  const setCompareRange = useCallback((r: DateRange) => setCompareRangeState(r), []);
  const applyPreset = useCallback((preset: QuickSelect, latest?: string) => {
    const base = latest || latestDate || d1;
    const range = getPresetRange(preset, base);
    setSelectedRangeState(range);
    setCompareRangeState(calcComparePeriod(range));
    setActivePreset(preset);
  }, [latestDate]);

  return (
    <DashboardContext.Provider value={{
      selectedRange: safeSelected, compareRange: safeCompare,
      latestDate, dateReady, activePreset,
      setSelectedRange, setCompareRange, applyPreset, setLatestDate,
    }}>
      <ThemeProvider>
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
          <DashboardHeader />
          <main style={{ padding: '24px 16px', maxWidth: 1600, margin: '0 auto' }}
            className="md:px-6">
            {children}
          </main>
        </div>
      </ThemeProvider>
    </DashboardContext.Provider>
  );
}
