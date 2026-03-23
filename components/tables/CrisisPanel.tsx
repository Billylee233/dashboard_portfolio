'use client';
import React from 'react';

import { fmt, deltaStyle } from '@/lib/calculations';

interface CrisisMetric {
  applicant: number; click: number; cvr: number; cpa: number; cpc: number; isAlert: boolean;
}
interface CrisisRow {
  media: string;
  d1VsPrevWeek: CrisisMetric;
  recent3VsPrev3: CrisisMetric;
  recent7VsPrev7: CrisisMetric;
  isCrisis: boolean;
  aiSummary?: string | null;
}

const PERIODS = [
  { key: 'd1VsPrevWeek'   as const, label: 'A. D-1 vs 전주 동요일' },
  { key: 'recent3VsPrev3' as const, label: 'B. 최근 3일 vs 전주 3일' },
  { key: 'recent7VsPrev7' as const, label: 'C. 최근 1주 vs 전주 1주' },
];

function MetricPair({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <span style={{ fontSize:'var(--font-small)', color:'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize:'var(--font-body)', fontWeight:700, ...deltaStyle(value, invert) }}>
        {fmt.deltaPct(value)}
      </span>
    </div>
  );
}

function ChannelCard({ row, onChannelClick }: { row: CrisisRow; onChannelClick?: (m: string) => void }) {
  const borderColor = row.isCrisis
    ? 'var(--color-delta-neg)'
    : 'var(--color-border-subtle)';
  const bgColor = row.isCrisis
    ? 'color-mix(in srgb, var(--color-delta-neg) 6%, var(--color-surface-1))'
    : 'var(--color-surface-1)';

  return (
    <div style={{ borderRadius:'var(--card-radius)', border:`1px solid ${borderColor}`, backgroundColor:bgColor, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
      {/* 카드 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => onChannelClick?.(row.media)}
          style={{ fontSize:'var(--font-section-title)', fontWeight:700, color:'var(--color-text-primary)', background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}>
          {row.media}
        </button>
        {row.isCrisis
          ? <span className="badge-crisis">⚠ 위기</span>
          : <span className="badge-good">✓ 정상</span>}
      </div>

      {/* 3개 기간 */}
      {PERIODS.map(({ key, label }) => {
        const m = row[key];
        return (
          <div key={key}>
            <div style={{ fontSize:'var(--font-tiny)', fontWeight:700, color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'var(--tracking-wider)', marginBottom:5 }}>{label}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 16px' }}>
              {/* APP + CPA 강조 */}
              <MetricPair label="APP" value={m.applicant} />
              <MetricPair label="CPA"       value={m.cpa}       invert />
              <MetricPair label="CLICK"     value={m.click} />
              <MetricPair label="CVR"       value={m.cvr} />
              <MetricPair label="CPC"       value={m.cpc} invert />
              {m.isAlert && (
                <div style={{ gridColumn:'1 / -1', marginTop:2 }}>
                  <span className="badge-crisis" style={{ fontSize:'var(--font-tiny)' }}>⚠ 임계치 초과</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* AI 진단 */}
      {row.aiSummary && (
        <div style={{ borderTop:'1px solid var(--color-border-subtle)', paddingTop:8, marginTop:2 }}>
          <div style={{ fontSize:'var(--font-tiny)', fontWeight:700, color:'var(--color-text-muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'var(--tracking-wider)' }}>AI 진단</div>
          <p style={{ fontSize:'var(--font-label)', color:'var(--color-text-secondary)', lineHeight:1.5, margin:0 }}>{row.aiSummary}</p>
        </div>
      )}
    </div>
  );
}

export function CrisisPanel({ data, onChannelClick, loading, title }: {
  data: CrisisRow[]; onChannelClick?: (media: string) => void; loading?: boolean; title?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="card">
        {title
          ? <div className="section-header"><span className="section-title">{title}</span></div>
          : <div className="card-title">Channel Crisis Status</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160 }} />
          ))}
        </div>
      </div>
    );
  }

  const crisisChannels = data.filter(d => d.isCrisis);
  const normalChannels = data.filter(d => !d.isCrisis);
  const sorted = [...crisisChannels, ...normalChannels];

  return (
    <div className="card">
      <div className="section-header">
        {title
          ? <span className="section-title">{title}</span>
          : <span className="card-title mb-0">⚠️ Channel Crisis Status</span>}
        <div style={{ display:'flex', gap:12, fontSize:'var(--font-body)', color:'var(--color-text-muted)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'var(--color-delta-neg)', display:'inline-block' }} />
            위기 {crisisChannels.length}개
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'var(--color-delta-pos)', display:'inline-block' }} />
            정상 {normalChannels.length}개
          </span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {sorted.map(row => (
          <ChannelCard key={row.media} row={row} onChannelClick={onChannelClick} />
        ))}
      </div>
    </div>
  );
}
