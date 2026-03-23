'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { fmt } from '@/lib/calculations';
import type { SAKeywordMetrics } from '@/lib/types';
import { thStickyStyle, tdStyle, rowBg, COL_W } from '@/lib/tableStyles';

// ─── Action 분류 재사용 (KeywordActionList와 동일 로직) ───────────────────────
type MetricKey  = 'applicant' | 'cvr' | 'cpa' | 'ctr' | 'cpc' | 'cost' | 'imp' | 'click';
type Operator   = '>=' | '>' | '<=' | '<' | '=';
type ValueType  = 'absolute' | 'groupAvg';
type Logic      = 'AND' | 'OR';
type ActionLabel = '최상위 유지' | '단가 UP' | '현상 유지' | '단가 DOWN' | '검토 필요' | 'OFF 권고';

interface Condition { id: string; metric: MetricKey; operator: Operator; value: number; valueType: ValueType; logic: Logic; }
interface ActionRule { label: ActionLabel; conditions: Condition[]; }

const ACTION_ICONS: Record<ActionLabel, string> = {
  '최상위 유지': '🏆', '단가 UP': '📈', '현상 유지': '⚖️',
  '단가 DOWN': '📉', '검토 필요': '🔍', 'OFF 권고': '🛑',
};
const ACTION_COLORS: Record<ActionLabel, string> = {
  '최상위 유지': 'var(--color-warning)',
  '단가 UP':    'var(--color-delta-pos)',
  '현상 유지':  'var(--color-text-secondary)',
  '단가 DOWN':  'var(--color-delta-neg)',
  '검토 필요':  '#a78bfa',
  'OFF 권고':   'var(--color-error)',
};

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

function evalCond(cond: Condition, metrics: any, avgCpa: number, avgCvr: number, dayCount: number): boolean {
  let actual = metrics[cond.metric] ?? 0;
  if (cond.metric === 'applicant') actual = actual / dayCount;
  const base = cond.metric === 'cpa' ? avgCpa : cond.metric === 'cvr' ? avgCvr : 1;
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
  let result = evalCond(rule.conditions[0], metrics, avgCpa, avgCvr, dayCount);
  for (let i = 1; i < rule.conditions.length; i++) {
    const cur = evalCond(rule.conditions[i], metrics, avgCpa, avgCvr, dayCount);
    result = rule.conditions[i-1].logic === 'AND' ? result && cur : result || cur;
  }
  return result;
}

function classifyKw(metrics: any, rules: ActionRule[], avgCpa: number, avgCvr: number, dayCount: number): ActionLabel {
  const off = rules.find(r => r.label === 'OFF 권고');
  if (off && evalRule(off, metrics, avgCpa, avgCvr, dayCount)) return 'OFF 권고';
  for (const rule of rules) {
    if (rule.label === 'OFF 권고') continue;
    if (evalRule(rule, metrics, avgCpa, avgCvr, dayCount)) return rule.label;
  }
  return '검토 필요';
}

// ─── 기본 포함어 목록 ─────────────────────────────────────────────────────────
const IS_PORTFOLIO_CLIENT = process.env.NEXT_PUBLIC_PORTFOLIO_MODE === 'true';
const DEFAULT_INCLUDES = IS_PORTFOLIO_CLIENT
  ? ['키워드1', '키워드2', '키워드3', '키워드4', '키워드5', '키워드6', '키워드7']
  : ['알바', '쿠팡', '상하차', '단기', '일급', '당일', '택배'];

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface KwRow extends SAKeywordMetrics {
  campaign?: string;
  group?:    string;
}

interface Props {
  rows:     KwRow[];
  dayCount: number;
  loading:  boolean;
  rules:    ActionRule[];
  avgCpa:   number;
  avgCvr:   number;
}

export function KeywordExplorer({ rows, dayCount, loading, rules, avgCpa, avgCvr }: Props) {
  const [checkedIncludes, setCheckedIncludes] = useState<string[]>(DEFAULT_INCLUDES);
  const [customIncludes,  setCustomIncludes]   = useState<string[]>([]);
  const [customInput,     setCustomInput]       = useState('');

  // BigQuery에서 커스텀 포함어 로드
  useEffect(() => {
    fetch('/api/sa-detail/action-settings')
      .then(r => r.json())
      .then(d => {
        const saved: string[] = d.settings?.explorer_includes ?? [];
        if (saved.length) {
          setCustomIncludes(saved);
          setCheckedIncludes(prev => [...new Set([...prev, ...saved])]);
        }
      })
      .catch(() => {});
  }, []);

  // BigQuery에 커스텀 포함어 저장
  const saveCustomIncludes = useCallback(async (list: string[]) => {
    try {
      await fetch('/api/sa-detail/action-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting_key: 'explorer_includes', setting_value: list }),
      });
    } catch (e) { console.error('[explorer_includes save]', e); }
  }, []);
  const [sortKey,  setSortKey]  = useState<'applicant' | 'click' | 'cost' | 'imp' | 'cpa' | 'cvr'>('applicant');
  const [sortAsc,  setSortAsc]  = useState(false);
  const [viewMode, setViewMode] = useState<'avg' | 'total'>('avg');

  const allIncludes = [...DEFAULT_INCLUDES, ...customIncludes];
  const activeIncludes = checkedIncludes;

  const toggleInclude = (kw: string) => {
    setCheckedIncludes(prev =>
      prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]
    );
  };

  const addCustom = () => {
    const v = customInput.trim();
    if (!v || allIncludes.includes(v)) return;
    const next = [...customIncludes, v];
    setCustomIncludes(next);
    setCheckedIncludes(prev => [...prev, v]);
    setCustomInput('');
    saveCustomIncludes(next);
  };

  const removeCustom = (kw: string) => {
    const next = customIncludes.filter(k => k !== kw);
    setCustomIncludes(next);
    setCheckedIncludes(prev => prev.filter(k => k !== kw));
    saveCustomIncludes(next);
  };

  // 필터링 + 정렬
  const results = useMemo(() => {
    if (!activeIncludes.length) return [];
    return rows
      .filter(r => activeIncludes.some(inc => r.keyword?.includes(inc)))
      .sort((a, b) => {
        const av = (a.selected as any)[sortKey] ?? 0;
        const bv = (b.selected as any)[sortKey] ?? 0;
        return sortAsc ? av - bv : bv - av;
      });
  }, [rows, activeIncludes, sortKey, sortAsc]);

  // 합계
  const totals = useMemo(() => {
    if (!results.length) return null;
    return results.reduce((acc, r) => ({
      imp:       acc.imp       + r.selected.imp,
      click:     acc.click     + r.selected.click,
      cost:      acc.cost      + r.selected.cost,
      applicant: acc.applicant + r.selected.applicant,
    }), { imp: 0, click: 0, cost: 0, applicant: 0 });
  }, [results]);

  const handleSort = (key: typeof sortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };
  const si = (key: string) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (loading) return (
    <div>{[...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height:32, marginBottom:'var(--space-1)', borderRadius:'var(--radius-xs)' }} />)}</div>
  );

  return (
    <div>
      {/* ── 포함어 필터 ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: 'var(--space-2)', marginBottom: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        backgroundColor: 'var(--color-surface-2)',
        borderRadius: 'var(--radius-sm)',
      }}>
        {allIncludes.map(kw => {
          const checked   = checkedIncludes.includes(kw);
          const isCustom  = customIncludes.includes(kw);
          return (
            <label key={kw} style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
              cursor: 'pointer', fontSize: 'var(--font-small)', fontWeight: checked ? 600 : 400,
              color: checked ? 'var(--color-accent)' : 'var(--color-text-muted)',
              padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)',
              backgroundColor: checked ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
              border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
              transition: `all var(--transition-fast)`,
            }}>
              <input
                type="checkbox" checked={checked}
                onChange={() => toggleInclude(kw)}
                style={{ accentColor: 'var(--color-accent)', width: 12, height: 12 }}
              />
              {kw}
              {isCustom && (
                <span
                  onClick={e => { e.preventDefault(); removeCustom(kw); }}
                  style={{ cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-tiny)', lineHeight: 1 }}
                >×</span>
              )}
            </label>
          );
        })}

        {/* 커스텀 추가 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <input
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="직접 입력..."
            style={{
              width: 90, padding: '2px var(--space-2)',
              backgroundColor: 'var(--color-surface-1)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-small)', color: 'var(--color-text-secondary)',
              outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
          />
          <button
            onClick={addCustom}
            style={{
              padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-small)', fontWeight: 600,
              border: '1px solid var(--color-accent)',
              backgroundColor: 'transparent', color: 'var(--color-accent)',
              cursor: 'pointer',
            }}
          >+ 추가</button>
        </div>
      </div>

      {/* ── 결과 요약 뱃지 + 토글 ─────────────────────────────────────────── */}
      {activeIncludes.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            color: 'var(--color-accent)', fontSize: 'var(--font-small)', fontWeight: 700,
          }}>
            [{activeIncludes.join(' | ')}] 포함 키워드 {results.length}개
          </span>
          {totals && (
            <>
              <span style={badge}>APP {viewMode==='avg' ? fmt.number(totals.applicant/dayCount,1) : fmt.number(totals.applicant)}</span>
              <span style={badge}>COST {viewMode==='avg' ? fmt.cost(totals.cost/dayCount) : fmt.cost(totals.cost)}</span>
              <span style={badge}>CLICK {viewMode==='avg' ? fmt.number(totals.click/dayCount,1) : fmt.number(totals.click)}</span>
              <span style={badge}>IMP {viewMode==='avg' ? fmt.number(totals.imp/dayCount,1) : fmt.number(totals.imp)}</span>
            </>
          )}
          </div>
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
        </div>
      )}

      {/* ── 테이블 ──────────────────────────────────────────────────────── */}
      {activeIncludes.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-body)' }}>
          포함어를 1개 이상 선택해 주세요
        </div>
      ) : results.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-body)' }}>
          선택한 포함어에 해당하는 키워드가 없습니다
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 400 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: COL_W.keyword  }} /> {/* KEYWORD */}
              <col style={{ width: COL_W.campaign }} /> {/* CAMPAIGN */}
              <col style={{ width: COL_W.group    }} /> {/* GROUP */}
              <col style={{ width: COL_W.imp      }} /> {/* IMP */}
              <col style={{ width: COL_W.click    }} /> {/* CLICK */}
              <col style={{ width: COL_W.ctr      }} /> {/* CTR */}
              <col style={{ width: COL_W.cost     }} /> {/* COST */}
              <col style={{ width: COL_W.cpc      }} /> {/* CPC */}
              <col style={{ width: COL_W.app      }} /> {/* APP */}
              <col style={{ width: COL_W.cpa      }} /> {/* CPA */}
              <col style={{ width: COL_W.cvr      }} /> {/* CVR */}
              <col style={{ width: COL_W.action   }} /> {/* ACTION */}
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thStickyStyle, textAlign: 'left',  cursor: 'default' }}>KEYWORD</th>
                <th style={{ ...thStickyStyle, textAlign: 'left',  cursor: 'default' }}>CAMPAIGN</th>
                <th style={{ ...thStickyStyle, textAlign: 'left',  cursor: 'default' }}>GROUP</th>
                <th onClick={() => handleSort('imp')}       style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>{viewMode==='avg'?'IMP (Avg)':'IMP'}{si('imp')}</th>
                <th onClick={() => handleSort('click')}     style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>{viewMode==='avg'?'CLICK (Avg)':'CLICK'}{si('click')}</th>
                <th style={{ ...thStickyStyle, textAlign: 'right', cursor: 'default' }}>CTR</th>
                <th onClick={() => handleSort('cost')}      style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>{viewMode==='avg'?'COST (Avg)':'COST'}{si('cost')}</th>
                <th style={{ ...thStickyStyle, textAlign: 'right', cursor: 'default' }}>CPC</th>
                <th onClick={() => handleSort('applicant')} style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>{viewMode==='avg'?'APP (Avg)':'APP'}{si('applicant')}</th>
                <th onClick={() => handleSort('cpa')}       style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>CPA{si('cpa')}</th>
                <th onClick={() => handleSort('cvr')}       style={{ ...thStickyStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>CVR{si('cvr')}</th>
                <th style={{ ...thStickyStyle, textAlign: 'center', cursor: 'default' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => {
                const s      = row.selected;
                const dc     = viewMode === 'avg' ? dayCount : 1;
                const bg     = rowBg(idx);
                const action = classifyKw(s, rules, avgCpa, avgCvr, dayCount);
                const kw     = row.keyword ?? '';

                // 포함어 하이라이트 (첫 번째 매칭)
                const matchedInc = activeIncludes.find(inc => kw.includes(inc));
                let highlighted: React.ReactNode = kw;
                if (matchedInc) {
                  const i2 = kw.indexOf(matchedInc);
                  highlighted = (<>
                    {kw.slice(0, i2)}
                    <mark style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)', color: 'var(--color-accent)', borderRadius: 'var(--radius-xs)' }}>
                      {kw.slice(i2, i2 + matchedInc.length)}
                    </mark>
                    {kw.slice(i2 + matchedInc.length)}
                  </>);
                }

                return (
                  <tr key={row.keyword} style={{ backgroundColor: bg }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlighted}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.campaign ?? '-'}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.group ?? '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmt.number(s.imp/dc, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmt.number(s.click/dc, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.pct(s.ctr)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmt.cost(s.cost/dc)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.cost(s.cpc)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>{fmt.number(s.applicant/dc, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.cost(s.cpa)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt.pct(s.cvr)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 'var(--font-tiny)', fontWeight: 700,
                        padding: '1px 6px', borderRadius: 'var(--radius-full)',
                        backgroundColor: `color-mix(in srgb, ${ACTION_COLORS[action]} 12%, transparent)`,
                        color: ACTION_COLORS[action],
                        border: `1px solid color-mix(in srgb, ${ACTION_COLORS[action]} 25%, transparent)`,
                        whiteSpace: 'nowrap',
                      }}>
                        {ACTION_ICONS[action]} {action}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const badge: React.CSSProperties = {
  padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
  backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-secondary)', fontSize: 'var(--font-small)', fontWeight: 600,
};
