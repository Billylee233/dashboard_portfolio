'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { filterBtnStyle } from '@/lib/buttonStyles';

// ─── 키워드 매칭 모드 ─────────────────────────────────────────────────────────
export type KwMode = 'contain' | 'exact' | 'exclude';
const KW_MODE_OPTIONS: { key: KwMode; label: string }[] = [
  { key: 'contain', label: '포함' },
  { key: 'exact',   label: '일치' },
  { key: 'exclude', label: '제외' },
];

// ─── URL params ↔ filter 변환 헬퍼 ───────────────────────────────────────────
export function parseFilterFromParams(sp: URLSearchParams) {
  return {
    media:    sp.get('media')    ? sp.get('media')!.split(',').filter(Boolean)    : [] as string[],
    campaign: sp.get('campaign') ? sp.get('campaign')!.split(',').filter(Boolean) : [] as string[],
    group:    sp.get('group')    ? sp.get('group')!.split(',').filter(Boolean)    : [] as string[],
    keywords: sp.get('keywords') ? sp.get('keywords')!.split(',').filter(Boolean) : [] as string[],
    topN:     sp.get('topN')     ? sp.get('topN')!.split(',').map(Number).filter(n => !isNaN(n)) : [] as number[],
    kwMode:   (sp.get('kwMode') ?? 'contain') as KwMode,
  };
}

const TOP_N_OPTIONS = [
  { label: 'Top 1~10',  value: 1  },
  { label: 'Top 11~20', value: 11 },
  { label: 'Top 21~30', value: 21 },
];

// ─── 모드별 태그 색상 ─────────────────────────────────────────────────────────
function kwTagStyle(mode: KwMode): React.CSSProperties {
  if (mode === 'exclude') return {
    backgroundColor: 'color-mix(in srgb, var(--color-delta-neg) 12%, transparent)',
    border:          '1px solid color-mix(in srgb, var(--color-delta-neg) 50%, transparent)',
    color:           'var(--color-delta-neg)',
  };
  if (mode === 'exact') return {
    backgroundColor: 'color-mix(in srgb, var(--color-delta-pos) 12%, transparent)',
    border:          '1px solid color-mix(in srgb, var(--color-delta-pos) 50%, transparent)',
    color:           'var(--color-delta-pos)',
  };
  // contain (기본)
  return {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
    border:          '1px solid var(--color-accent)',
    color:           'var(--color-accent)',
  };
}

// ─── SA 헤더 필터 (DashboardLayout Row 3 전용) ────────────────────────────────
export function SAHeaderFilter() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const filter = parseFilterFromParams(searchParams);

  const [mediaOpts,    setMediaOpts]    = useState<string[]>([]);
  const [campaignOpts, setCampaignOpts] = useState<string[]>([]);
  const [groupOpts,    setGroupOpts]    = useState<string[]>([]);
  const [kwSuggests,   setKwSuggests]   = useState<string[]>([]);
  const [kwInput,      setKwInput]      = useState('');
  const [kwOpen,       setKwOpen]       = useState(false);
  const [mediaError,   setMediaError]   = useState<string | null>(null);
  const kwRef = useRef<HTMLDivElement>(null);

  // URL 업데이트 헬퍼
  const updateParams = (updates: Record<string, string[]>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v.length) params.set(k, v.join(','));
      else params.delete(k);
    });
    router.push(`/sa-detail?${params.toString()}`);
  };

  // kwMode 단독 변경 (string 값)
  const setKwMode = (mode: KwMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === 'contain') params.delete('kwMode');
    else params.set('kwMode', mode);
    router.push(`/sa-detail?${params.toString()}`);
  };

  // 매체 로드
  useEffect(() => {
    fetch('/api/sa-detail?type=options&subtype=media')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (d.error) throw new Error(d.error);
        const media: string[] = d.media ?? [];
        setMediaOpts(media);
        if (!searchParams.get('media') && media.length > 0) {
          updateParams({ media, campaign: [], group: [] });
        }
      })
      .catch(e => { console.error('[SAHeaderFilter] 매체 로드 실패:', e); setMediaError(e?.message); });
  }, []); // eslint-disable-line

  // 캠페인 목록
  useEffect(() => {
    if (!filter.media.length) { setCampaignOpts([]); return; }
    const params = new URLSearchParams({ type: 'options', subtype: 'campaign', media: filter.media.join(',') });
    fetch(`/api/sa-detail?${params}`).then(r => r.json()).then(d => setCampaignOpts(d.campaigns ?? [])).catch(() => {});
  }, [filter.media.join(',')]); // eslint-disable-line

  // 그룹 목록
  useEffect(() => {
    const params = new URLSearchParams({ type: 'options', subtype: 'group' });
    if (filter.campaign.length) params.set('campaign', filter.campaign.join(','));
    fetch(`/api/sa-detail?${params}`).then(r => r.json()).then(d => setGroupOpts(d.groups ?? [])).catch(() => {});
  }, [filter.campaign.join(',')]); // eslint-disable-line

  // 키워드 자동완성
  useEffect(() => {
    if (!kwInput.trim()) { setKwSuggests([]); return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ type: 'options', subtype: 'keyword', q: kwInput });
      fetch(`/api/sa-detail?${params}`)
        .then(r => r.json())
        .then(d => setKwSuggests((d.keywords ?? []).filter((k: string) => !filter.keywords.includes(k))))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [kwInput, filter.keywords.join(',')]); // eslint-disable-line

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (kwRef.current && !kwRef.current.contains(e.target as Node)) setKwOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addKeyword = (kw: string) => {
    if (!kw.trim() || filter.keywords.includes(kw.trim())) return;
    updateParams({ keywords: [...filter.keywords, kw.trim()] });
    setKwInput(''); setKwSuggests([]); setKwOpen(false);
  };

  const removeKeyword = (kw: string) =>
    updateParams({ keywords: filter.keywords.filter(k => k !== kw) });

  const toggleTopN = (val: number) => {
    const next = filter.topN.includes(val)
      ? filter.topN.filter(v => v !== val)
      : [...filter.topN, val];
    updateParams({ topN: next.map(String) });
  };

  const tagStyle = kwTagStyle(filter.kwMode);

  return (
    <div style={{
      display:    'flex',
      flexWrap:   'wrap',
      alignItems: 'center',
      gap:        'var(--space-2)',
      padding:    'var(--space-2) 0',
      maxWidth:   1600,
      margin:     '0 auto',
    }}>
      {mediaError && (
        <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-error)' }}>
          ⚠️ {mediaError}
        </span>
      )}

      {/* 매체 */}
      <MultiSelectDropdown
        label="매체"
        options={mediaOpts}
        selected={filter.media}
        onChange={val => updateParams({ media: val, campaign: [], group: [] })}
        required
        maxWidth={160}
      />

      <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-subtle)' }} />

      {/* 캠페인 */}
      <MultiSelectDropdown
        label="캠페인"
        options={campaignOpts}
        selected={filter.campaign}
        onChange={val => updateParams({ campaign: val, group: [] })}
        disabled={!filter.media.length}
        maxWidth={200}
      />

      {/* 그룹 */}
      <MultiSelectDropdown
        label="그룹"
        options={groupOpts}
        selected={filter.group}
        onChange={val => updateParams({ group: val })}
        disabled={!filter.media.length}
        maxWidth={200}
      />

      <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-subtle)' }} />

      {/* Top N */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--font-small)', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          Top N
        </span>
        <button onClick={() => updateParams({ topN: [] })} style={filterBtnStyle(filter.topN.length === 0)}>
          All
        </button>
        {TOP_N_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => toggleTopN(opt.value)} style={filterBtnStyle(filter.topN.includes(opt.value))}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border-subtle)' }} />

      {/* 키워드 매칭 모드 + 검색 */}
      <div
        ref={kwRef}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)', flex: 1, minWidth: 280 }}
      >
        {/* 모드 선택 버튼 */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {KW_MODE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setKwMode(opt.key)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 'var(--font-small)',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                backgroundColor: filter.kwMode === opt.key
                  ? (opt.key === 'exclude' ? 'var(--color-delta-neg)'
                    : opt.key === 'exact'  ? 'var(--color-delta-pos)'
                    : 'var(--color-accent)')
                  : 'transparent',
                color: filter.kwMode === opt.key ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 등록된 키워드 태그 */}
        {filter.keywords.map(kw => (
          <span key={kw} style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            padding:      '2px var(--space-2)',
            borderRadius: 'var(--radius-full)',
            fontSize:     'var(--font-small)',
            fontWeight:   600,
            whiteSpace:   'nowrap',
            ...tagStyle,
          }}>
            {kw}
            <button
              onClick={() => removeKeyword(kw)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: 'var(--font-small)' }}
            >×</button>
          </span>
        ))}

        {/* 키워드 입력 */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 'var(--font-small)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={kwInput}
            onChange={e => { setKwInput(e.target.value); setKwOpen(true); }}
            onFocus={e => { setKwOpen(true); e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
            onKeyDown={e => {
              if (e.key === 'Enter' && kwInput.trim()) { e.preventDefault(); addKeyword(kwInput.trim()); }
              if (e.key === 'Escape') setKwOpen(false);
            }}
            placeholder="키워드 검색..."
            style={{
              backgroundColor: 'var(--color-surface-2)',
              border:          '1px solid var(--color-border-default)',
              borderRadius:    'var(--radius-sm)',
              padding:         'var(--space-1) var(--space-3) var(--space-1) 26px',
              fontSize:        'var(--font-small)',
              color:           'var(--color-text-secondary)',
              outline:         'none',
              width:           140,
              transition:      `border-color var(--transition-fast)`,
            }}
          />
        </div>

        {kwOpen && kwSuggests.length > 0 && (
          <div style={{
            position:        'absolute',
            top:             'calc(100% + 4px)',
            left:            0,
            zIndex:          'var(--z-dropdown)' as any,
            backgroundColor: 'var(--color-surface-1)',
            border:          '1px solid var(--color-accent)',
            borderRadius:    'var(--radius-md)',
            boxShadow:       'var(--shadow-lg)',
            minWidth:        200,
            maxHeight:       200,
            overflowY:       'auto',
          }}>
            {kwSuggests.map(kw => (
              <div
                key={kw}
                onMouseDown={e => { e.preventDefault(); addKeyword(kw); }}
                style={{ padding: 'var(--space-1) var(--space-3)', cursor: 'pointer', fontSize: 'var(--font-small)', color: 'var(--color-text-secondary)', transition: `background-color var(--transition-fast)` }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-accent) 12%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {kw}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
