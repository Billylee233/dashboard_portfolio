'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  DashboardTheme, DEFAULT_THEME, THEME_PRESETS, FONT_OPTIONS,
  applyThemeToDOM, loadFontByFamily, fetchThemeFromServer, saveThemeToServer,
} from '@/lib/theme';

const ThemeContext = createContext<DashboardTheme>(DEFAULT_THEME);
export const useTheme = () => useContext(ThemeContext);

const ThemeActionsContext = createContext<{ open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> }>({
  open: false, setOpen: () => {},
});
export const useThemeActions = () => useContext(ThemeActionsContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>(DEFAULT_THEME);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchThemeFromServer().then(saved => {
      let t = saved;
      if (!t) {
        try {
          const local = localStorage.getItem('cls_theme');
          if (local) t = { ...DEFAULT_THEME, ...JSON.parse(local) };
        } catch {}
      }
      t = t ?? DEFAULT_THEME;
      setThemeState(t);
      loadFontByFamily(t.fontFamily);
      applyThemeToDOM(t);
    });
  }, []);

  const handleThemeChange = useCallback((t: DashboardTheme) => {
    setThemeState(t);
    applyThemeToDOM(t);
  }, []);

  return (
    <ThemeActionsContext.Provider value={{ open, setOpen }}>
      <ThemeContext.Provider value={theme}>
        <ThemeEditorPanel theme={theme} onThemeChange={handleThemeChange} />
        {children}
      </ThemeContext.Provider>
    </ThemeActionsContext.Provider>
  );
}

// ─── 헤더에서 사용하는 테마 열기 버튼 ────────────────────────────────────────
export function ThemeOpenButton() {
  const { open, setOpen } = useThemeActions();
  return <OpenButton open={open} onClick={() => setOpen(o => !o)} />;
}

// ─── 공통 컨트롤 ──────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, unit = 'px', step = 1, onChange }: {
  label: string; value: number; min: number; max: number;
  unit?: string; step?: number; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = (unit === 'px' && value > 0 && label.includes('전체')) ? `+${value}` : `${value}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span style={{ fontSize: 'var(--font-small)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>{label}</span>
        <span style={{ fontSize: 'var(--font-label)', color: 'var(--color-accent)', marginLeft: 8, flexShrink: 0 }}>{display}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right,var(--color-accent) ${pct}%,var(--color-border-subtle) ${pct}%)` }}
      />
    </div>
  );
}

function ColorRow({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  const hexForInput = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888';
  return (
    <div className="flex items-center gap-2.5">
      <label className="relative cursor-pointer shrink-0">
        <input type="color" value={hexForInput} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        <span className="block w-7 h-7 rounded-lg border-2 transition-colors shadow"
          style={{ backgroundColor: value, borderColor: 'var(--color-border-subtle)' }} />
      </label>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 'var(--font-label)', fontWeight: 500, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>{label}</div>
        {hint && <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', marginTop: 1 }}>{hint}</div>}
      </div>
      <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--font-tiny)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-widest)', paddingTop: 12, paddingBottom: 6, borderTop: '1px solid var(--color-border-subtle)', marginTop: 4 }}>
      {children}
    </div>
  );
}

function GroupTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '8px 0', fontSize: 'var(--font-small)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)',
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        transition: 'all 0.15s', background: 'none', border: 'none',
        borderBottomStyle: 'solid',
        cursor: 'pointer',
      }}>
      {label}
    </button>
  );
}

// ─── 패널 콘텐츠 ──────────────────────────────────────────────────────────────
function PanelContent({ theme, update, applyPreset }: {
  theme: DashboardTheme;
  update: <K extends keyof DashboardTheme>(key: K, value: DashboardTheme[K]) => void;
  applyPreset: (patch: Partial<DashboardTheme>) => void;
}) {
  const [group, setGroup] = useState<'color' | 'font' | 'table'>('color');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── 프리셋 ── */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ fontSize: 'var(--font-tiny)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-widest)', marginBottom: 8 }}>빠른 프리셋</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {THEME_PRESETS.map(p => (
            <button key={p.name} onClick={() => applyPreset(p.patch)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                backgroundColor: 'var(--color-surface-1)',
                border: '1px solid var(--color-border-subtle)',
                textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-1))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-subtle)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-1)';
              }}>
              <span style={{ fontSize: 'var(--font-page-title)', lineHeight: 1 }}>{p.emoji}</span>
              <div>
                <div style={{ fontSize: 'var(--font-label)', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{p.name}</div>
                <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', marginTop: 1 }}>{p.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 그룹 탭 ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <GroupTab label="색상" active={group === 'color'} onClick={() => setGroup('color')} />
        <GroupTab label="폰트" active={group === 'font'} onClick={() => setGroup('font')} />
        <GroupTab label="표·카드" active={group === 'table'} onClick={() => setGroup('table')} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 8px' }}>

        {/* ─── 색상 탭 ─── */}
        {group === 'color' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SectionTitle>배경 & 레이아웃</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="전체 배경" value={theme.colorBg} hint="페이지 최외곽 배경" onChange={v => update('colorBg', v)} />
              <ColorRow label="카드 배경" value={theme.colorSurface1} hint="카드·섹션 배경" onChange={v => update('colorSurface1', v)} />
              <ColorRow label="입력 필드 배경" value={theme.colorSurface2} hint="드롭다운·폼" onChange={v => update('colorSurface2', v)} />
              <ColorRow label="테두리 (기본)" value={theme.colorBorderSubtle} onChange={v => update('colorBorderSubtle', v)} />
              <ColorRow label="테두리 (강조)" value={theme.colorBorderDefault} onChange={v => update('colorBorderDefault', v)} />
            </div>

            <SectionTitle>텍스트</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="강조 텍스트" value={theme.colorTextPrimary} hint="KPI 값, 헤딩" onChange={v => update('colorTextPrimary', v)} />
              <ColorRow label="기본 텍스트" value={theme.colorTextSecondary} hint="숫자, 본문" onChange={v => update('colorTextSecondary', v)} />
              <ColorRow label="테이블 헤더" value={theme.colorTextTertiary} hint="컬럼명" onChange={v => update('colorTextTertiary', v)} />
              <ColorRow label="설명 텍스트" value={theme.colorTextMuted} hint="라벨, 힌트" onChange={v => update('colorTextMuted', v)} />
            </div>

            <SectionTitle>강조색</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="액센트" value={theme.colorAccent} hint="탭 활성 · 버튼 · 링크" onChange={v => update('colorAccent', v)} />
              <ColorRow label="성공" value={theme.colorSuccess} hint="상태 뱃지" onChange={v => update('colorSuccess', v)} />
              <ColorRow label="경고" value={theme.colorWarning} hint="상태 뱃지" onChange={v => update('colorWarning', v)} />
              <ColorRow label="에러" value={theme.colorError} hint="상태 뱃지" onChange={v => update('colorError', v)} />
            </div>

            <SectionTitle>델타 — 일반 지표</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="▲ 상승 = 좋음" value={theme.colorDeltaPos} hint="APP · CVR 증가" onChange={v => update('colorDeltaPos', v)} />
              <ColorRow label="▼ 하락 = 나쁨" value={theme.colorDeltaNeg} hint="APP · CVR 감소" onChange={v => update('colorDeltaNeg', v)} />
            </div>

            <SectionTitle>델타 — 역지표 (CPA · CPC)</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="▲ 상승 = 나쁨" value={theme.colorDeltaInvPos} onChange={v => update('colorDeltaInvPos', v)} />
              <ColorRow label="▼ 하락 = 좋음" value={theme.colorDeltaInvNeg} onChange={v => update('colorDeltaInvNeg', v)} />
              <ColorRow label="— 변화 없음" value={theme.colorDeltaNeutral} onChange={v => update('colorDeltaNeutral', v)} />
            </div>

            <SectionTitle>차트 컬러</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ColorRow label="막대 (주)" value={theme.colorChartBar} hint="지원자 수 막대" onChange={v => update('colorChartBar', v)} />
              <ColorRow label="막대 (보조)" value={theme.colorChartBar2} hint="비교 기간 막대" onChange={v => update('colorChartBar2', v)} />
              <ColorRow label="선 그래프 (주)" value={theme.colorChartLine} hint="CPA 선" onChange={v => update('colorChartLine', v)} />
              <ColorRow label="선 그래프 (보조)" value={theme.colorChartLine2} onChange={v => update('colorChartLine2', v)} />
              <ColorRow label="차트 그리드" value={theme.colorChartGrid} onChange={v => update('colorChartGrid', v)} />
            </div>
          </div>
        )}

        {/* ─── 폰트 탭 ─── */}
        {group === 'font' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SectionTitle>폰트 패밀리</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FONT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => update('fontFamily', opt.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 'var(--font-body)', textAlign: 'left',
                    cursor: 'pointer', fontFamily: opt.value, transition: 'all 0.15s',
                    backgroundColor: theme.fontFamily === opt.value ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-surface-1)',
                    color: theme.fontFamily === opt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border: theme.fontFamily === opt.value ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid var(--color-border-subtle)',
                    fontWeight: theme.fontFamily === opt.value ? 700 : 400,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            <SectionTitle>전체 폰트 크기 오프셋</SectionTitle>
            <div style={{ marginBottom: 4 }}>
              <SliderRow label="전체 크기 오프셋" value={theme.fontSizeGlobal} min={-4} max={8} unit="px"
                onChange={v => update('fontSizeGlobal', v)} />
            </div>

            <SectionTitle>개별 폰트 크기</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SliderRow label="페이지 제목" value={theme.fontSizePageTitle} min={14} max={30} onChange={v => update('fontSizePageTitle', v)} />
              <SliderRow label="섹션 타이틀" value={theme.fontSizeSectionTitle} min={9} max={18} onChange={v => update('fontSizeSectionTitle', v)} />
              <SliderRow label="상단 탭 메뉴" value={theme.fontSizeNavTab} min={9} max={16} onChange={v => update('fontSizeNavTab', v)} />
              <SliderRow label="KPI 큰 숫자" value={theme.fontSizeKpiValue} min={14} max={40} onChange={v => update('fontSizeKpiValue', v)} />
              <SliderRow label="KPI 레이블" value={theme.fontSizeKpiLabel} min={8} max={14} onChange={v => update('fontSizeKpiLabel', v)} />
              <SliderRow label="테이블 헤더" value={theme.fontSizeTableHeader} min={8} max={16} onChange={v => update('fontSizeTableHeader', v)} />
              <SliderRow label="테이블 본문" value={theme.fontSizeTableBody} min={9} max={16} onChange={v => update('fontSizeTableBody', v)} />
              <SliderRow label="차트 축 레이블" value={theme.fontSizeChartAxis} min={7} max={14} onChange={v => update('fontSizeChartAxis', v)} />
            </div>
          </div>
        )}

        {/* ─── 표·카드 탭 ─── */}
        {group === 'table' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SectionTitle>테이블</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SliderRow label="행 간격 (패딩)" value={theme.tableRowPadding} min={4} max={24} onChange={v => update('tableRowPadding', v)} />
            </div>

            <SectionTitle>차트 막대</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SliderRow label="막대 최대 너비" value={theme.barMaxWidth} min={8} max={60} onChange={v => update('barMaxWidth', v)} />
            </div>

            <SectionTitle>카드 스타일</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SliderRow label="모서리 둥글기" value={theme.cardBorderRadius} min={0} max={28} onChange={v => update('cardBorderRadius', v)} />
              <SliderRow label="테두리 투명도" value={theme.cardBorderOpacity} min={0} max={100} unit="%" onChange={v => update('cardBorderOpacity', v)} />
            </div>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

// ─── 저장 바 ──────────────────────────────────────────────────────────────────
function SaveBar({ onReset, onSave, saving, saved }: {
  onReset: () => void; onSave: () => void; saving: boolean; saved: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-bg)', flexShrink: 0 }}>
      <button onClick={onReset}
        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 'var(--font-label)', fontWeight: 600, cursor: 'pointer', backgroundColor: 'var(--color-surface-1)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-subtle)', transition: 'all 0.15s' }}>
        초기화
      </button>
      <button onClick={onSave} disabled={saving}
        style={{
          flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 'var(--font-label)', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
          backgroundColor: saved ? 'color-mix(in srgb, var(--color-delta-pos) 15%, transparent)' : saving ? 'var(--color-surface-1)' : 'var(--color-accent)',
          color: saved ? 'var(--color-delta-pos)' : saving ? 'var(--color-text-muted)' : '#ffffff',
          border: saved ? '1px solid color-mix(in srgb, var(--color-delta-pos) 30%, transparent)' : '1px solid transparent',
          transition: 'all 0.15s',
        }}>
        {saved ? '✓ 저장 완료' : saving ? '저장 중…' : '저장 (전체 적용)'}
      </button>
    </div>
  );
}

// ─── 열기 버튼 ────────────────────────────────────────────────────────────────
function OpenButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title="테마 설정"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
        borderRadius: 8, fontSize: 'var(--font-body)', fontWeight: 600, flexShrink: 0, cursor: 'pointer',
        transition: 'all 0.15s',
        backgroundColor: open ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-surface-1)',
        color: open ? 'var(--color-accent)' : 'var(--color-text-muted)',
        border: open ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid var(--color-border-subtle)',
      }}>
      <svg style={{ width: 14, height: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }}
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="hidden sm:inline">테마</span>
    </button>
  );
}

// ─── 메인 패널 ────────────────────────────────────────────────────────────────
function ThemeEditorPanel({ theme, onThemeChange }: {
  theme: DashboardTheme;
  onThemeChange: (t: DashboardTheme) => void;
}) {
  const { open, setOpen } = useThemeActions();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = useCallback(<K extends keyof DashboardTheme>(key: K, value: DashboardTheme[K]) => {
    const next = { ...theme, [key]: value };
    onThemeChange(next);
    if (key === 'fontFamily') loadFontByFamily(value as string);
  }, [theme, onThemeChange]);

  const applyPreset = useCallback((patch: Partial<DashboardTheme>) => {
    const next = { ...DEFAULT_THEME, ...patch };
    onThemeChange(next);
    loadFontByFamily(next.fontFamily);
  }, [onThemeChange]);

  const handleSave = async () => {
    setSaving(true);
    try { localStorage.setItem('cls_theme', JSON.stringify(theme)); } catch {}
    const ok = await saveThemeToServer(theme);
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else { alert('서버 저장 실패\n브라우저에는 저장됐으나 다른 기기에는 반영 안됩니다.'); }
  };

  const panelStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg)',
    borderColor: 'var(--color-border-subtle)',
  };

  const headerContent = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 'var(--font-body)', fontWeight: 700, color: 'var(--color-text-primary)' }}>🎨 테마 설정</div>
        <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', marginTop: 2 }}>저장하면 모든 접속자에게 적용됩니다</div>
      </div>
      <button onClick={() => setOpen(false)}
        style={{ padding: 6, borderRadius: 8, cursor: 'pointer', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-muted)', transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
        <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={() => setOpen(false)} />
      )}

      {/* PC: 우측 슬라이드 */}
      <div className={`hidden md:flex fixed top-0 right-0 h-screen w-[300px] z-50 flex-col shadow-2xl
        transform transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ ...panelStyle, borderLeft: '1px solid var(--color-border-subtle)' }}>
        {headerContent}
        <PanelContent theme={theme} update={update} applyPreset={applyPreset} />
        <SaveBar onReset={() => onThemeChange(DEFAULT_THEME)} onSave={handleSave} saving={saving} saved={saved} />
      </div>

      {/* 모바일: 바텀시트 */}
      <div className={`flex md:hidden fixed inset-x-0 bottom-0 z-50 flex-col shadow-2xl rounded-t-2xl
        transform transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ ...panelStyle, maxHeight: '85vh', borderTop: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: 'var(--color-border-subtle)' }} />
        </div>
        {headerContent}
        <PanelContent theme={theme} update={update} applyPreset={applyPreset} />
        <SaveBar onReset={() => onThemeChange(DEFAULT_THEME)} onSave={handleSave} saving={saving} saved={saved} />
      </div>
    </>
  );
}
