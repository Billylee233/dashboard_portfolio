'use client';

import { useState, useEffect } from 'react';
import EmptyState from '@/components/ui/EmptyState';

interface AIDiagnosisBoxProps {
  media: string;
  latestDate: string | null;
  allChannels?: string[];
}

type DiagnosisStatus = '우수' | '보통' | '주의';

interface DiagnosisData {
  media: string;
  status: DiagnosisStatus;
  summary: string;
  cause: string | null;
  action: string | null;
  diagnosed_at: string;
  valid_until: string;
}

function toDateStr(isoStr: string): string {
  try { return new Date(isoStr).toISOString().slice(0, 10); } catch { return ''; }
}

export function AIDiagnosisBox({ media, latestDate, allChannels }: AIDiagnosisBoxProps) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [batchDone, setBatchDone] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiagnosis = async () => {
      setFetching(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/ai-diagnosis?media=${encodeURIComponent(media)}`);
        const json = await res.json();
        // stale이면 캐시 무효화만 하고 재진단은 사용자가 직접
        setDiagnosis(json.stale ? null : (json.diagnosis ?? null));
      } catch (e: any) {
        setErrorMsg('진단 결과 조회 실패: ' + (e?.message ?? '네트워크 오류'));
      } finally {
        setFetching(false);
      }
    };
    fetchDiagnosis();
  }, [media]);

  const diagDate = diagnosis ? toDateStr(diagnosis.diagnosed_at) : null;
  const isAlreadyDone = !!(latestDate && diagDate && diagDate === latestDate);
  const isDisabled = isAlreadyDone || loading || batchDone;
  const disabledText = batchDone ? '이미 진단이 끝났습니다' : isAlreadyDone ? `${latestDate} 기준 진단 완료` : '';

  const handleDiagnose = async () => {
    if (isDisabled) return;
    setLoading(true);
    setErrorMsg(null);
    setBatchProgress(null);
    const targets = allChannels && allChannels.length > 0 ? allChannels : [media];
    try {
      for (let i = 0; i < targets.length; i++) {
        const ch = targets[i];
        setBatchProgress(`(${i + 1}/${targets.length}) ${ch}`);
        const res = await fetch('/api/ai-diagnosis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media: ch }),
        });
        const json = await res.json();
        if (ch === media) {
          if (json.diagnosis) setDiagnosis(json.diagnosis);
          else if (json.skipped) setErrorMsg(`진단 스킵: ${json.message ?? '데이터 없음'}`);
          else if (json.error) setErrorMsg(`진단 오류: ${json.error}`);
        }
      }
      setBatchDone(true);
      setBatchProgress(null);
    } catch (e: any) {
      setErrorMsg('네트워크 오류: ' + (e?.message ?? '알 수 없는 오류'));
    } finally {
      setLoading(false);
    }
  };

  const STATUS_CONFIG: Record<DiagnosisStatus, { borderColor: string; bg: string; iconColor: string; icon: string }> = {
    '우수': { borderColor: 'color-mix(in srgb, var(--color-delta-pos) 40%, transparent)', bg: 'color-mix(in srgb, var(--color-delta-pos) 8%, transparent)', iconColor: 'var(--color-delta-pos)', icon: '✅' },
    '보통': { borderColor: 'color-mix(in srgb, var(--color-chart-line) 40%, transparent)', bg: 'color-mix(in srgb, var(--color-chart-line) 8%, transparent)', iconColor: 'var(--color-chart-line)', icon: '⚠️' },
    '주의': { borderColor: 'color-mix(in srgb, var(--color-delta-neg) 40%, transparent)', bg: 'color-mix(in srgb, var(--color-delta-neg) 8%, transparent)', iconColor: 'var(--color-delta-neg)', icon: '🚨' },
  };
  const statusCfg = diagnosis ? STATUS_CONFIG[diagnosis.status] : null;

  if (fetching) {
    return (
      <div className="card skeleton">
        <div className="h-4 rounded w-32 mb-4" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
        <div className="h-16 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--color-border-subtle) 50%, transparent)' }} />
      </div>
    );
  }

  return (
    <div className="card" style={{ border: `1px solid ${statusCfg?.borderColor ?? 'var(--color-border-subtle)'}`, backgroundColor: statusCfg?.bg ?? 'var(--color-surface-1)' }}>
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="section-title" style={{ fontSize: 'var(--font-section-title)' }}>🤖 AI Comprehensive Assessment</span>
          {latestDate && (
            <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', backgroundColor: 'color-mix(in srgb, var(--color-border-subtle) 60%, transparent)', padding: '2px 7px', borderRadius: 99, fontWeight: 600 }}>
              분석 기준일: {latestDate}
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleDiagnose}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            disabled={isDisabled}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 'var(--font-body)', fontWeight: 600,
              border: `1px solid color-mix(in srgb, var(--color-accent) ${isDisabled ? '20%' : '40%'}, transparent)`,
              backgroundColor: `color-mix(in srgb, var(--color-accent) ${isDisabled ? '8%' : '20%'}, transparent)`,
              color: isDisabled ? 'var(--color-text-muted)' : 'var(--color-accent)',
              cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {loading ? (
              <>
                <svg style={{ animation: 'spin 1s linear infinite', width: 12, height: 12 }} fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}/>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" style={{ opacity: 0.75 }}/>
                </svg>
                {batchProgress ?? '진단 중...'}
              </>
            ) : isDisabled ? (disabledText || 'AI 진단하기') : (
              allChannels && allChannels.length > 1 ? `AI 진단하기 (전체 ${allChannels.length}채널)` : 'AI 진단하기'
            )}
          </button>
          {showTooltip && disabledText && !loading && (
            <div style={{ position: 'absolute', bottom: '110%', right: 0, backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--font-label)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)', zIndex: 100 }}>
              {disabledText}
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 8, backgroundColor: 'color-mix(in srgb, var(--color-delta-neg) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-delta-neg) 30%, transparent)', fontSize: 'var(--font-body)', color: 'var(--color-delta-neg)' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {diagnosis ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, backgroundColor: 'color-mix(in srgb, var(--color-border-subtle) 30%, transparent)' }}>
            <span style={{ fontSize: 'var(--font-page-title)' }}>{statusCfg?.icon}</span>
            <div>
              <div style={{ fontSize: 'var(--font-label)', fontWeight: 700, color: statusCfg?.iconColor, marginBottom: 4 }}>{diagnosis.status}</div>
              <p style={{ fontSize: 'var(--font-section-title)', color: 'var(--color-text-secondary)', fontWeight: 500, lineHeight: 1.5 }}>{diagnosis.summary}</p>
            </div>
          </div>
          {diagnosis.cause && (
            <div>
              <h4 style={{ fontSize: 'var(--font-small)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 8 }}>🔍 Root Cause Analysis</h4>
              <div style={{ fontSize: 'var(--font-section-title)', color: 'var(--color-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line', paddingLeft: 12, borderLeft: '2px solid color-mix(in srgb, var(--color-chart-line) 60%, transparent)' }}>{diagnosis.cause}</div>
            </div>
          )}
          {diagnosis.action && (
            <div>
              <h4 style={{ fontSize: 'var(--font-small)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 8 }}>💡 Recommended Action</h4>
              <div style={{ fontSize: 'var(--font-section-title)', color: 'var(--color-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line', paddingLeft: 12, borderLeft: '2px solid color-mix(in srgb, var(--color-accent) 60%, transparent)' }}>{diagnosis.action}</div>
            </div>
          )}
          <p style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', textAlign: 'right' }}>
            진단: {new Date(diagnosis.diagnosed_at).toLocaleString('ko-KR')} · 기준 데이터: {diagDate ?? '-'}
          </p>
        </div>
      ) : (
        <EmptyState icon="🤖" title="AI 진단 결과가 없습니다" description='"AI 진단하기" 버튼을 눌러 현재 채널 상태를 진단하세요' />
      )}
    </div>
  );
}
