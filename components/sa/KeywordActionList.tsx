'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { fmt } from '@/lib/calculations';
import type { SAKeywordMetrics } from '@/lib/types';
import { thStickyStyle, tdStyle, tdRStyle, rowBg, COL_W } from '@/lib/tableStyles';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────
type MetricKey  = 'applicant' | 'cvr' | 'cpa' | 'ctr' | 'cpc' | 'cost' | 'imp' | 'click';
type Operator   = '>=' | '>' | '<=' | '<' | '=';
type ValueType  = 'absolute' | 'groupAvg';
type Logic      = 'AND' | 'OR';
export type SAActionLabel =
  | '최상위 유지' | '단가 UP' | '현상 유지'
  | '단가 DOWN'  | '검토 필요' | 'OFF 권고';

interface Condition {
  id:        string;
  metric:    MetricKey;
  operator:  Operator;
  value:     number;
  valueType: ValueType;
  logic:     Logic;
}

interface ActionRule   { label: SAActionLabel; conditions: Condition[]; }
interface ExcludeRule  { id: string; metric: MetricKey; operator: Operator; value: number; logic: Logic; }

// ─── 기본값 ──────────────────────────────────────────────────────────────────
const DEFAULT_RULES: ActionRule[] = [
  { label: '최상위 유지', conditions: [
    { id:'1a', metric:'applicant', operator:'>=', value:3,   valueType:'absolute', logic:'AND' },
    { id:'1b', metric:'cvr',       operator:'>=', value:1.3, valueType:'groupAvg', logic:'AND' },
    { id:'1c', metric:'cpa',       operator:'<=', value:0.7, valueType:'groupAvg', logic:'AND' },
  ]},
  { label: '단가 UP', conditions: [
    { id:'2a', metric:'applicant', operator:'>=', value:1,   valueType:'absolute', logic:'AND' },
    { id:'2b', metric:'cvr',       operator:'>=', value:1.0, valueType:'groupAvg', logic:'AND' },
    { id:'2c', metric:'cpa',       operator:'<=', value:1.0, valueType:'groupAvg', logic:'AND' },
  ]},
  { label: '현상 유지', conditions: [
    { id:'3a', metric:'applicant', operator:'>=', value:1,   valueType:'absolute', logic:'AND' },
    { id:'3b', metric:'cvr',       operator:'>=', value:0.7, valueType:'groupAvg', logic:'AND' },
    { id:'3c', metric:'cvr',       operator:'<=', value:1.3, valueType:'groupAvg', logic:'AND' },
    { id:'3d', metric:'cpa',       operator:'>=', value:0.7, valueType:'groupAvg', logic:'AND' },
    { id:'3e', metric:'cpa',       operator:'<=', value:1.3, valueType:'groupAvg', logic:'AND' },
  ]},
  { label: '단가 DOWN', conditions: [
    { id:'4a', metric:'applicant', operator:'>=', value:1,   valueType:'absolute', logic:'AND' },
    { id:'4b', metric:'cvr',       operator:'<',  value:0.7, valueType:'groupAvg', logic:'OR'  },
    { id:'4c', metric:'cpa',       operator:'>',  value:1.3, valueType:'groupAvg', logic:'AND' },
  ]},
  { label: '검토 필요', conditions: [
    { id:'5a', metric:'applicant', operator:'<',  value:1,   valueType:'absolute', logic:'AND' },
  ]},
  { label: 'OFF 권고', conditions: [
    { id:'6a', metric:'applicant', operator:'<',  value:1,   valueType:'absolute', logic:'AND' },
    { id:'6b', metric:'cvr',       operator:'<=', value:0.5, valueType:'groupAvg', logic:'OR'  },
    { id:'6c', metric:'cpa',       operator:'>',  value:2.0, valueType:'groupAvg', logic:'AND' },
  ]},
];

const DEFAULT_EXCLUDES: ExcludeRule[] = [
  { id:'e1', metric:'cost',  operator:'<',  value:1000, logic:'OR' },
  { id:'e2', metric:'click', operator:'<=', value:1,    logic:'OR' },
];

const ACTION_TABS: { label: SAActionLabel; icon: string; color: string }[] = [
  { label: '최상위 유지', icon: '🏆', color: 'var(--color-warning)'       },
  { label: '단가 UP',    icon: '📈', color: 'var(--color-delta-pos)'      },
  { label: '현상 유지',  icon: '⚖️', color: 'var(--color-text-secondary)' },
  { label: '단가 DOWN',  icon: '📉', color: 'var(--color-delta-neg)'      },
  { label: '검토 필요',  icon: '🔍', color: '#a78bfa'                     },
  { label: 'OFF 권고',   icon: '🛑', color: 'var(--color-error)'          },
];

const METRIC_LABELS: Record<MetricKey, string> = {
  applicant:'지원자', cvr:'CVR', cpa:'CPA', ctr:'CTR',
  cpc:'CPC', cost:'COST', imp:'IMP', click:'CLICK',
};
const OPERATORS: Operator[] = ['>=', '>', '<=', '<', '='];

function uid() { return Math.random().toString(36).slice(2, 8); }

// ─── 분류 로직 ────────────────────────────────────────────────────────────────
function evalCond(cond: Condition, avg: Record<string,number>, dayCount: number): boolean {
  let actual = avg[cond.metric] ?? 0;
  if (cond.metric === 'applicant') actual = actual / dayCount;
  const base = cond.metric === 'cpa' ? (avg._avgCpa ?? 1)
             : cond.metric === 'cvr' ? (avg._avgCvr ?? 1) : 1;
  const threshold = cond.valueType === 'groupAvg' ? cond.value * base : cond.value;
  switch (cond.operator) {
    case '>=': return actual >= threshold;
    case '>':  return actual >  threshold;
    case '<=': return actual <= threshold;
    case '<':  return actual <  threshold;
    case '=':  return Math.abs(actual - threshold) < 0.0001;
    default:   return false;
  }
}

function evalRule(rule: ActionRule, metrics: any, avgCpa: number, avgCvr: number, dayCount: number): boolean {
  if (!rule.conditions.length) return false;
  const m = { ...metrics, _avgCpa: avgCpa, _avgCvr: avgCvr };
  let result = evalCond(rule.conditions[0], m, dayCount);
  for (let i = 1; i < rule.conditions.length; i++) {
    const prev = rule.conditions[i - 1];
    const cur  = evalCond(rule.conditions[i], m, dayCount);
    result = prev.logic === 'AND' ? result && cur : result || cur;
  }
  return result;
}

function classifyKw(metrics: any, rules: ActionRule[], avgCpa: number, avgCvr: number, dayCount: number): SAActionLabel {
  const off = rules.find(r => r.label === 'OFF 권고');
  if (off && evalRule(off, metrics, avgCpa, avgCvr, dayCount)) return 'OFF 권고';
  for (const rule of rules) {
    if (rule.label === 'OFF 권고') continue;
    if (evalRule(rule, metrics, avgCpa, avgCvr, dayCount)) return rule.label;
  }
  return '검토 필요';
}

function evalExclude(rules: ExcludeRule[], metrics: any, dayCount: number): boolean {
  if (!rules.length) return false;
  // OR 연결: 하나라도 걸리면 제외
  return rules.some(r => {
    let v = (metrics[r.metric] ?? 0) / dayCount;
    switch (r.operator) {
      case '<':  return v <  r.value;
      case '<=': return v <= r.value;
      case '>':  return v >  r.value;
      case '>=': return v >= r.value;
      case '=':  return Math.abs(v - r.value) < 0.0001;
      default:   return false;
    }
  });
}

// ─── BigQuery 설정 저장/로드 ──────────────────────────────────────────────────
async function loadSettings() {
  const res = await fetch('/api/sa-detail/action-settings');
  const data = await res.json();
  return data.settings ?? {};
}

async function saveSettings(key: string, value: any) {
  await fetch('/api/sa-detail/action-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setting_key: key, setting_value: value }),
  });
}

// ─── 조건 빌더 공통 UI ────────────────────────────────────────────────────────
function ConditionRow({ cond, isLast, showValueType, onChange, onRemove }: {
  cond: any; isLast: boolean; showValueType: boolean;
  onChange: (u: any) => void; onRemove: () => void;
}) {
  const sel: React.CSSProperties = {
    backgroundColor: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-sm)', padding: '3px 6px',
    fontSize: 'var(--font-small)', color: 'var(--color-text-secondary)',
    cursor: 'pointer', outline: 'none',
  };
  const inp: React.CSSProperties = { ...sel, width: 64, textAlign: 'right' as const };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'var(--space-1)', marginBottom:'var(--space-2)', flexWrap:'wrap' }}>
      <select value={cond.metric} onChange={e => onChange({ metric: e.target.value })} style={sel}>
        {(Object.keys(METRIC_LABELS) as MetricKey[]).map(k => <option key={k} value={k}>{METRIC_LABELS[k]}</option>)}
      </select>
      <select value={cond.operator} onChange={e => onChange({ operator: e.target.value })} style={{ ...sel, width:48 }}>
        {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      <input type="number" value={cond.value} step="0.1"
        onChange={e => onChange({ value: parseFloat(e.target.value) || 0 })} style={inp} />
      {showValueType && (
        <select value={cond.valueType} onChange={e => onChange({ valueType: e.target.value })} style={sel}>
          <option value="absolute">직접 입력</option>
          <option value="groupAvg">평균대비배율</option>
        </select>
      )}
      {!isLast && (
        <select value={cond.logic} onChange={e => onChange({ logic: e.target.value })} style={{ ...sel, width:52 }}>
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      )}
      {isLast && <div style={{ width: showValueType ? 52 : 0 }} />}
      <button onClick={onRemove}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontSize:'var(--font-body)', padding:'2px 4px' }}>
        🗑️
      </button>
    </div>
  );
}

// ─── 기준 설정 모달 ──────────────────────────────────────────────────────────
function CriteriaModal({ rules, excludes, onSave, onClose, saving }: {
  rules: ActionRule[]; excludes: ExcludeRule[];
  onSave: (r: ActionRule[], e: ExcludeRule[]) => void;
  onClose: () => void; saving: boolean;
}) {
  const [draftRules,    setDraftRules]    = useState<ActionRule[]>(() => JSON.parse(JSON.stringify(rules)));
  const [draftExcludes, setDraftExcludes] = useState<ExcludeRule[]>(() => JSON.parse(JSON.stringify(excludes)));

  const updateCond = (ri: number, ci: number, u: Partial<Condition>) => {
    setDraftRules(prev => { const n = JSON.parse(JSON.stringify(prev)); Object.assign(n[ri].conditions[ci], u); return n; });
  };
  const addCond = (ri: number) => {
    setDraftRules(prev => { const n = JSON.parse(JSON.stringify(prev)); n[ri].conditions.push({ id:uid(), metric:'applicant', operator:'>=', value:1, valueType:'absolute', logic:'AND' }); return n; });
  };
  const removeCond = (ri: number, ci: number) => {
    setDraftRules(prev => { const n = JSON.parse(JSON.stringify(prev)); n[ri].conditions.splice(ci, 1); return n; });
  };

  const updateExclude = (i: number, u: Partial<ExcludeRule>) => {
    setDraftExcludes(prev => { const n = JSON.parse(JSON.stringify(prev)); Object.assign(n[i], u); return n; });
  };
  const addExclude = () => {
    setDraftExcludes(prev => [...prev, { id:uid(), metric:'cost', operator:'<', value:0, logic:'OR' }]);
  };
  const removeExclude = (i: number) => {
    setDraftExcludes(prev => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'var(--color-overlay)', zIndex:'var(--z-modal)' as any, display:'flex', alignItems:'center', justifyContent:'center', padding:'var(--space-4)' }}>
      <div style={{ backgroundColor:'var(--color-surface-1)', border:'1px solid var(--color-border-default)', borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-xl)', width:'100%', maxWidth:700, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* 헤더 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-3) var(--space-5)', borderBottom:'1px solid var(--color-border-subtle)', flexShrink:0 }}>
          <span style={{ fontWeight:700, fontSize:'var(--font-body)', color:'var(--color-text-primary)' }}>⚙️ Action 분류 기준 설정</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontSize:'var(--font-body)' }}>✕</button>
        </div>

        {/* 바디 */}
        <div style={{ overflowY:'auto', flex:1, padding:'var(--space-4) var(--space-5)' }}>

          {/* 제외 조건 섹션 */}
          <div style={{ marginBottom:'var(--space-5)' }}>
            <div style={{ fontSize:'var(--font-label)', fontWeight:700, color:'var(--color-text-muted)', marginBottom:'var(--space-2)', letterSpacing:'var(--tracking-wide)', textTransform:'uppercase' }}>
              🚫 제외 조건 (일평균 기준, OR 연결)
            </div>
            <div style={{ border:'1px solid var(--color-border-default)', borderRadius:'var(--radius-sm)', padding:'var(--space-2) var(--space-3)', backgroundColor:'var(--color-surface-2)' }}>
              {draftExcludes.map((ex, i) => (
                <ConditionRow
                  key={ex.id} cond={ex} isLast={i === draftExcludes.length - 1}
                  showValueType={false}
                  onChange={u => updateExclude(i, u)}
                  onRemove={() => removeExclude(i)}
                />
              ))}
              <button onClick={addExclude} style={{ fontSize:'var(--font-small)', fontWeight:600, color:'var(--color-error)', background:'none', border:'none', cursor:'pointer', padding:'2px 0' }}>
                + 제외 조건 추가
              </button>
            </div>
          </div>

          {/* 분류 기준 */}
          {draftRules.map((rule, ri) => {
            const tab = ACTION_TABS.find(t => t.label === rule.label)!;
            return (
              <div key={rule.label} style={{ marginBottom:'var(--space-4)' }}>
                <div style={{ fontSize:'var(--font-label)', fontWeight:700, color:tab.color, marginBottom:'var(--space-2)' }}>
                  {tab.icon} {rule.label}
                </div>
                <div style={{ border:'1px solid var(--color-border-default)', borderRadius:'var(--radius-sm)', padding:'var(--space-2) var(--space-3)', backgroundColor:'var(--color-surface-2)' }}>
                  {rule.conditions.map((cond, ci) => (
                    <ConditionRow
                      key={cond.id} cond={cond} isLast={ci === rule.conditions.length - 1}
                      showValueType={true}
                      onChange={u => updateCond(ri, ci, u)}
                      onRemove={() => removeCond(ri, ci)}
                    />
                  ))}
                  <button onClick={() => addCond(ri)} style={{ fontSize:'var(--font-small)', fontWeight:600, color:'var(--color-accent)', background:'none', border:'none', cursor:'pointer', padding:'2px 0' }}>
                    + 조건 추가
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 푸터 */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'var(--space-3) var(--space-5)', borderTop:'1px solid var(--color-border-subtle)', flexShrink:0 }}>
          <button
            onClick={() => { setDraftRules(JSON.parse(JSON.stringify(DEFAULT_RULES))); setDraftExcludes(JSON.parse(JSON.stringify(DEFAULT_EXCLUDES))); }}
            style={{ fontSize:'var(--font-small)', fontWeight:600, color:'var(--color-text-muted)', backgroundColor:'transparent', border:'1px solid var(--color-border-default)', borderRadius:'var(--radius-sm)', padding:'var(--space-1) var(--space-3)', cursor:'pointer' }}
          >기본값 복원</button>
          <div style={{ display:'flex', gap:'var(--space-2)' }}>
            <button onClick={onClose} style={{ fontSize:'var(--font-small)', fontWeight:600, color:'var(--color-text-secondary)', backgroundColor:'transparent', border:'1px solid var(--color-border-default)', borderRadius:'var(--radius-sm)', padding:'var(--space-1) var(--space-3)', cursor:'pointer' }}>취소</button>
            <button
              onClick={() => onSave(draftRules, draftExcludes)}
              disabled={saving}
              style={{ fontSize:'var(--font-small)', fontWeight:700, color:'#fff', backgroundColor: saving ? 'var(--color-text-muted)' : 'var(--color-accent)', border:'none', borderRadius:'var(--radius-sm)', padding:'var(--space-1) var(--space-4)', cursor: saving ? 'not-allowed' : 'pointer' }}
            >{saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 비율 표시 헬퍼 ──────────────────────────────────────────────────────────
function RatioBadge({ ratio, invert = false }: { ratio: number; invert?: boolean }) {
  if (!isFinite(ratio) || ratio === 0) return <span style={{ color:'var(--color-text-muted)' }}>-</span>;
  const pct = (ratio * 100).toFixed(0) + '%';
  // invert: CPA는 낮을수록 좋음
  const isGood = invert ? ratio <= 1 : ratio >= 1;
  return (
    <span style={{ fontWeight:600, color: isGood ? 'var(--color-delta-pos)' : 'var(--color-delta-neg)' }}>
      {pct}
    </span>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export interface ActionSettings {
  rules:    ActionRule[];
  excludes: ExcludeRule[];
  avgCpa:   number;
  avgCvr:   number;
  totalAvg: { cpa: number; cvr: number; app: number };
  allKeywords: SAKeywordMetrics[];
  onSettingsChange: (rules: ActionRule[], excludes: ExcludeRule[]) => void;
  settingsLoading: boolean;
}

interface Props {
  rows:     SAKeywordMetrics[];
  dayCount: number;
  loading:  boolean;
  settings: ActionSettings;
}

export function KeywordActionList({ rows, dayCount, loading, settings }: Props) {
  const { rules, excludes, avgCpa, avgCvr, totalAvg, allKeywords, onSettingsChange, settingsLoading } = settings;
  const [activeTab, setActiveTab] = useState<SAActionLabel>('최상위 유지');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [viewMode,  setViewMode]  = useState<'avg' | 'total'>('avg');

  // 저장
  const handleSave = useCallback(async (newRules: ActionRule[], newExcludes: ExcludeRule[]) => {
    setSaving(true);
    try {
      await Promise.all([
        saveSettings('action_criteria', newRules),
        saveSettings('exclusion_rules', newExcludes),
      ]);
      onSettingsChange(newRules, newExcludes);
      setModalOpen(false);
    } catch (e) {
      console.error('[action-settings save]', e);
    } finally {
      setSaving(false);
    }
  }, [onSettingsChange]);

  // 분류
  const classified = useMemo(() => {
    return allKeywords.map(r => ({
      ...r,
      label: classifyKw(r.selected, rules, avgCpa, avgCvr, dayCount),
    }));
  }, [allKeywords, rules, avgCpa, avgCvr, dayCount]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    classified.forEach(r => { c[r.label] = (c[r.label] ?? 0) + 1; });
    return c;
  }, [classified]);

  // 현재 탭 키워드
  const tabRows = useMemo(() =>
    classified.filter(r => r.label === activeTab)
      .sort((a, b) => b.selected.applicant - a.selected.applicant),
    [classified, activeTab]
  );

  // 탭(그룹) 평균
  const groupAvg = useMemo(() => {
    if (!tabRows.length) return { cpa: 0, cvr: 0, app: 0 };
    const n = tabRows.length;
    return {
      cpa: tabRows.reduce((s, r) => s + r.selected.cpa, 0) / n,
      cvr: tabRows.reduce((s, r) => s + r.selected.cvr, 0) / n,
      app: tabRows.reduce((s, r) => s + r.selected.applicant, 0) / n / dayCount,
    };
  }, [tabRows, dayCount]);

  if (loading || settingsLoading) return (
    <div style={{ padding:'var(--space-5)' }}>
      <div className="skeleton" style={{ height:36, marginBottom:'var(--space-3)', borderRadius:'var(--radius-sm)' }} />
      {[...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height:32, marginBottom:'var(--space-1)', borderRadius:'var(--radius-xs)' }} />)}
    </div>
  );

  return (
    <div>
      {/* 분류 탭 + 기준 설정 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-3)', flexWrap:'wrap', gap:'var(--space-2)' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-1)' }}>
          {ACTION_TABS.map(tab => {
            const cnt = counts[tab.label] ?? 0;
            const isAct = activeTab === tab.label;
            return (
              <button key={tab.label} onClick={() => setActiveTab(tab.label)} style={{
                display:'flex', alignItems:'center', gap:'var(--space-1)',
                padding:'var(--space-1) var(--space-3)', borderRadius:'var(--radius-sm)',
                fontSize:'var(--font-label)', fontWeight:700,
                border:`1px solid ${isAct ? tab.color : 'var(--color-border-default)'}`,
                backgroundColor: isAct ? `color-mix(in srgb, ${tab.color} 15%, transparent)` : 'transparent',
                color: isAct ? tab.color : 'var(--color-text-muted)',
                cursor:'pointer', transition:'all var(--transition-normal)',
              }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {cnt > 0 && <span style={{ backgroundColor: isAct ? tab.color : 'var(--color-surface-2)', color: isAct ? '#fff' : 'var(--color-text-muted)', borderRadius:'var(--radius-full)', fontSize:'var(--font-tiny)', fontWeight:700, padding:'1px 6px' }}>{cnt}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
          {/* 누적/평균 토글 */}
          <div style={{ display:'flex', gap:2, backgroundColor:'var(--color-surface-2)', borderRadius:'var(--radius-sm)', padding:2, border:'1px solid var(--color-border-default)' }}>
            {(['avg', 'total'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding:'2px 10px', borderRadius:'var(--radius-xs)',
                fontSize:'var(--font-label)', fontWeight:600, border:'none', cursor:'pointer',
                backgroundColor: viewMode === m ? 'var(--color-accent)' : 'transparent',
                color: viewMode === m ? '#fff' : 'var(--color-text-muted)',
                transition:'all var(--transition-fast)',
              }}>{m === 'avg' ? '일평균' : '누적'}</button>
            ))}
          </div>
          {/* 평균 실적 요약 */}
          <span style={{ fontSize:'var(--font-small)', color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>
            평균 실적 :
            <strong style={{ color:'var(--color-text-secondary)', marginLeft:'var(--space-1)' }}>CPA {fmt.cost(totalAvg.cpa)}</strong>
            <strong style={{ color:'var(--color-text-secondary)', marginLeft:'var(--space-2)' }}>CVR {fmt.pct(totalAvg.cvr)}</strong>
            <strong style={{ color:'var(--color-accent)',          marginLeft:'var(--space-2)' }}>APP {fmt.number(totalAvg.app, 1)}</strong>
            <span style={{ marginLeft:'var(--space-2)', color:'var(--color-border-strong)' }}>|</span>
            <span style={{ marginLeft:'var(--space-2)' }}>분석 키워드 <strong style={{ color:'var(--color-text-secondary)' }}>{allKeywords.length}개</strong></span>
          </span>
          <button onClick={() => setModalOpen(true)} style={{
            display:'flex', alignItems:'center', gap:'var(--space-1)',
            padding:'var(--space-1) var(--space-3)', borderRadius:'var(--radius-sm)',
            fontSize:'var(--font-label)', fontWeight:600,
            border:'1px solid var(--color-border-default)',
            backgroundColor:'var(--color-surface-2)', color:'var(--color-text-secondary)',
            cursor:'pointer', transition:'all var(--transition-normal)', whiteSpace:'nowrap',
          }}>⚙️ 기준 설정</button>
        </div>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX:'auto', maxHeight:420 }}>
        {tabRows.length === 0 ? (
          <div style={{ padding:'var(--space-6)', textAlign:'center', color:'var(--color-text-muted)', fontSize:'var(--font-body)' }}>
            해당 분류의 키워드가 없습니다
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{ width: COL_W.keyword }} />  {/* KEYWORD */}
                  <col style={{ width: COL_W.click   }} />  {/* CLICK */}
                  <col style={{ width: COL_W.cost    }} />  {/* COST */}
                  <col style={{ width: COL_W.cpc     }} />  {/* CPC */}
                  <col style={{ width: COL_W.app     }} />  {/* APP */}
                  <col style={{ width: COL_W.ratio   }} />  {/* APP vs 평균(%) */}
                  <col style={{ width: COL_W.cpa     }} />  {/* CPA */}
                  <col style={{ width: COL_W.ratio   }} />  {/* CPA vs 평균(%) */}
                  <col style={{ width: COL_W.cvr     }} />  {/* CVR */}
                  <col style={{ width: COL_W.ratio   }} />  {/* CVR vs 평균(%) */}
                </colgroup>
                
                
                
            <thead>
              <tr>
                <th style={{ ...thStickyStyle, textAlign:'left', position:'sticky', left:0, zIndex:3, overflow:'hidden', textOverflow:'ellipsis' }}>KEYWORD</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>{viewMode==='avg'?'CLICK (Avg)':'CLICK'}</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>{viewMode==='avg'?'COST (Avg)':'COST'}</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>CPC</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>{viewMode==='avg'?'APP (Avg)':'APP'}</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>APP vs 평균(%)</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>CPA</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>CPA vs 평균(%)</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>CVR</th>
                <th style={{ ...thStickyStyle, textAlign:'right' }}>CVR vs 평균(%)</th>
              </tr>
            </thead>
            <tbody>
              {tabRows.map((row, idx) => {
                const s   = row.selected;
                const dc  = viewMode === 'avg' ? dayCount : 1;
                const app   = s.applicant / dc;
                const click = s.click     / dc;
                const cost  = s.cost      / dc;
                const cpc   = s.cpc;
                const cpa   = s.cpa;
                const cvr   = s.cvr;
                // vs 평균(%) 비율 — 항상 일평균 기준
                const appAvg     = s.applicant / dayCount;
                const appVsTotal = totalAvg.app > 0 ? appAvg / totalAvg.app : 0;
                const cpaVsTotal = totalAvg.cpa > 0 ? cpa    / totalAvg.cpa : 0;
                const cvrVsTotal = totalAvg.cvr > 0 ? cvr    / totalAvg.cvr : 0;

                const bg = rowBg(idx);
                return (
                  <tr key={row.keyword} style={{ backgroundColor:bg }}>
                    <td style={{ ...tdStyle, fontWeight:600, color:'var(--color-text-primary)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', position:'sticky', left:0, backgroundColor: idx%2===0 ? 'var(--color-surface-1)' : 'var(--color-surface-2)' }}>
                      {row.keyword}
                    </td>
                    <td style={tdRStyle}>{fmt.number(click, 1)}</td>
                    <td style={tdRStyle}>{fmt.cost(cost)}</td>
                    <td style={tdRStyle}>{fmt.cost(cpc)}</td>
                    <td style={{ ...tdRStyle, fontWeight:700, color:'var(--color-accent)' }}>{fmt.number(app, 1)}</td>
                    <td style={{ ...tdRStyle }}><RatioBadge ratio={appVsTotal} /></td>
                    <td style={tdRStyle}>{fmt.cost(cpa)}</td>
                    <td style={{ ...tdRStyle }}><RatioBadge ratio={cpaVsTotal} invert /></td>
                    <td style={tdRStyle}>{fmt.pct(cvr)}</td>
                    <td style={{ ...tdRStyle }}><RatioBadge ratio={cvrVsTotal} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>


      {/* 모달 */}
      {modalOpen && (
        <CriteriaModal
          rules={rules} excludes={excludes}
          onSave={handleSave} onClose={() => setModalOpen(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
