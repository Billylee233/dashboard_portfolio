'use client';

import { fmt, deltaStyle } from '@/lib/calculations';

interface KPICardProps {
  label: string;
  value: string | number;
  formatted?: string;
  delta?: number;
  invertDelta?: boolean;
  sub?: string;
  icon?: string;
  loading?: boolean;
}

export function KPICard({ label, value, formatted, delta, invertDelta, sub, icon, loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="kpi-card">
        <div className="skeleton skeleton-text" style={{ width: 80, marginBottom: 'var(--space-3)' }} />
        <div className="skeleton" style={{ height: 28, width: 112 }} />
      </div>
    );
  }

  const displayVal = formatted ?? (typeof value === 'number' ? fmt.number(value) : value);

  return (
    <div className="kpi-card group transition-colors"
      style={{ borderColor: `color-mix(in srgb, var(--color-border-subtle) calc(var(--card-border-opacity) * 100%), transparent)` }}>
      <div className="kpi-label flex items-center gap-1.5">
        {icon && <span style={{ fontSize: 'var(--font-kpi-label)' }}>{icon}</span>}
        {label}
      </div>
      <div className="kpi-value">{displayVal}</div>
      {delta !== undefined && (() => {
        const isPos = invertDelta ? delta < 0 : delta > 0;
        const isNeg = invertDelta ? delta > 0 : delta < 0;
        const arrow = delta === 0 ? '→' : isPos ? '↑' : '↓';
        return (
          <div style={{ fontSize: 'var(--font-kpi-label)', fontWeight: 700, display:'flex', alignItems:'center', gap:3, ...deltaStyle(delta, invertDelta) }}>
            <span>{arrow}</span>
            <span>{fmt.deltaPct(delta)}</span>
          </div>
        );
      })()}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

interface KPIGridProps {
  imp: number; click: number; cost: number; applicant: number;
  ctr: number; cvr: number; cpc: number; cpa: number;
  deltaPercent?: { imp: number; click: number; cost: number; applicant: number; ctr: number; cvr: number; cpc: number; cpa: number; };
  loading?: boolean;
}

export function KPIGrid({ imp, click, cost, applicant, ctr, cvr, cpc, cpa, deltaPercent, loading }: KPIGridProps) {
  const d = deltaPercent;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <KPICard label="IMP"  value={imp}       formatted={fmt.number(imp)}       delta={d?.imp}       loading={loading} />
      <KPICard label="CLICK" value={click}    formatted={fmt.number(click)}     delta={d?.click}     loading={loading} />
      <KPICard label="CTR"  value={ctr}       formatted={fmt.pct(ctr)}          delta={d?.ctr}       loading={loading} />
      <KPICard label="COST" value={cost}      formatted={fmt.cost(cost)}        delta={d?.cost}      invertDelta loading={loading} />
      <KPICard label="CPC"  value={cpc}       formatted={fmt.cost(cpc)}         delta={d?.cpc}       invertDelta loading={loading} />
      <KPICard label="APP"  value={applicant} formatted={fmt.number(applicant)} delta={d?.applicant} loading={loading} icon="👤" />
      <KPICard label="CPA"  value={cpa}       formatted={fmt.cost(cpa)}         delta={d?.cpa}       invertDelta loading={loading} icon="💰" />
      <KPICard label="CVR"  value={cvr}       formatted={fmt.pct(cvr)}          delta={d?.cvr}       loading={loading} />
    </div>
  );
}
