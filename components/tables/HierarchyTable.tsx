'use client';

import { useState, useMemo } from 'react';
import { fmt, deltaStyle, calcMetrics, calcDelta } from '@/lib/calculations';
import type { DateRange, MetricsRow } from '@/lib/types';
import { thStyle } from '@/lib/tableStyles';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface HierarchyRow {
  date?: string;
  campaign: string;
  group: string;
  ad: string;
  imp: number; click: number; cost: number; applicant: number;
}

interface ComparisonItem {
  key: string;
  campaign?: string;
  group?: string;
  ad?: string;
  selected: MetricsRow;
  compared: MetricsRow;
  delta: MetricsRow;
  deltaPercent: MetricsRow;
}

interface ComparisonData {
  campaign: ComparisonItem[];
  group: ComparisonItem[];
  ad: ComparisonItem[];
}

interface HierarchyTableProps {
  mode: 'daily' | 'comparison';
  title?: React.ReactNode;  // 외부에서 ST()로 전달 가능
  hierarchyData?: HierarchyRow[];
  comparisonData?: ComparisonData;
  selectedRange?: DateRange;
  compareRange?: DateRange;
  loading?: boolean;
}

type TabLevel = 'campaign' | 'group' | 'ad';

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const METRIC_COLS = [
  { key: 'imp',       label: 'IMP',   fmtFn: (v: number) => fmt.number(v),       isPct: false },
  { key: 'click',     label: 'CLICK', fmtFn: (v: number) => fmt.number(v),       isPct: false },
  { key: 'ctr',       label: 'CTR',   fmtFn: (v: number) => fmt.pct(v),          isPct: true  },
  { key: 'cost',      label: 'COST',  fmtFn: (v: number) => fmt.cost(v),         isPct: false, invert: true },
  { key: 'cpc',       label: 'CPC',   fmtFn: (v: number) => fmt.cost(v),         isPct: false, invert: true },
  { key: 'applicant', label: 'APP',   fmtFn: (v: number) => fmt.number(v),       isPct: false },
  { key: 'cpa',       label: 'CPA',   fmtFn: (v: number) => fmt.cost(v),         isPct: false, invert: true },
  { key: 'cvr',       label: 'CVR',   fmtFn: (v: number) => fmt.pct(v),          isPct: true  },
] as const;

const CAMP_COLORS = [
  'color-mix(in srgb, var(--color-accent) 5%, transparent)',
  'color-mix(in srgb, var(--color-chart-bar) 5%, transparent)',
  'color-mix(in srgb, var(--color-chart-line) 5%, transparent)',
  'color-mix(in srgb, var(--color-delta-pos) 5%, transparent)',
  'color-mix(in srgb, var(--color-delta-neg) 5%, transparent)',
];

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────
function aggregateRows(rows: HierarchyRow[]): MetricsRow {
  const t = rows.reduce(
    (acc, r) => ({ imp: acc.imp + (r.imp ?? 0), click: acc.click + (r.click ?? 0), cost: acc.cost + (r.cost ?? 0), applicant: acc.applicant + (r.applicant ?? 0) }),
    { imp: 0, click: 0, cost: 0, applicant: 0 }
  );
  return calcMetrics(t);
}

// 날짜별 집계 (중복 날짜 제거)
function aggregateByDate(rows: HierarchyRow[]): { date: string; metrics: MetricsRow }[] {
  const dateMap = new Map<string, { imp: number; click: number; cost: number; applicant: number }>();
  for (const r of rows) {
    const d = r.date ?? '';
    if (!dateMap.has(d)) dateMap.set(d, { imp: 0, click: 0, cost: 0, applicant: 0 });
    const acc = dateMap.get(d)!;
    acc.imp += r.imp ?? 0;
    acc.click += r.click ?? 0;
    acc.cost += r.cost ?? 0;
    acc.applicant += r.applicant ?? 0;
  }
  return [...dateMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, raw]) => ({ date, metrics: calcMetrics(raw) }));
}

// ─── Period Grouping ─────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y.slice(2)}/${parseInt(m)}/${parseInt(d)}`;
}

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d2.getUTCDay() || 7;
  d2.setUTCDate(d2.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d2.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d2.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function groupDateRows(
  dateRows: { date: string; metrics: MetricsRow }[],
  period: Period
): { date: string; metrics: MetricsRow }[] {
  if (period === 'daily') return dateRows;
  const keyFn = period === 'weekly' ? getISOWeekKey : (d: string) => d.slice(0, 7);
  const groups = new Map<string, { items: { date: string; metrics: MetricsRow }[] }>();
  for (const item of dateRows) {
    const key = keyFn(item.date);
    if (!groups.has(key)) groups.set(key, { items: [] });
    groups.get(key)!.items.push(item);
  }
  const result: { date: string; metrics: MetricsRow; _sortKey: string }[] = [];
  for (const [key, { items }] of groups) {
    const dates = items.map(i => i.date);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    const rangeStr = minDate === maxDate ? formatDateShort(minDate) : `${formatDateShort(minDate)} ~ ${formatDateShort(maxDate)}`;
    let label: string;
    if (period === 'weekly') {
      label = `${parseInt(key.split('-W')[1])}wk (${rangeStr})`;
    } else {
      const [y, m] = key.split('-');
      label = `${y.slice(2)}/${m} (${rangeStr})`;
    }
    const raw = items.reduce(
      (acc, i) => ({ imp: acc.imp + i.metrics.imp, click: acc.click + i.metrics.click, cost: acc.cost + i.metrics.cost, applicant: acc.applicant + i.metrics.applicant }),
      { imp: 0, click: 0, cost: 0, applicant: 0 }
    );
    result.push({ date: label, metrics: calcMetrics(raw), _sortKey: minDate });
  }
  return result.sort((a, b) => b._sortKey.localeCompare(a._sortKey)).map(({ date, metrics }) => ({ date, metrics }));
}

const PERIOD_BTNS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

// ─── 탭 버튼 ─────────────────────────────────────────────────────────────────
function TabButtons({ tab, setTab }: { tab: TabLevel; setTab: (t: TabLevel) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['campaign', 'group', 'ad'] as TabLevel[]).map(t => (
        <button key={t} onClick={() => setTab(t)} style={{
          padding: '3px 10px', borderRadius: 6, fontSize: 'var(--font-label)', fontWeight: 600,
          border: 'none', cursor: 'pointer', transition: 'all 0.15s',
          backgroundColor: tab === t ? 'var(--color-accent)' : 'transparent',
          color: tab === t ? '#fff' : 'var(--color-text-secondary)',
        }}>
          {t === 'campaign' ? 'Campaign' : t === 'group' ? 'Group' : 'Ad'}
        </button>
      ))}
    </div>
  );
}

// ─── Daily Table ───────────────────────────────────────────────────────────────
function DailyHierarchyTable({ data, title }: { data: HierarchyRow[]; title?: React.ReactNode }) {
  const [tab, setTab] = useState<TabLevel>('campaign');
  const [period, setPeriod] = useState<Period>('daily');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = data.filter(r => (r.imp ?? 0) > 0);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const td = (right = true, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: 'var(--font-table-body)', color: 'var(--color-text-secondary)',
    padding: '5px 8px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
    ...extra,
  });

  // ── Campaign tab ──
  const campaignContent = useMemo(() => {
    if (tab !== 'campaign') return null;
    const campMap = new Map<string, HierarchyRow[]>();
    for (const r of filtered) {
      if (!campMap.has(r.campaign)) campMap.set(r.campaign, []);
      campMap.get(r.campaign)!.push(r);
    }
    return [...campMap.entries()]
      .sort((a, b) => aggregateRows(b[1]).applicant - aggregateRows(a[1]).applicant)
      .map(([camp, rows], ci) => ({
        bgColor: CAMP_COLORS[ci % CAMP_COLORS.length],
        camp, ci,
        metrics: aggregateRows(rows),
        dateRows: groupDateRows(aggregateByDate(rows), period),
      }));
  }, [tab, period, filtered]);

  // ── Group tab ──
  const groupContent = useMemo(() => {
    if (tab !== 'group') return null;
    // campaign → groups map
    const campMap = new Map<string, { groups: Map<string, HierarchyRow[]>; campRows: HierarchyRow[] }>();
    for (const r of filtered) {
      if (!campMap.has(r.campaign)) campMap.set(r.campaign, { groups: new Map(), campRows: [] });
      const cm = campMap.get(r.campaign)!;
      cm.campRows.push(r);
      if (!cm.groups.has(r.group)) cm.groups.set(r.group, []);
      cm.groups.get(r.group)!.push(r);
    }
    const campOrder = [...campMap.entries()]
      .sort((a, b) => aggregateRows(b[1].campRows).applicant - aggregateRows(a[1].campRows).applicant);
    return campOrder.map(([camp, { campRows, groups }], ci) => ({
      bgColor: CAMP_COLORS[ci % CAMP_COLORS.length],
      camp, ci,
      campMetrics: aggregateRows(campRows),
      groups: [...groups.entries()].map(([grp, rows]) => ({
        group: grp,
        metrics: aggregateRows(rows),
        dateRows: groupDateRows(aggregateByDate(rows), period),
      })),
    }));
  }, [tab, period, filtered]);

  // ── Ad tab ──
  const adContent = useMemo(() => {
    if (tab !== 'ad') return null;
    // campaign → group → ads
    const campMap = new Map<string, {
      campRows: HierarchyRow[];
      groups: Map<string, { grpRows: HierarchyRow[]; ads: Map<string, HierarchyRow[]> }>;
    }>();
    for (const r of filtered) {
      if (!campMap.has(r.campaign)) campMap.set(r.campaign, { campRows: [], groups: new Map() });
      const cm = campMap.get(r.campaign)!;
      cm.campRows.push(r);
      if (!cm.groups.has(r.group)) cm.groups.set(r.group, { grpRows: [], ads: new Map() });
      const gm = cm.groups.get(r.group)!;
      gm.grpRows.push(r);
      if (!gm.ads.has(r.ad)) gm.ads.set(r.ad, []);
      gm.ads.get(r.ad)!.push(r);
    }
    const campOrder = [...campMap.entries()]
      .sort((a, b) => aggregateRows(b[1].campRows).applicant - aggregateRows(a[1].campRows).applicant);
    return campOrder.map(([camp, { campRows, groups }], ci) => ({
      bgColor: CAMP_COLORS[ci % CAMP_COLORS.length],
      camp, ci,
      groups: [...groups.entries()].map(([grp, { grpRows, ads }]) => ({
        group: grp,
        grpMetrics: aggregateRows(grpRows),
        ads: [...ads.entries()]
          .sort((a, b) => aggregateRows(b[1]).applicant - aggregateRows(a[1]).applicant)
          .map(([ad, rows]) => ({
            ad,
            metrics: aggregateRows(rows),
            dateRows: groupDateRows(aggregateByDate(rows), period),
          })),
      })),
    }));
  }, [tab, filtered]);

  const metricCells = (metrics: any, muted = false) =>
    METRIC_COLS.map(c => (
      <td key={c.key} style={{
        ...td(),
        color: c.key === 'applicant' && !muted ? 'var(--color-accent)' : muted ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
        fontWeight: c.key === 'applicant' && !muted ? 700 : 400,
        fontSize: 'var(--font-table-body)',
      }}>
        {c.fmtFn((metrics as any)[c.key] ?? 0)}
      </td>
    ));

  const expandToggle = (key: string, hasRows: boolean) => (
    hasRows ? (
      <span
        onClick={() => toggleExpand(key)}
        style={{ cursor: 'pointer', marginRight: 4, fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', userSelect: 'none' }}
      >
        {expanded.has(key) ? '▼' : '▶'}
      </span>
    ) : null
  );

  const dateSubRows = (parentKey: string, dateRows: { date: string; metrics: MetricsRow }[], bgColor: string) => {
    if (!expanded.has(parentKey)) return null;
    const validRows = dateRows.filter(({ metrics }) => (metrics.imp ?? 0) > 1);
    return validRows.map(({ date, metrics }) => (
      <tr key={`dr:${parentKey}:${date}`} style={{ backgroundColor: 'color-mix(in srgb, var(--color-border-subtle) 15%, transparent)' }}>
        <td style={{ ...td(false), paddingLeft: 32, color: 'var(--color-text-muted)', fontSize: 'var(--font-table-body)',
          whiteSpace: 'nowrap', minWidth: period === 'daily' ? 80 : 220 }}>
          ↳ {date}
        </td>
        {metricCells(metrics, true)}
      </tr>
    ));
  };

  return (
    <>
      <div className="section-header" style={{ marginBottom: 12 }}>
        {title && <span className="section-title">{title}</span>}
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          {/* B. 기간 버튼 */}
          <div style={{ display:'flex', gap:4 }}>
            {PERIOD_BTNS.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)} style={{
                padding:'3px 10px', borderRadius:6, fontSize:'var(--font-label)', fontWeight:600,
                border:'none', cursor:'pointer', transition:'all 0.15s',
                backgroundColor: period === key ? 'var(--color-accent)' : 'transparent',
                color: period === key ? '#fff' : 'var(--color-text-secondary)',
              }}>{label}</button>
            ))}
          </div>
          {/* 구분선 */}
          <span style={{ width:2, height:18, backgroundColor:'var(--color-border-subtle)', borderRadius:1, opacity:0.8, flexShrink:0 }} />
          {/* A. 계층 버튼 — colorAccent 파랑 */}
          <TabButtons tab={tab} setTab={setTab} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: tab === 'ad' ? 280 : 240 }}>
                {tab === 'campaign' ? 'CAMPAIGN' : tab === 'group' ? 'CAMPAIGN / GROUP' : 'CAMPAIGN / GROUP / AD'}
              </th>
              {METRIC_COLS.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {/* ── Campaign tab ── */}
            {tab === 'campaign' && campaignContent?.map(item => [
              <tr key={item.camp} style={{ backgroundColor: item.ci % 2 === 0 ? 'transparent' : item.bgColor, borderTop: '1px solid var(--color-border-subtle)' }}>
                <td style={{ ...td(false), fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {expandToggle(item.camp, item.dateRows.length > 0)}
                  {item.camp}
                </td>
                {metricCells(item.metrics)}
              </tr>,
              ...(dateSubRows(item.camp, item.dateRows, item.bgColor) ?? []),
            ])}

            {/* ── Group tab ── */}
            {tab === 'group' && groupContent?.map(campItem => [
              // 캠페인 헤더 행
              <tr key={`camp:${campItem.camp}`} style={{
                backgroundColor: `color-mix(in srgb, ${campItem.bgColor} 200%, var(--color-border-subtle) 30%)`,
                borderTop: '2px solid var(--color-border-subtle)',
              }}>
                <td colSpan={METRIC_COLS.length + 1} style={{
                  ...td(false),
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  padding: '4px 8px',
                  letterSpacing: 'var(--tracking-normal)',
                }}>
                  📁 {campItem.camp}
                </td>
              </tr>,
              // 그룹 행들
              ...campItem.groups.map((grpItem, gi) => [
                <tr key={`grp:${campItem.camp}:${grpItem.group}`} style={{ backgroundColor: gi % 2 === 0 ? 'transparent' : campItem.bgColor }}>
                  <td style={{ ...td(false), paddingLeft: 16 }}>
                    {expandToggle(`grp:${campItem.camp}:${grpItem.group}`, grpItem.dateRows.length > 0)}
                    <span style={{ fontSize: 'var(--font-table-body)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{grpItem.group}</span>
                  </td>
                  {metricCells(grpItem.metrics)}
                </tr>,
                ...(dateSubRows(`grp:${campItem.camp}:${grpItem.group}`, grpItem.dateRows, campItem.bgColor) ?? []),
              ]),
            ])}

            {/* ── Ad tab ── */}
            {tab === 'ad' && adContent?.map(campItem => [
              // 캠페인 헤더
              <tr key={`camp:${campItem.camp}`} style={{
                backgroundColor: `color-mix(in srgb, ${campItem.bgColor} 200%, var(--color-border-subtle) 30%)`,
                borderTop: '2px solid var(--color-border-subtle)',
              }}>
                <td colSpan={METRIC_COLS.length + 1} style={{
                  ...td(false), fontWeight: 700,
                  color: 'var(--color-text-muted)', padding: '4px 8px',
                }}>
                  📁 {campItem.camp}
                </td>
              </tr>,
              // 그룹별
              ...campItem.groups.map(grpItem => [
                // 그룹 헤더
                <tr key={`grp:${campItem.camp}:${grpItem.group}`} style={{ backgroundColor: campItem.bgColor }}>
                  <td colSpan={METRIC_COLS.length + 1} style={{
                    ...td(false), fontWeight: 600,
                    color: 'var(--color-text-muted)', paddingLeft: 16, padding: '3px 8px 3px 16px',
                  }}>
                    └ {grpItem.group}
                  </td>
                </tr>,
                // 소재 행들
                ...grpItem.ads.map((adItem, ai) => [
                  <tr key={`ad:${campItem.camp}:${grpItem.group}:${adItem.ad}`}
                    style={{ backgroundColor: ai % 2 === 0 ? 'transparent' : campItem.bgColor, borderTop: '1px dashed color-mix(in srgb, var(--color-border-subtle) 50%, transparent)' }}>
                    <td style={{ ...td(false), paddingLeft: 28 }}>
                      {expandToggle(`ad:${campItem.camp}:${grpItem.group}:${adItem.ad}`, adItem.dateRows.length > 0)}
                      <span style={{ fontSize: 'var(--font-table-body)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{adItem.ad}</span>
                    </td>
                    {metricCells(adItem.metrics)}
                  </tr>,
                  ...(dateSubRows(`ad:${campItem.camp}:${grpItem.group}:${adItem.ad}`, adItem.dateRows, campItem.bgColor) ?? []),
                ]),
              ]),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Comparison Table ──────────────────────────────────────────────────────────
function ComparisonHierarchyTable({
  data,
  selectedRange,
  compareRange,
  title,
}: {
  data: ComparisonData;
  selectedRange: DateRange;
  compareRange: DateRange;
  title?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabLevel>('campaign');

  const td = (right = true): React.CSSProperties => ({
    fontSize: 'var(--font-table-body)', color: 'var(--color-text-secondary)',
    padding: '5px 6px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
  });

  const fmtDelta = (col: typeof METRIC_COLS[number], deltaVal: number) => {
    const sign = deltaVal >= 0 ? '+' : '';
    if (col.isPct) return `${sign}${(deltaVal * 100).toFixed(2)}%p`;
    if (col.key === 'cost' || col.key === 'cpc' || col.key === 'cpa')
      return `${sign}₩${Math.round(deltaVal).toLocaleString('ko-KR')}`;
    return `${sign}${Math.round(deltaVal).toLocaleString('ko-KR')}`;
  };

  // 4행(SEL/CMP/Δ/Δ%) 렌더링
  const metricRows = (item: ComparisonItem, bgColor: string, labelCell: React.ReactNode, paddingLeft = 8) => [
    <tr key={`${item.key}:sel`} style={{ backgroundColor: bgColor, borderTop: '1px solid var(--color-border-subtle)' }}>
      <td style={{ ...td(false), paddingLeft }}>{labelCell}</td>
      <td style={{ ...td(false), fontSize: 'var(--font-tiny)', color: 'var(--color-accent)', fontWeight: 700 }}>기준</td>
      {METRIC_COLS.map(c => (
        <td key={c.key} style={{ ...td(), color: c.key === 'applicant' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: c.key === 'applicant' ? 700 : 400 }}>
          {c.fmtFn((item.selected as any)[c.key] ?? 0)}
        </td>
      ))}
    </tr>,
    <tr key={`${item.key}:cmp`} style={{ backgroundColor: bgColor }}>
      <td style={{ ...td(false), paddingLeft }} />
      <td style={{ ...td(false), fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', fontWeight: 600 }}>비교</td>
      {METRIC_COLS.map(c => (
        <td key={c.key} style={{ ...td(), color: 'var(--color-text-muted)' }}>
          {c.fmtFn((item.compared as any)[c.key] ?? 0)}
        </td>
      ))}
    </tr>,
    <tr key={`${item.key}:delta`} style={{ backgroundColor: bgColor }}>
      <td style={{ ...td(false), paddingLeft }} />
      <td style={{ ...td(false), fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', fontWeight: 600 }}>Δ</td>
      {METRIC_COLS.map(c => {
        const v = (item.delta as any)[c.key] ?? 0;
        const style = deltaStyle(v, !!(c as any).invert);
        return <td key={c.key} style={{ ...td(), ...style, fontWeight: 700, fontSize: 'var(--font-small)' }}>{fmtDelta(c, v)}</td>;
      })}
    </tr>,
    <tr key={`${item.key}:deltaPct`} style={{ backgroundColor: bgColor, borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 40%, transparent)' }}>
      <td style={{ ...td(false), paddingLeft }} />
      <td style={{ ...td(false), fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', fontWeight: 600 }}>Δ%</td>
      {METRIC_COLS.map(c => {
        const v = (item.deltaPercent as any)[c.key] ?? 0;
        const style = deltaStyle(v, !!(c as any).invert);
        return <td key={c.key} style={{ ...td(), ...style, fontWeight: 700, fontSize: 'var(--font-small)' }}>{fmt.deltaPct(v)}</td>;
      })}
    </tr>,
  ];

  // ── Campaign tab 렌더링 ──
  const renderCampaign = () => {
    return data.campaign.map((item, ci) => {
      const bgColor = CAMP_COLORS[ci % CAMP_COLORS.length];
      const label = <span style={{ fontSize: 'var(--font-table-body)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.campaign}</span>;
      return metricRows(item, bgColor, label, 8);
    });
  };

  // ── Group tab 렌더링 ──
  const renderGroup = () => {
    // campaign 순서 기준으로 그룹핑
    const campMap = new Map<string, ComparisonItem[]>();
    for (const item of data.group) {
      const camp = item.campaign ?? '';
      if (!campMap.has(camp)) campMap.set(camp, []);
      campMap.get(camp)!.push(item);
    }
    // campaign 순서는 data.campaign 기준
    const campOrder = data.campaign.map(c => c.campaign ?? '');
    const rows: React.ReactNode[] = [];
    campOrder.forEach((camp, ci) => {
      if (!campMap.has(camp)) return;
      const bgColor = CAMP_COLORS[ci % CAMP_COLORS.length];
      // 캠페인 헤더 행
      rows.push(
        <tr key={`cmp-camp:${camp}`} style={{ backgroundColor: `color-mix(in srgb, ${bgColor} 200%, var(--color-border-subtle) 30%)`, borderTop: '2px solid var(--color-border-subtle)' }}>
          <td colSpan={METRIC_COLS.length + 2} style={{ ...td(false), fontWeight: 700, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
            📁 {camp}
          </td>
        </tr>
      );
      // 그룹 행들
      campMap.get(camp)!.forEach(item => {
        const label = <span style={{ fontSize: 'var(--font-table-body)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.group}</span>;
        metricRows(item, bgColor, label, 16).forEach(r => rows.push(r));
      });
    });
    return rows;
  };

  // ── Ad tab 렌더링 ──
  const renderAd = () => {
    // campaign → group → ads 그룹핑
    const campMap = new Map<string, Map<string, ComparisonItem[]>>();
    for (const item of data.ad) {
      const camp = item.campaign ?? '';
      const grp = item.group ?? '';
      if (!campMap.has(camp)) campMap.set(camp, new Map());
      const grpMap = campMap.get(camp)!;
      if (!grpMap.has(grp)) grpMap.set(grp, []);
      grpMap.get(grp)!.push(item);
    }
    const campOrder = data.campaign.map(c => c.campaign ?? '');
    const rows: React.ReactNode[] = [];
    campOrder.forEach((camp, ci) => {
      if (!campMap.has(camp)) return;
      const bgColor = CAMP_COLORS[ci % CAMP_COLORS.length];
      // 캠페인 헤더 행
      rows.push(
        <tr key={`cmp-camp:${camp}`} style={{ backgroundColor: `color-mix(in srgb, ${bgColor} 200%, var(--color-border-subtle) 30%)`, borderTop: '2px solid var(--color-border-subtle)' }}>
          <td colSpan={METRIC_COLS.length + 2} style={{ ...td(false), fontWeight: 700, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
            📁 {camp}
          </td>
        </tr>
      );
      campMap.get(camp)!.forEach((ads, grp) => {
        // 그룹 서브헤더 행
        rows.push(
          <tr key={`cmp-grp:${camp}:${grp}`} style={{ backgroundColor: bgColor }}>
            <td colSpan={METRIC_COLS.length + 2} style={{ ...td(false), fontWeight: 600, color: 'var(--color-text-muted)', paddingLeft: 16, padding: '3px 8px 3px 16px' }}>
              └ {grp}
            </td>
          </tr>
        );
        // 소재 행들
        ads.forEach(item => {
          const label = <span style={{ fontSize: 'var(--font-table-body)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.ad}</span>;
          metricRows(item, bgColor, label, 28).forEach(r => rows.push(r));
        });
      });
    });
    return rows;
  };

  return (
    <>
      <div className="section-header" style={{ marginBottom: 12 }}>
        {title && <span className="section-title">{title}</span>}
        <TabButtons tab={tab} setTab={setTab} />
      </div>
      <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', marginBottom: 8, display: 'flex', gap: 16 }}>

      </div>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: tab === 'ad' ? 280 : 240 }}>
                {tab === 'campaign' ? 'CAMPAIGN' : tab === 'group' ? 'CAMPAIGN / GROUP' : 'CAMPAIGN / GROUP / AD'}
              </th>
              <th style={{ ...thStyle, textAlign: 'left', width: 50, color: 'var(--color-text-muted)' }}>PERIOD</th>
              {METRIC_COLS.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {tab === 'campaign' && renderCampaign()}
            {tab === 'group' && renderGroup()}
            {tab === 'ad' && renderAd()}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function HierarchyTable({
  mode,
  hierarchyData,
  comparisonData,
  selectedRange,
  compareRange,
  loading,
  title: titleProp,
}: HierarchyTableProps) {
  const title = titleProp ?? (mode === 'daily' ? '📋 Hierarchy Daily Performance' : '🔄 Hierarchy Period Comparison');

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">{title}</div>
        <div className="skeleton" style={{ height: 192 }} />
      </div>
    );
  }

  if (mode === 'comparison' && (!comparisonData || !selectedRange || !compareRange)) return null;

  return (
    <div className="card">
      {mode === 'daily' && (
        <DailyHierarchyTable data={hierarchyData ?? []} title={titleProp} />
      )}
      {mode === 'comparison' && comparisonData && selectedRange && compareRange && (
        <ComparisonHierarchyTable
          data={comparisonData}
          selectedRange={selectedRange}
          compareRange={compareRange}
          title={titleProp}
        />
      )}
    </div>
  );
}
