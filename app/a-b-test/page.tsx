'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { getChColor } from '@/lib/channelColors';
import { useTheme } from '@/components/ui/ThemeEditor';
import { isLightColor } from '@/lib/theme';
import { useSearchParams } from 'next/navigation';
import { fmt } from '@/lib/calculations';
import { calcABStats } from '@/lib/abTestStats';
import type { MetricsRow } from '@/lib/types';
import EmptyState from '@/components/ui/EmptyState';
import { useChannels } from '@/lib/useChannels';
import { useDashboard } from '@/components/layout/DashboardLayout';

const IS_PORTFOLIO_CLIENT = process.env.NEXT_PUBLIC_PORTFOLIO_MODE === 'true';
const JOB_TYPES = IS_PORTFOLIO_CLIENT
  ? ['프로젝트1','프로젝트2','프로젝트3','프로젝트4','프로젝트5','프로젝트6'] as const
  : ['Helper','HL','MCL','FA','FO','CPF','S-FA'] as const;
function hexToRgb(hex: string) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [14, 165, 233];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
type JobType = typeof JOB_TYPES[number];
const JOB_GROUP: Record<string, JobType[]> = {
  '전체': JOB_TYPES as unknown as JobType[],
  '일용직': ['Helper'],
  '계약직': ['HL','MCL','FA','FO','CPF','S-FA'],
  '그룹A': ['프로젝트1'],
  '그룹B': ['프로젝트2','프로젝트3','프로젝트4','프로젝트5','프로젝트6'],
};


// 대체공휴일 적용 대상 공휴일
const SUBSTITUTE_ELIGIBLE = new Set([
  '삼일절','어린이날','광복절','개천절','한글날','성탄절',
  '부처님오신날','설날','추석','설날연휴','추석연휴',
]);

// 기본 공휴일 (신정·현충일은 대체공휴일 대상 아님)
// 부처님오신날은 음력이라 연도별 하드코딩
const BASE_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01':'신정',
  '2025-01-28':'설날연휴','2025-01-29':'설날','2025-01-30':'설날연휴',
  '2025-03-01':'삼일절',
  '2025-05-05':'어린이날',
  '2025-05-06':'부처님오신날', // 음력 4/8
  '2025-06-06':'현충일',
  '2025-08-15':'광복절',
  '2025-10-03':'개천절',
  '2025-10-05':'추석연휴','2025-10-06':'추석','2025-10-07':'추석연휴',
  '2025-10-09':'한글날',
  '2025-12-25':'성탄절',
  // 2026
  '2026-01-01':'신정',
  '2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴',
  '2026-03-01':'삼일절',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날', // 음력 4/8
  '2026-06-06':'현충일',
  '2026-08-15':'광복절',
  '2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴',
  '2026-10-03':'개천절',
  '2026-10-09':'한글날',
  '2026-12-25':'성탄절',
};

function ds2(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function calcKRHolidays(): Map<string, string> {
  const map = new Map<string, string>(Object.entries(BASE_HOLIDAYS));

  // 대체공휴일 계산: 적용 대상 공휴일이 토/일 또는 다른 공휴일과 겹칠 때
  // 다음 첫 번째 비공휴일 평일을 대체공휴일로 지정
  const allDates = new Set(map.keys());

  for (const [dateStr, name] of Object.entries(BASE_HOLIDAYS)) {
    if (!SUBSTITUTE_ELIGIBLE.has(name)) continue;
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay(); // 0=일, 6=토

    // 주말과 겹치거나 다른 공휴일과 겹치는 경우
    // (주말과 겹치는 경우만 체크 — 공휴일 중복은 설/추석 연휴 구조상 자연 처리됨)
    if (dow === 0 || dow === 6) {
      const candidate = new Date(d);
      candidate.setDate(candidate.getDate() + 1);
      // 다음 평일이면서 공휴일이 아닌 날 찾기
      while (
        candidate.getDay() === 0 ||
        candidate.getDay() === 6 ||
        allDates.has(ds2(candidate.getFullYear(), candidate.getMonth()+1, candidate.getDate()))
      ) {
        candidate.setDate(candidate.getDate() + 1);
      }
      const subKey = ds2(candidate.getFullYear(), candidate.getMonth()+1, candidate.getDate());
      if (!map.has(subKey)) {
        map.set(subKey, `${name} 대체`);
        allDates.add(subKey);
      }
    }
  }

  return map;
}

const KR_HOLIDAYS = calcKRHolidays();
const DOW_KR = ['일','월','화','수','목','금','토'];

const COLS = [
  { key: 'imp',       label: 'IMP',   fmtFn: (v: number) => fmt.number(v) },
  { key: 'click',     label: 'CLICK', fmtFn: (v: number) => fmt.number(v) },
  { key: 'ctr',       label: 'CTR',   fmtFn: (v: number) => fmt.pct(v) },
  { key: 'cost',      label: 'COST',  fmtFn: (v: number) => fmt.cost(v),  invert: true },
  { key: 'cpc',       label: 'CPC',   fmtFn: (v: number) => fmt.cost(v),  invert: true },
  { key: 'applicant', label: 'APP',   fmtFn: (v: number) => fmt.number(v) },
  { key: 'cpa',       label: 'CPA',   fmtFn: (v: number) => fmt.cost(v),  invert: true },
  { key: 'cvr',       label: 'CVR',   fmtFn: (v: number) => fmt.pct(v) },
] as const;

interface TestRow {
  id: string; label: string; group: 'control' | 'test';
  media: string; campaign: string; ad_group: string; ad: string;
  dateStart: string; dateEnd: string; metrics?: MetricsRow;
}
interface ABTest {
  test_id: string; test_name: string; description: string;
  test_rows: TestRow[]; ai_comment: string | null; created_at: string;
  test_date_start?: string; test_date_end?: string;
  job_type?: string;
}

function getLevel(row: Omit<TestRow,'metrics'>): number {
  if (row.ad) return 4; if (row.ad_group) return 3;
  if (row.campaign) return 2; if (row.media) return 1; return 0;
}
function findBestIdx(rows: TestRow[], col: { key: string; invert?: boolean }): number {
  const vals = rows.map(r => (r.metrics as any)?.[col.key] ?? null);
  const valid = vals.filter(v => v !== null) as number[];
  if (!valid.length) return -1;
  const best = (col as any).invert ? Math.min(...valid) : Math.max(...valid);
  return vals.indexOf(best);
}

// ─── DynamicSelect ────────────────────────────────────────────────────────────
function DynamicSelect({ value, onChange, fetchUrl, placeholder, disabled=false, error=false, title='' }: {
  value: string; onChange: (v: string) => void; fetchUrl: string|null;
  placeholder: string; disabled?: boolean; error?: boolean; title?: string;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fetchUrl) { setOptions([]); return; }
    setLoading(true);
    fetch(fetchUrl).then(r => r.json()).then(d => setOptions(d.values ?? [])).catch(() => setOptions([])).finally(() => setLoading(false));
  }, [fetchUrl]);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled||loading||!fetchUrl}
      title={title||value||placeholder}
      className={`w-full bg-surface-2 rounded px-2 py-1.5 text-text-secondary focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${error ? 'border border-red-500' : 'border border-def focus:border-accent'}`}
      style={{ fontSize: 'var(--font-body)' }}>
      <option value="">{loading ? '로딩...' : placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── StatsPanel ───────────────────────────────────────────────────────────────
function StatsPanel({ rows }: { rows: TestRow[] }) {
  const ctrl = rows.filter(r => r.group==='control' && r.metrics);
  const test = rows.filter(r => r.group==='test' && r.metrics);
  if (!ctrl.length || !test.length) return null;
  const avg = (arr: TestRow[], key: keyof MetricsRow) => arr.reduce((s,r) => s+((r.metrics as any)[key]??0),0)/arr.length;
  const stats = calcABStats(Math.round(avg(ctrl,'applicant')),Math.round(avg(ctrl,'click')),Math.round(avg(test,'applicant')),Math.round(avg(test,'click')));
  const pDisplay = stats.pValue < 0.0001 ? '< 0.0001' : stats.pValue.toFixed(4);
  const sigBadge = stats.significant ? <span className="badge-good">✅ 유의미 (p&lt;0.05)</span>
    : stats.pValue < 0.1 ? <span className="badge-warn">⚠️ 경계 (p&lt;0.1)</span>
    : <span className="badge-crisis">❌ 미유의 (p≥0.1)</span>;
  return (
    <div className="mt-4 border border-def rounded-xl p-4">
      <h4 className="font-bold uppercase mb-3" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-tertiary)', letterSpacing: 'var(--tracking-wide)' }}>📐 통계적 유의성 분석 (CVR 기준)</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ fontSize: 'var(--font-body)' }}>
        <div><div className="text-text-muted mb-1">P-value</div><div className="font-bold text-text-secondary">{pDisplay}</div><div className="mt-1">{sigBadge}</div></div>
        <div><div className="text-text-muted mb-1">95% 신뢰구간 (Variant CVR)</div><div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-primary)', fontWeight: 700 }}>[ {fmt.pct(stats.confidenceInterval[0])} ~ {fmt.pct(stats.confidenceInterval[1])}]</div></div>
        <div><div className="text-text-muted mb-1">베이지안 승률 (Variant &gt; Control)</div><div className="font-bold" style={{fontSize:'var(--font-kpi-value)',color:stats.bayesianWinProbability>0.8?'var(--color-delta-pos)':stats.bayesianWinProbability>0.6?'var(--color-delta-neutral)':'var(--color-delta-neg)'}}>{(stats.bayesianWinProbability*100).toFixed(1)}%</div></div>
        <div><div className="text-text-muted mb-1">샘플 충분성</div><div className="font-bold" style={{fontSize:'var(--font-body)',color:stats.sampleSufficient?'var(--color-delta-pos)':'var(--color-delta-neg)'}}>{stats.sampleSufficient?'✅ 충분':'❌ 부족 (최소 100클릭/그룹)'}</div><div className="text-text-muted mt-1">Lift: <span className="font-bold" style={{color:stats.lift>0?'var(--color-delta-pos)':'var(--color-delta-neg)'}}>{(stats.lift*100).toFixed(1)}%</span></div></div>
      </div>
      <div className="mt-3" style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)' }}>Z-score: {stats.zScore.toFixed(3)} | 복수 비교군/기준군은 평균값으로 계산됩니다</div>
    </div>
  );
}

// ─── EditRowForm ──────────────────────────────────────────────────────────────
function EditRowForm({ row, onUpdate, onDelete, errorIds, channels, dateRange }: {
  row: TestRow; onUpdate: (id:string,patch:Partial<TestRow>)=>void; onDelete: (id:string)=>void;
  errorIds:Set<string>; channels: string[];
  dateRange: { selStart:string; selEnd:string; cmpStart:string; cmpEnd:string };
}) {
  const hasError = errorIds.has(row.id);
  const dq = `&selStart=${dateRange.selStart}&selEnd=${dateRange.selEnd}&cmpStart=${dateRange.cmpStart}&cmpEnd=${dateRange.cmpEnd}`;
  return (
    <div className={`grid gap-1.5 items-end py-1.5 border-b ${hasError?'border-red-500':'border-def'}`}
      style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr auto' }}>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>구분</div>
        <select value={row.group} onChange={e => onUpdate(row.id,{group:e.target.value as any})} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }} title={row.group==='control'?'기준군':'비교군'}><option value="control">기준군</option><option value="test">비교군</option></select></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>행 이름</div>
        <input value={row.label} onChange={e => onUpdate(row.id,{label:e.target.value})} title={row.label} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }}/></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>채널 *</div>
        <select value={row.media} onChange={e => onUpdate(row.id,{media:e.target.value,campaign:'',ad_group:'',ad:''})} title={row.media||'선택'} className={`w-full bg-surface-2 rounded px-2 py-1.5 text-text-secondary focus:outline-none ${hasError&&!row.media?'border border-red-500':'border border-def focus:border-accent'}`} style={{ fontSize: 'var(--font-body)' }}><option value="">선택</option>{channels.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>캠페인 *</div>
        <DynamicSelect value={row.campaign} onChange={v=>onUpdate(row.id,{campaign:v,ad_group:'',ad:''})} fetchUrl={row.media?`/api/ab-meta?type=campaign&media=${encodeURIComponent(row.media)}${dq}`:null} placeholder="채널 선택 후" disabled={!row.media} error={hasError&&!!row.media&&!row.campaign} title={row.campaign}/></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>그룹</div>
        <DynamicSelect value={row.ad_group} onChange={v=>onUpdate(row.id,{ad_group:v,ad:''})} fetchUrl={row.campaign?`/api/ab-meta?type=group&media=${encodeURIComponent(row.media)}&campaign=${encodeURIComponent(row.campaign)}${dq}`:null} placeholder="(선택)" disabled={!row.campaign} title={row.ad_group}/></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>소재</div>
        <DynamicSelect value={row.ad} onChange={v=>onUpdate(row.id,{ad:v})} fetchUrl={row.ad_group?`/api/ab-meta?type=ad&media=${encodeURIComponent(row.media)}&campaign=${encodeURIComponent(row.campaign)}&group=${encodeURIComponent(row.ad_group)}${dq}`:null} placeholder="(선택)" disabled={!row.ad_group} title={row.ad}/></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>시작일</div>
        <input type="date" value={row.dateStart} onChange={e=>onUpdate(row.id,{dateStart:e.target.value})} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: 'var(--font-body)' }}/></div>
      <div><div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>종료일</div>
        <input type="date" value={row.dateEnd} onChange={e=>onUpdate(row.id,{dateEnd:e.target.value})} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: 'var(--font-body)' }}/></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
        <button onClick={() => onDelete(row.id)} title="이 행 삭제"
          style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.08)', color: '#f87171', fontSize: 'var(--font-body)', lineHeight: 1, flexShrink: 0 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── TestCard ─────────────────────────────────────────────────────────────────
function TestCard({ test, onDelete, onRefresh, expanded: extExpanded, onExpand }: {
  test: ABTest; onDelete: ()=>void; onRefresh: ()=>void;
  expanded?: boolean; onExpand?: ()=>void;
}) {
  const { selectedRange, compareRange } = useDashboard();
  const chRange = { selStart: selectedRange.start, selEnd: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end };
  const { channels } = useChannels(chRange);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<TestRow[]>([]);
  const [editTestName, setEditTestName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTestDateStart, setEditTestDateStart] = useState('');
  const [editTestDateEnd, setEditTestDateEnd] = useState('');
  const [editJobType, setEditJobType] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string|null>(null);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string|null>(null);
  const rows = test.test_rows ?? [];
  const isExpanded = extExpanded !== undefined ? extExpanded : expanded;
  const startEdit = () => {
    const cloned = JSON.parse(JSON.stringify(rows));
    setEditRows(cloned); setEditTestName(test.test_name); setEditDescription(test.description??'');
    setEditTestDateStart(test.test_date_start??''); setEditTestDateEnd(test.test_date_end??'');
    setEditJobType(test.job_type??''); setEditError(null); setErrorIds(new Set());
    setEditing(true);
    if (extExpanded === undefined) setExpanded(true); else onExpand?.();
  };

  const updateEditRow = (id: string, patch: Partial<TestRow>) => {
    setEditRows(prev => {
      return prev.map(r => r.id===id ? {...r,...patch} : r);
    });
  };

  const deleteEditRow = (id: string) => {
    setEditRows(prev => prev.filter(r => r.id !== id));
  };

  const applyTestDatesToRows = () => {
    if (!editTestDateStart || !editTestDateEnd) return;
    setEditRows(prev => prev.map(r => ({...r, dateStart: editTestDateStart, dateEnd: editTestDateEnd})));
  };

  const saveEdit = async () => {
    setEditLoading(true);
    try {
      const mappedRows = editRows.map(r => ({...r, dateRange:{start:r.dateStart,end:r.dateEnd}}));
      const res = await fetch('/api/ab-tests', { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({test_id:test.test_id, test_name:editTestName, description:editDescription, test_date_start:editTestDateStart, test_date_end:editTestDateEnd, job_type:editJobType, rows:mappedRows})});
      const json = await res.json();
      if (!res.ok) { setEditError(json.error??'저장 실패'); return; }
      setEditing(false); onRefresh();
    } catch(e:any) { setEditError(e.message); } finally { setEditLoading(false); }
  };

  const createdAt = (() => {
    try { const d = new Date(test.created_at); return isNaN(d.getTime()) ? test.created_at : d.toLocaleString('ko-KR'); }
    catch { return test.created_at; }
  })();

  const toggleExpand = () => { if (extExpanded !== undefined) { onExpand?.(); } else { setExpanded(p=>!p); } };

  return (
    <div className="card" id={`test-${test.test_id}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-bold" style={{ fontSize: 'var(--font-section-title)', color: 'var(--color-text-primary)' }}>{test.test_name}</h3>
          {test.description && <p className="mt-0.5" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>{test.description}</p>}
          {(test.test_date_start||test.test_date_end) && (
            <p className="mt-0.5" style={{ fontSize: 'var(--font-small)', color: 'var(--color-accent)' }}>📅 {test.test_date_start} ~ {test.test_date_end}</p>
          )}
          <p className="mt-1" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>등록: {createdAt}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={toggleExpand} style={{ fontSize: 'var(--font-body)', fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', transition:'all 0.15s', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' }}>{isExpanded?'접기':'펼치기'}</button>
          <button onClick={startEdit} style={{ fontSize: 'var(--font-body)', fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', transition:'all 0.15s', backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)', color:'var(--color-accent)', border:'1px solid var(--color-accent)' }}>편집</button>
          <button onClick={async()=>{setExportLoading(true);setExportError(null);try{await exportABTest(test);}catch(e:any){setExportError(e.message??'Export 실패');}finally{setExportLoading(false);}}}
            disabled={exportLoading}
            className="hidden md:flex disabled:opacity-50"
            style={{ fontSize: 'var(--font-body)', fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:4, backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)', color:'var(--color-accent)', border:'1px solid var(--color-accent)' }}>
            {exportLoading?<svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>:'📊'} Excel 내보내기
          </button>
          <button onClick={onDelete} style={{ fontSize: 'var(--font-body)', fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', transition:'all 0.15s', backgroundColor:'rgba(248,113,113,0.08)', color:'#f87171', border:'1px solid rgba(248,113,113,0.3)' }}>삭제</button>
        </div>
      </div>
      {exportError && <div className="mb-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30" style={{ fontSize: 'var(--font-body)', color: 'var(--color-delta-neg)' }}>⚠️ Export 오류: {exportError}</div>}

      {test.ai_comment && (
        <div className="bg-accent/10 border border-sky-500/20 rounded-xl p-3 mb-3">
          <span className="font-bold uppercase" style={{ fontSize: 'var(--font-small)', letterSpacing: 'var(--tracking-wide)', color:'var(--color-accent)' }}>🤖 AI 분석</span>
          <p className="mt-1 leading-relaxed" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>{test.ai_comment}</p>
        </div>
      )}

      {/* 편집 모드 */}
      {editing && (
        <div className="mb-4 border border-accent/30 rounded-xl p-3">
          <h4 className="font-bold mb-3" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>✏️ 편집</h4>
          {editError && <div className="mb-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30" style={{ fontSize: 'var(--font-body)', color: 'var(--color-delta-neg)' }}>⚠️ {editError}</div>}
          {/* 직무 선택 */}
          <div className="mb-3">
            <label style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>{IS_PORTFOLIO_CLIENT ? '프로젝트' : '직무'}</label>
            <select value={editJobType} onChange={e=>setEditJobType(e.target.value)}
              className="bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none"
              style={{ fontSize: 'var(--font-body)', minWidth: 140 }}>
              <option value="">선택 안 함</option>
              {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3 items-end">
            <div><label style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>테스트명 *</label>
              <input value={editTestName} onChange={e=>setEditTestName(e.target.value)} title={editTestName} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }}/></div>
            <div><label style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>설명</label>
              <input value={editDescription} onChange={e=>setEditDescription(e.target.value)} title={editDescription} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }}/></div>
            <div><label style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>테스트 시작일</label>
              <input type="date" value={editTestDateStart} onChange={e=>setEditTestDateStart(e.target.value)} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: 'var(--font-body)' }}/></div>
            <div><label style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>테스트 종료일</label>
              <input type="date" value={editTestDateEnd} onChange={e=>setEditTestDateEnd(e.target.value)} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: 'var(--font-body)' }}/></div>
            <div>
              <label style={{ fontSize: 'var(--font-small)', color: 'transparent', marginBottom: 4, display: 'block' }}>_</label>
              <button onClick={applyTestDatesToRows}
                style={{ fontSize: 'var(--font-body)', fontWeight: 700, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--color-accent)', backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', width: '100%', transition: 'all 0.15s' }}>
                📅 날짜 일괄 적용
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">{editRows.map(row => <EditRowForm key={row.id} row={row} onUpdate={updateEditRow} onDelete={deleteEditRow} errorIds={errorIds} channels={channels} dateRange={chRange}/>)}</div>
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={()=>{setEditing(false);setEditError(null);}} className="px-3 py-1.5 rounded-lg font-semibold transition-all" style={{ fontSize: 'var(--font-body)', backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)', color:'var(--color-accent)', border:'1px solid var(--color-accent)' }}>취소</button>
            <button onClick={saveEdit} disabled={editLoading} className="px-4 py-1.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-all" style={{ fontSize: 'var(--font-body)' }}>{editLoading?'저장 중...':'저장'}</button>
          </div>
        </div>
      )}

      {isExpanded && !editing && (
        <>
          <div className="overflow-x-auto mt-2">
            <table className="data-table">
              <thead><tr>
                <th className="text-left">구분</th><th className="text-left">행</th>
                <th className="text-left">캠페인</th><th className="text-left">그룹</th><th className="text-left">소재</th>
                <th className="text-left">시작일</th><th className="text-left">종료일</th>
                {COLS.map(c=><th key={c.key}>{c.label}</th>)}
              </tr></thead>
              <tbody>{rows.map((row,idx) => {
                const groupColor = row.group==='control'?'var(--color-accent)':'var(--color-delta-neutral)';
                return (<tr key={row.id??idx}>
                  <td><span style={{ fontSize: 'var(--font-body)', fontWeight: 700, color:groupColor }}>{row.group==='control'?'기준군':'비교군'}</span></td>
                  <td style={{ fontSize: "var(--font-body)", color: "var(--color-text-secondary)", fontWeight: 500 }}>{row.label}</td>
                  <td className="max-w-[120px] truncate" style={{ fontSize: "var(--font-body)", color: "var(--color-text-muted)" }} title={row.campaign||''}>{row.campaign||'—'}</td>
                  <td className="max-w-[100px] truncate" style={{ fontSize: "var(--font-body)", color: "var(--color-text-muted)" }} title={row.ad_group||''}>{row.ad_group||'—'}</td>
                  <td className="max-w-[100px] truncate" style={{ fontSize: "var(--font-body)", color: "var(--color-text-muted)" }} title={row.ad||''}>{row.ad||'—'}</td>
                  <td style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>{row.dateStart||'—'}</td>
                  <td style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>{row.dateEnd||'—'}</td>
                  {COLS.map(c => {
                    const v = (row.metrics as any)?.[c.key];
                    const isBest = findBestIdx(rows,c)===idx;
                    return (<td key={c.key} className={`text-right tabular-nums ${isBest?'font-bold':''}`} style={{ fontSize: 'var(--font-table-body)', ...(isBest?{color:'var(--color-delta-pos)'}:{}) }}>
                      {v!=null?c.fmtFn(v):'—'}{isBest&&<span style={{ marginLeft: 2, fontSize: 'var(--font-tiny)' }}>★</span>}
                    </td>);
                  })}
                </tr>);
              })}</tbody>
            </table>
          </div>
          <StatsPanel rows={rows}/>
        </>
      )}
    </div>
  );
}


// ─── 안정적인 채널 색상 (고정 매핑) ─────────────────────────────────────────
// 채널 컬러는 lib/channelColors.ts에서 공통 관리

function d2s(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}

// ─── ABCalendar ────────────────────────────────────────────────────────────────
function ABCalendar({ tests, onTestClick }: { tests: ABTest[]; onTestClick: (id:string)=>void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  // 직무 필터: jobGroupFilter = '전체'|'일용직'|'계약직', activeJobTypes = 활성 직무 Set
  const [jobGroupFilter, setJobGroupFilter] = useState<string>('전체');
  const [activeJobTypes, setActiveJobTypes] = useState<Set<JobType>>(new Set(JOB_TYPES));
  const theme = useTheme();
  const isDark = !isLightColor(theme.colorBg);

  const prevMonth = () => { if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1); };

  // 직무 필터 로직 (수정.11 스펙)
  const handleJobGroupClick = (g: string) => {
    setJobGroupFilter(g);
    if (g==='전체') setActiveJobTypes(new Set(JOB_TYPES));
    else setActiveJobTypes(new Set(JOB_GROUP[g] ?? JOB_TYPES));
  };
  const toggleJobType = (jt: JobType) => {
    setActiveJobTypes(prev => {
      const next = new Set(prev);
      if (next.has(jt)) {
        next.delete(jt);
        // 일용직 상태에서 Helper 비활성화 → 전체로
        if (jobGroupFilter==='일용직') { setJobGroupFilter('전체'); return new Set(JOB_TYPES); }
        // 전체 상태에서 Helper 비활성화 → 계약직으로
        if (jobGroupFilter==='전체' && jt==='Helper') { setJobGroupFilter('계약직'); next.add('HL'); next.add('MCL'); next.add('FA'); next.add('FO'); next.add('CPF'); next.add('S-FA'); next.delete('Helper'); return next; }
      } else {
        next.add(jt);
        // 계약직 상태에서 Helper 활성화 → 전체로
        if (jobGroupFilter==='계약직' && jt==='Helper') { setJobGroupFilter('전체'); return new Set(JOB_TYPES); }
      }
      // 그룹 레이블 자동 결정
      const activeArr = [...next];
      if (activeArr.length===JOB_TYPES.length) setJobGroupFilter('전체');
      else if (activeArr.length===1&&activeArr[0]==='Helper') setJobGroupFilter('일용직');
      else if (!activeArr.includes('Helper')&&activeArr.length===JOB_TYPES.length-1) setJobGroupFilter('계약직');
      return next;
    });
  };

  // 직무 + 채널 이중 필터
  const jobFilteredTests = tests.filter(t => {
    const jt = (t.job_type ?? '') as JobType;
    if (!jt) return true; // 직무 없는 기존 레코드는 항상 표시
    if (!(JOB_TYPES as readonly string[]).includes(jt)) return true; // 레거시 직무명도 항상 표시
    return activeJobTypes.has(jt);
  });
  // 기준군(control) 채널만 필터 표시
  const controlChannels = Array.from(new Set(
    jobFilteredTests.flatMap(t => (t.test_rows??[]).filter(r=>r.group==='control').map(r=>r.media).filter(Boolean))
  ));
  const filteredTests = selectedChannels.size===0 ? jobFilteredTests : jobFilteredTests.filter(t =>
    (t.test_rows??[]).some(r => r.group==='control' && selectedChannels.has(r.media))
  );

  const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
  const testsInMonth = filteredTests.filter(t => {
    if(!t.test_date_start||!t.test_date_end) return false;
    return t.test_date_start.slice(0,7)<=monthStr && t.test_date_end.slice(0,7)>=monthStr;
  });

  // 달력 셀 (일요일 시작)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const startDow = firstDay.getDay();
  const cells: (number|null)[] = [];
  for(let i=0;i<startDow;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  while(cells.length%7!==0) cells.push(null);
  const weeks = [];
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));

  const todayStr = d2s(today.getFullYear(),today.getMonth()+1,today.getDate());

  // 주(week)별 스패닝 이벤트 계산
  const getWeekEvents = (weekDays: (number|null)[]) => {
    const eventRows: { test: ABTest; colStart: number; colSpan: number; ch: string }[][] = [];
    const validDays = weekDays.map((d,i) => d ? d2s(viewYear,viewMonth+1,d) : null);
    const weekStart = validDays.find(d=>d!==null)!;
    const weekEnd = [...validDays].reverse().find(d=>d!==null)!;
    if(!weekStart||!weekEnd) return eventRows;

    const activeTests = testsInMonth.filter(t => {
      const s = t.test_date_start!; const e = t.test_date_end!;
      return s<=weekEnd && e>=weekStart;
    });

    for(const t of activeTests) {
      const s = t.test_date_start!; const e = t.test_date_end!;
      const ch = (t.test_rows??[]).find(r=>r.group==='control')?.media || (t.test_rows??[])[0]?.media || '';
      // 이번 주 시작/끝 컬럼
      let colStart = 0; let colEnd = 6;
      for(let i=0;i<7;i++){
        const ds = validDays[i];
        if(ds && ds>=s && ds<=e && colStart===0) colStart=i;
        if(ds && ds>=s && ds<=e) colEnd=i;
      }
      const colSpan = colEnd - colStart + 1;
      // 빈 row 찾기 (겹치지 않는 row)
      let placed = false;
      for(let row=0; row<eventRows.length; row++){
        const conflict = eventRows[row].some(ev => {
          const evEnd = ev.colStart + ev.colSpan - 1;
          return !(colStart > evEnd || colStart+colSpan-1 < ev.colStart);
        });
        if(!conflict){ eventRows[row].push({test:t,colStart,colSpan,ch}); placed=true; break; }
      }
      if(!placed) eventRows.push([{test:t,colStart,colSpan,ch}]);
    }
    return eventRows;
  };

  const toggleChannel = (ch:string) => setSelectedChannels(prev => { const n=new Set(prev); n.has(ch)?n.delete(ch):n.add(ch); return n; });
  const SIDEBAR_W = 200;
  const DOW_LABELS = ['일','월','화','수','목','금','토'];

  const jobBtnSt = (active: boolean) => ({
    padding:'3px 8px', borderRadius:6, fontSize:'var(--font-tiny)', fontWeight:700, cursor:'pointer' as const, transition:'all 0.15s',
    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)',
    border: active ? '1px solid transparent' : '1px solid var(--color-border-subtle)', 
  });

  return (
    <div style={{backgroundColor:'var(--color-surface-1)', border:'1px solid var(--color-border-subtle)', borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'flex'}}>
        {/* 좌측 사이드바 */}
        <div style={{width:SIDEBAR_W, flexShrink:0, borderRight:'1px solid var(--color-border-subtle)'}}>
          {/* 헤더 공간 — 요일 헤더와 높이 맞춤 */}
          <div style={{height:44, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:'0 12px 8px', borderBottom:'1px solid var(--color-border-subtle)'}}>
            <span style={{fontSize:'var(--font-label)', fontWeight:700, color:'var(--color-text-muted)', letterSpacing:'var(--tracking-wide)', textTransform:'uppercase'}}>필터</span>
          </div>
          {/* 채널 목록 */}
          <div style={{padding:'10px 12px', display:'flex', flexDirection:'column', gap:6}}> 
            <div style={{fontSize:'var(--font-tiny)', color:'var(--color-text-muted)', fontWeight:700, marginBottom:2, textTransform:'uppercase', letterSpacing:'var(--tracking-wide)'}}>채널</div>
            {controlChannels.map(ch => {
              const c = getChColor(ch, isDark);
              const active = selectedChannels.has(ch);
              return (
                <label key={ch} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: active||selectedChannels.size===0?1:0.4, transition:'opacity 0.15s'}}>
                  <input type="checkbox" checked={active} onChange={()=>toggleChannel(ch)} style={{display:'none'}}/>
                  <div style={{width:12, height:12, borderRadius:3, border:`2px solid ${c.border}`, backgroundColor: active?c.bg:'transparent', flexShrink:0, transition:'all 0.15s'}}/>
                  <span style={{fontSize:'var(--font-label)', color:'var(--color-text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:110}}>{ch}</span>
                </label>
              );
            })}
            {selectedChannels.size>0&&<button onClick={()=>setSelectedChannels(new Set())} style={{marginTop:4,fontSize:'var(--font-tiny)',color:'var(--color-text-muted)',background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0,opacity:0.7}}>전체 해제</button>}
          </div>
        </div>

        {/* 우측 달력 */}
        <div style={{flex:1, minWidth:0}}>
          {/* 월 네비게이션 + 요일 헤더 */}
          <div style={{height:44, display:'flex', alignItems:'center', borderBottom:'1px solid var(--color-border-subtle)', justifyContent:'center', gap:8}}>
            <button onClick={prevMonth} style={{background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)',fontSize:'var(--font-page-title)',fontWeight:700,lineHeight:1,padding:'4px 6px',borderRadius:6,display:'flex',alignItems:'center'}}>‹</button>
            <span style={{fontSize:'var(--font-body)',fontWeight:700,color:'var(--color-text-primary)',minWidth:100,textAlign:'center'}}>{viewYear}년 {viewMonth+1}월</span>
            <button onClick={nextMonth} style={{background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)',fontSize:'var(--font-page-title)',fontWeight:700,lineHeight:1,padding:'4px 6px',borderRadius:6,display:'flex',alignItems:'center'}}>›</button>
          </div>

          {/* 요일 헤더 */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--color-border-subtle)'}}>
            {DOW_LABELS.map((d,i)=>(
              <div key={d} style={{textAlign:'center',fontSize:'var(--font-label)',fontWeight:600,padding:'6px 0',color:i===0?'#f87171':i===6?'#60a5fa':'var(--color-text-muted)'}}>
                {d}
              </div>
            ))}
          </div>

          {/* 주별 행 */}
          {weeks.map((weekDays, wi) => {
            const eventRows = getWeekEvents(weekDays);
            const rowHeight = 32 + eventRows.length * 22 + 4;
            return (
              <div key={wi} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:wi<weeks.length-1?'1px solid var(--color-border-subtle)':'none',position:'relative',minHeight:rowHeight}}>
                {/* 날짜 숫자 */}
                {weekDays.map((day,di)=>{
                  if(!day) return <div key={`e-${di}`} style={{borderRight:di<6?'1px solid var(--color-border-subtle)':'none',minHeight:rowHeight,backgroundColor:'color-mix(in srgb, var(--color-surface-1) 98%, transparent)'}}/>;
                  const ds = d2s(viewYear,viewMonth+1,day);
                  const isToday = ds===todayStr;
                  const isHol = KR_HOLIDAYS.has(ds);
                  const holName = KR_HOLIDAYS.get(ds);
                  const dow = di;
                  return (
                    <div key={day} style={{borderRight:di<6?'1px solid var(--color-border-subtle)':'none',minHeight:rowHeight,padding:'4px 6px 0',position:'relative'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',marginBottom:2}}>
                        <span style={{
                          fontSize: 'var(--font-body)',fontWeight:isToday?700:500,
                          color: isToday?'#fff':isHol||dow===0?'#f87171':dow===6?'#60a5fa':'var(--color-text-muted)',
                          backgroundColor: isToday?'var(--color-accent)':'transparent',
                          borderRadius: isToday?'50%':'0',
                          width: isToday?22:undefined,height:isToday?22:undefined,
                          display:isToday?'flex':'inline',
                          alignItems:'center',justifyContent:'center',
                        }}>
                          {day === 1 ? `${viewMonth+1}/${day}` : String(day)}
                        </span>
                        {isHol&&<span style={{fontSize: 'var(--font-tiny)',color:'var(--color-delta-neg)',display:'block',lineHeight:1.2,marginTop:1,fontWeight:500}}>{holName}</span>}
                      </div>
                    </div>
                  );
                })}

                {/* 스패닝 이벤트 오버레이 */}
                {eventRows.map((row,ri) => row.map(ev => {
                  const c = getChColor(ev.ch, isDark);
                  const isStart = ev.test.test_date_start! >= d2s(viewYear,viewMonth+1, weekDays.find(d=>d!==null)!);
                  const isEnd   = ev.test.test_date_end!   <= d2s(viewYear,viewMonth+1, [...weekDays].reverse().find(d=>d!==null)!);
                  return (
                    <div key={`${ev.test.test_id}-${wi}-${ri}`}
                      onClick={()=>onTestClick(ev.test.test_id)}
                      style={{
                        position:'absolute',
                        top: 28 + ri*22,
                        left: `calc(${ev.colStart/7*100}% + 2px)`,
                        width: `calc(${ev.colSpan/7*100}% - 4px)`,
                        height: 18,
                        backgroundColor: c.bg,
                        border: `1px solid ${c.border}`,
                        borderRadius: isStart&&isEnd?4:isStart?'4px 0 0 4px':isEnd?'0 4px 4px 0':0,
                        borderLeft: !isStart?'none':`1px solid ${c.border}`,
                        borderRight: !isEnd?'none':`1px solid ${c.border}`,
                        cursor:'pointer',
                        display:'flex',alignItems:'center',
                        paddingLeft: isStart?6:2,
                        paddingRight:4,
                        overflow:'hidden',
                        transition:'opacity 0.15s',
                        zIndex:1,
                      }}
                      onMouseEnter={e=>(e.currentTarget.style.opacity='0.75')}
                      onMouseLeave={e=>(e.currentTarget.style.opacity='1')}
                    >
                      {isStart&&<span style={{fontSize: 'var(--font-small)',fontWeight:600,color:c.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {ev.test.job_type ? `${ev.test.job_type} | ` : ''}{ev.ch} | {ev.test.test_name}
                      </span>}
                    </div>
                  );
                }))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── export helper ────────────────────────────────────────────────────────────
const fmtN = (v: any) => v==null?'':String(v);
const RESULT_HEADERS = ['구분','행','캠페인','그룹','소재','시작일','종료일','IMP','CLICK','CTR','COST','CPC','APP','CPA','CVR'];
const DAILY_HEADERS  = ['구분','행','캠페인','그룹','소재','일자','IMP','CLICK','CTR','COST','CPC','APP','CPA','CVR'];

function metricsToRow(m: any) {
  if (!m) return Array(8).fill('');
  const cvr=m.click>0?m.applicant/m.click:0, ctr=m.imp>0?m.click/m.imp:0, cpc=m.click>0?m.cost/m.click:0, cpa=m.applicant>0?m.cost/m.applicant:0;
  return [Math.round(m.imp??0),Math.round(m.click??0),(ctr*100).toFixed(2)+'%',Math.round(m.cost??0),Math.round(cpc),Math.round(m.applicant??0),Math.round(cpa),(cvr*100).toFixed(2)+'%'];
}

async function exportABTest(test: ABTest) {
  const rows = test.test_rows??[];
  const resultRows = rows.map(r => [r.group==='control'?'기준군':'비교군',r.label,r.campaign||'',r.ad_group||'',r.ad||'',r.dateStart||'',r.dateEnd||'',...metricsToRow(r.metrics)]);
  const dailyRows: (string|number)[][] = [];
  for (const r of rows) {
    if (!r.media||!r.campaign||!r.dateStart||!r.dateEnd) continue;
    try {
      const params = new URLSearchParams({media:r.media,campaign:r.campaign,dateStart:r.dateStart,dateEnd:r.dateEnd,...(r.ad_group?{group:r.ad_group}:{}),...(r.ad?{ad:r.ad}:{})});
      const res = await fetch(`/api/ab-daily?${params}`);
      const json = await res.json();
      for (const d of (json.rows??[])) {
        dailyRows.push([r.group==='control'?'기준군':'비교군',r.label,r.campaign||'',r.ad_group||'',r.ad||'',fmtN(d.date),...metricsToRow({imp:d.imp,click:d.click,cost:d.cost,applicant:d.applicant})]);
      }
    } catch {}
  }
  const res = await fetch('/api/export', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({title:test.test_name, sheets:[{sheetName:'집계 결과',headers:RESULT_HEADERS,rows:resultRows},{sheetName:'일자별 실적',headers:DAILY_HEADERS,rows:dailyRows}]})});
  if (!res.ok) { const text=await res.text(); try{const j=JSON.parse(text);throw new Error(j.error??'Export 실패');}catch{throw new Error('Export 실패');} }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`${test.test_name}_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── RegisterForm ─────────────────────────────────────────────────────────────
function RegisterForm({ onSaved, open, setOpen }: { onSaved: ()=>void; open: boolean; setOpen: (v:boolean)=>void }) {
  const { selectedRange, compareRange } = useDashboard();
  const chRange = { selStart: selectedRange.start, selEnd: selectedRange.end, cmpStart: compareRange.start, cmpEnd: compareRange.end };
  const { channels } = useChannels(chRange);
  const dq = `&selStart=${chRange.selStart}&selEnd=${chRange.selEnd}&cmpStart=${chRange.cmpStart}&cmpEnd=${chRange.cmpEnd}`;
  const [testName, setTestName] = useState('');
  const [description, setDescription] = useState('');
  const [testDateStart, setTestDateStart] = useState('');
  const [testDateEnd, setTestDateEnd] = useState('');
  const [jobType, setJobType] = useState('');
  const [rows, setRows] = useState<Omit<TestRow,'metrics'>[]>([
    {id:'1',label:'기준군 A',group:'control',media:'',campaign:'',ad_group:'',ad:'',dateStart:'',dateEnd:''},
    {id:'2',label:'비교군 B',group:'test',   media:'',campaign:'',ad_group:'',ad:'',dateStart:'',dateEnd:''},
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());

  const updateRow = (id: string, patch: Partial<Omit<TestRow,'metrics'>>) => {
    setRows(prev => prev.map(r => r.id===id?{...r,...patch}:r));
  };

  const deleteRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const applyTestDates = () => {
    if (!testDateStart||!testDateEnd) return;
    setRows(prev => prev.map(r => ({...r, dateStart:testDateStart, dateEnd:testDateEnd})));
  };

  const addRow = () => setRows(prev => {
    return [...prev,{id:String(Date.now()),label:`비교군 ${String.fromCharCode(65+prev.length)}`,group:'test',media:'',campaign:'',ad_group:'',ad:'',dateStart:'',dateEnd:''}];
  });

  const validate = (): string|null => {
    const badIds = new Set<string>();
    const levels = rows.map(r=>getLevel(r)); const maxLevel=Math.max(...levels); const minLevel=Math.min(...levels);
    rows.forEach(r => { if(!r.media||!r.campaign)badIds.add(r.id); if(!r.dateStart||!r.dateEnd)badIds.add(r.id); if(getLevel(r)<maxLevel)badIds.add(r.id); });
    if (badIds.size>0) { setErrorIds(badIds); if(rows.some(r=>!r.media||!r.campaign))return '채널과 캠페인은 필수 선택입니다.'; if(minLevel!==maxLevel)return '모든 행이 동일한 레벨까지 선택되어야 합니다.'; return '필수 항목을 확인해주세요.'; }
    if (!testName.trim()) return '테스트명을 입력해주세요.';
    if (!testDateStart||!testDateEnd) return '테스트 기간을 입력해주세요.';
    rows.forEach(r=>{ if(r.dateStart>r.dateEnd)badIds.add(r.id); });
    if (badIds.size>0) { setErrorIds(badIds); return '시작일이 종료일보다 늦은 행이 있습니다.'; }
    setErrorIds(new Set()); return null;
  };

  const handleSubmit = async () => {
    setError(null); const ve=validate(); if(ve){setError(ve);return;}
    setLoading(true);
    try {
      const mappedRows = rows.map(r=>({...r,dateRange:{start:r.dateStart,end:r.dateEnd}}));
      const res = await fetch('/api/ab-tests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({test_name:testName,description,test_date_start:testDateStart,test_date_end:testDateEnd,job_type:jobType,rows:mappedRows})});
      const json = await res.json();
      if(!res.ok){setError(json.error??'저장 중 오류');return;}
      setOpen(false); setTestName(''); setDescription(''); setTestDateStart(''); setTestDateEnd(''); setJobType(''); setErrorIds(new Set()); setError(null);
      setRows([{id:'1',label:'기준군 A',group:'control',media:'',campaign:'',ad_group:'',ad:'',dateStart:'',dateEnd:''},{id:'2',label:'비교군 B',group:'test',media:'',campaign:'',ad_group:'',ad:'',dateStart:'',dateEnd:''}]);
      onSaved();
    } catch(e:any){setError(e.message??'네트워크 오류');} finally{setLoading(false);}
  };

  if (!open) return null;

  return (
    <div className="card border border-accent/30">
      <h3 className="font-bold mb-4" style={{ fontSize: 'var(--font-section-title)', color: 'var(--color-text-primary)' }}>새 A/B 테스트 등록</h3>
      {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">⚠️ {error}</div>}

      {/* 직무 선택 */}
      <div className="mb-3">
        <label style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginBottom: 4, display: "block" }}>{IS_PORTFOLIO_CLIENT ? '프로젝트' : '직무'}</label>
        <select value={jobType} onChange={e=>setJobType(e.target.value)}
          className="bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none"
          style={{ fontSize: "var(--font-body)", minWidth: 140 }}>
          <option value="">선택 안 함</option>
          {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      {/* 상단: 테스트명 / 설명 / 테스트 시작일 / 테스트 종료일 / 날짜 일괄 적용 — 동일 높이 1행 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 items-end">
        <div><label style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginBottom: 4, display: "block" }}>테스트명 *</label>
          <input value={testName} onChange={e=>setTestName(e.target.value)} title={testName} placeholder="예: 이미지 A vs B 테스트" className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: "var(--font-body)" }}/></div>
        <div><label style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginBottom: 4, display: "block" }}>설명 (선택)</label>
          <input value={description} onChange={e=>setDescription(e.target.value)} title={description} placeholder="테스트 목적 or 가설" className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: "var(--font-body)" }}/></div>
        <div><label style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginBottom: 4, display: "block" }}>테스트 시작일 *</label>
          <input type="date" value={testDateStart} onChange={e=>setTestDateStart(e.target.value)} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: "var(--font-body)" }}/></div>
        <div><label style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginBottom: 4, display: "block" }}>테스트 종료일 *</label>
          <input type="date" value={testDateEnd} onChange={e=>setTestDateEnd(e.target.value)} onClick={e=>(e.currentTarget as any).showPicker?.()} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none cursor-pointer" style={{ fontSize: "var(--font-body)" }}/></div>
        <div>
          <label style={{ fontSize: "var(--font-small)", color: "transparent", marginBottom: 4, display: "block" }}>_</label>
          <button onClick={applyTestDates}
            style={{ fontSize: 'var(--font-body)', fontWeight: 700, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--color-accent)', backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', width: '100%', transition: 'all 0.15s' }}>
            📅 날짜 일괄 적용
          </button>
        </div>
      </div>

      {/* 행 헤더 */}
      <div className="gap-1.5 mb-1 px-0.5" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr auto' }}>
        {['구분','행 이름','채널 *','캠페인 *','그룹','소재','시작일','종료일',''].map(h=>(
          <div key={h} style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</div>
        ))}
      </div>

      {/* 행 목록 */}
      <div className="space-y-1 mb-3">
        {rows.map(row => {
          const hasError = errorIds.has(row.id);
          return (
            <div key={row.id} className={`gap-1.5 items-center py-1.5 rounded-lg px-1.5 ${hasError?'bg-red-500/5 border border-red-500/30':''}`}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr auto' }}>
              <select value={row.group} onChange={e=>updateRow(row.id,{group:e.target.value as any})} title={row.group==='control'?'기준군':'비교군'} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }}><option value="control">기준군</option><option value="test">비교군</option></select>
              <input value={row.label} onChange={e=>updateRow(row.id,{label:e.target.value})} title={row.label} className="w-full bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none" style={{ fontSize: 'var(--font-body)' }}/>
              <select value={row.media} onChange={e=>updateRow(row.id,{media:e.target.value,campaign:'',ad_group:'',ad:''})} title={row.media||'채널 선택'} className={`w-full bg-surface-2 rounded px-2 py-1.5 text-text-secondary focus:outline-none ${hasError&&!row.media?'border border-red-500':'border border-def focus:border-accent'}`} style={{ fontSize: 'var(--font-body)' }}><option value="">선택</option>{channels.map(c=><option key={c} value={c}>{c}</option>)}</select>
              <DynamicSelect value={row.campaign} onChange={v=>updateRow(row.id,{campaign:v,ad_group:'',ad:''})} fetchUrl={row.media?`/api/ab-meta?type=campaign&media=${encodeURIComponent(row.media)}${dq}`:null} placeholder="채널 선택 후" disabled={!row.media} error={hasError&&!!row.media&&!row.campaign} title={row.campaign}/>
              <DynamicSelect value={row.ad_group} onChange={v=>updateRow(row.id,{ad_group:v,ad:''})} fetchUrl={row.campaign?`/api/ab-meta?type=group&media=${encodeURIComponent(row.media)}&campaign=${encodeURIComponent(row.campaign)}${dq}`:null} placeholder="(선택)" disabled={!row.campaign} title={row.ad_group}/>
              <DynamicSelect value={row.ad} onChange={v=>updateRow(row.id,{ad:v})} fetchUrl={row.ad_group?`/api/ab-meta?type=ad&media=${encodeURIComponent(row.media)}&campaign=${encodeURIComponent(row.campaign)}&group=${encodeURIComponent(row.ad_group)}${dq}`:null} placeholder="(선택)" disabled={!row.ad_group} title={row.ad}/>
              <input type="date" value={row.dateStart} onChange={e=>updateRow(row.id,{dateStart:e.target.value})} onClick={e=>(e.currentTarget as any).showPicker?.()} className={`w-full bg-surface-2 rounded px-2 py-1.5 text-text-secondary focus:outline-none cursor-pointer ${hasError&&!row.dateStart?'border border-red-500':'border border-def focus:border-accent'}`} style={{ fontSize: 'var(--font-body)' }}/>
              <input type="date" value={row.dateEnd} onChange={e=>updateRow(row.id,{dateEnd:e.target.value})} onClick={e=>(e.currentTarget as any).showPicker?.()} className={`w-full bg-surface-2 rounded px-2 py-1.5 text-text-secondary focus:outline-none cursor-pointer ${hasError&&!row.dateEnd?'border border-red-500':'border border-def focus:border-accent'}`} style={{ fontSize: 'var(--font-body)' }}/>
              <button onClick={()=>deleteRow(row.id)} title="이 행 삭제"
                style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.08)', color: '#f87171', fontSize: 'var(--font-body)', lineHeight: 1 }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <button onClick={addRow} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ fontSize: 'var(--font-body)', backgroundColor: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ 행 추가</button>
        <div className="ml-auto flex gap-2">
          <button onClick={()=>{setOpen(false);setError(null);setErrorIds(new Set());}} className="px-4 py-1.5 rounded-lg font-semibold transition-all" style={{ fontSize: 'var(--font-body)', backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)', color:'var(--color-accent)', border:'1px solid var(--color-accent)' }}>취소</button>
          <button onClick={handleSubmit} disabled={loading} className="px-5 py-1.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-all flex items-center gap-2" style={{ fontSize: 'var(--font-body)' }}>
            {loading?(<><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>저장 중...</>):'저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function ABTestPageInner() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const testRefs = useRef<Record<string, HTMLDivElement|null>>({});
  const theme = useTheme();
  const [registerOpen, setRegisterOpen] = useState(false);

  // 직무 필터
  const [jobGroupFilter, setJobGroupFilter] = useState<string>('전체');
  const [activeJobTypes, setActiveJobTypes] = useState<Set<JobType>>(new Set(JOB_TYPES));
  const handleJobGroupClick = (g: string) => {
    setJobGroupFilter(g);
    if (g==='전체') setActiveJobTypes(new Set(JOB_TYPES));
    else setActiveJobTypes(new Set(JOB_GROUP[g] ?? JOB_TYPES));
  };
  const toggleJobType = (jt: JobType) => {
    setActiveJobTypes(prev => {
      const next = new Set(prev);
      if (next.has(jt)) {
        next.delete(jt);
        if (jobGroupFilter==='일용직') { setJobGroupFilter('전체'); return new Set(JOB_TYPES); }
        if (jobGroupFilter==='전체' && jt==='Helper') { setJobGroupFilter('계약직'); return new Set(JOB_TYPES.filter(j=>j!=='Helper')); }
      } else {
        next.add(jt);
        if (jobGroupFilter==='계약직' && jt==='Helper') { setJobGroupFilter('전체'); return new Set(JOB_TYPES); }
      }
      const activeArr = [...next];
      if (activeArr.length===JOB_TYPES.length) setJobGroupFilter('전체');
      else if (activeArr.length===1&&activeArr[0]==='Helper') setJobGroupFilter('일용직');
      else if (!activeArr.includes('Helper')&&activeArr.length===JOB_TYPES.length-1) setJobGroupFilter('계약직');
      return next;
    });
  };
  // 직무 필터 적용
  const filteredTests = tests.filter(t => {
    const jt = (t.job_type ?? '') as JobType;
    if (!jt) return true;
    if (!(JOB_TYPES as readonly string[]).includes(jt)) return true; // 레거시 직무명 항상 표시
    return activeJobTypes.has(jt);
  });

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ab-tests');
      const json = await res.json();
      // 최신순 정렬
      const sorted = (json.tests??[]).sort((a:ABTest,b:ABTest) => {
        const da = new Date(a.created_at).getTime(); const db = new Date(b.created_at).getTime();
        return db - da;
      });
      setTests(sorted);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  // ── highlight from Overview link ────────────────────────────────────────────
  const searchParams = useSearchParams();
  const highlightId  = searchParams.get('highlight');
  const [highlighted, setHighlighted] = useState<string|null>(null);

  useEffect(() => {
    if (!highlightId || loading || tests.length === 0) return;
    // 해당 테스트를 맨 위로 정렬
    setTests(prev => {
      const idx = prev.findIndex(t => t.test_id === highlightId);
      if (idx <= 0) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      return [item, ...arr];
    });
    setExpandedId(highlightId);
    setHighlighted(highlightId);
    setTimeout(() => {
      const el = testRefs.current[highlightId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    // 3초 후 빨간 테두리 제거
    const timer = setTimeout(() => setHighlighted(null), 5000);
    return () => clearTimeout(timer);
  }, [highlightId, loading, tests.length]);

  const handleDelete = async (test_id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch('/api/ab-tests',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({test_id})});
    fetchTests();
  };

  const handleCalendarClick = (test_id: string) => {
    setExpandedId(test_id);
    setTimeout(() => {
      const el = testRefs.current[test_id];
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-text-primary" style={{fontSize:'var(--font-page-title)'}}>🧪 A/B Test</h1>
          <p style={{ fontSize: "var(--font-small)", color: "var(--color-text-muted)", marginTop: 4 }}>등록한 테스트는 영구 보존 · 베이지안 승률 + P-value + 신뢰구간 자동 계산</p>
        </div>
      </div>

      {/* 달력 */}
      <div style={{overflowX:'auto'}}>
        <ABCalendar tests={filteredTests} onTestClick={handleCalendarClick}/>
      </div>

      {/* 등록 버튼 + 직무 필터 — 한 행 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', padding:'4px 0' }}>
        {/* + 새 A/B 테스트 등록 */}
        {!registerOpen && (
          <button onClick={() => setRegisterOpen(true)}
            className="px-3 py-1 rounded-lg font-semibold transition-all flex items-center gap-1"
            style={{ fontSize:'var(--font-body)', backgroundColor:'var(--color-accent)', color:'#fff', border:'none', cursor:'pointer' }}>
            + 새 A/B 테스트 등록
          </button>
        )}
        {/* 구분선 */}
        <span style={{ width:2, height:18, backgroundColor:'var(--color-border-subtle)', borderRadius:1, opacity:0.8 }} />
        {/* 직무 분류 */}
        {(IS_PORTFOLIO_CLIENT ? ['전체','그룹A','그룹B'] : ['전체','일용직','계약직']).map((g: string) => {
          const active = jobGroupFilter === g;
          return (
            <button key={g} onClick={() => handleJobGroupClick(g)}
              style={{ fontSize:'var(--font-label)', cursor:'pointer', borderRadius:6, padding:'3px 10px', fontWeight:600,
                backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-secondary)',
                border: 'none',
              }}>{g}</button>
          );
        })}
        {/* 구분선 */}
        <span style={{ width:2, height:18, backgroundColor:'var(--color-border-subtle)', borderRadius:1, opacity:0.8 }} />
        {/* 직무 버튼 */}
        {JOB_TYPES.map(jt => {
          const active = activeJobTypes.has(jt);
          return (
            <button key={jt} onClick={() => toggleJobType(jt)}
              style={{ fontSize:'var(--font-label)', cursor:'pointer', borderRadius:6, padding:'3px 10px', fontWeight:600,
                backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-secondary)',
                border: 'none',
              }}>{jt}</button>
          );
        })}
      </div>

      <RegisterForm onSaved={fetchTests} open={registerOpen} setOpen={setRegisterOpen}/>

      {loading ? (
        <div className="space-y-4" style={{position:'relative', zIndex:1}}>{[...Array(2)].map((_,i)=><div key={i} className="skeleton" style={{ height: 128 }}/>)}</div>
      ) : tests.length===0 ? (
        <div className="card" style={{position:'relative', zIndex:1}}>
          <EmptyState icon="🧪" title="등록된 A/B 테스트가 없습니다" description="위 버튼으로 첫 번째 테스트를 등록해보세요" />
        </div>
      ) : (
        <div className="space-y-4" style={{position:'relative', zIndex:1}}>
          {filteredTests.map(test => (
            <div key={test.test_id} ref={el=>{testRefs.current[test.test_id]=el;}}
              style={{ outline: highlighted===test.test_id ? '2px solid #ef4444' : 'none',
                borderRadius: 16, transition: 'outline 0.3s' }}>
              <TestCard test={test} onDelete={()=>handleDelete(test.test_id)} onRefresh={fetchTests}
                expanded={expandedId===test.test_id}
                onExpand={()=>setExpandedId(id=>id===test.test_id?null:test.test_id)}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ABTestPage() {
  return (
    <React.Suspense fallback={null}>
      <ABTestPageInner />
    </React.Suspense>
  );
}
