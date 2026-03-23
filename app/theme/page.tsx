'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@/components/ui/ThemeEditor';
import {
  DashboardTheme, DEFAULT_THEME, THEME_PRESETS, FONT_OPTIONS,
  applyThemeToDOM, loadFontByFamily, saveThemeToServer,
} from '@/lib/theme';

function ColorRow({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-text-secondary font-medium" style={{ fontSize: 'var(--font-table-body)' }}>{label}</div>
        {hint && <div className="text-text-muted mt-0.5" style={{ fontSize: 'var(--font-table-header)' }}>{hint}</div>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-text-muted font-mono" style={{ fontSize: 'var(--font-table-header)' }}>{value}</span>
        <label className="relative cursor-pointer">
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          <span className="block w-10 h-10 rounded-xl border-2 border-def hover:border-strong transition-colors shadow-lg"
            style={{ backgroundColor: value }} />
        </label>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, unit = '', step = 1, onChange, hint }: {
  label: string; value: number; min: number; max: number;
  unit?: string; step?: number; onChange: (v: number) => void; hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-3">
      <div className="flex justify-between mb-2">
        <div>
          <span className="text-text-secondary font-medium" style={{ fontSize: 'var(--font-table-body)' }}>{label}</span>
          {hint && <span className="text-text-muted ml-2" style={{ fontSize: 'var(--font-table-header)' }}>({hint})</span>}
        </div>
        <span className="font-bold font-mono" style={{ color: 'var(--color-accent)', fontSize: 'var(--font-table-body)' }}>
          {value > 0 ? `+${value}` : value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, var(--color-accent) ${pct}%, #334155 ${pct}%)` }} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)' }}>
      <div className="font-bold uppercase mb-4 pb-2 border-b flex items-center gap-2" 
        style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', letterSpacing: '0.05em', borderColor: 'var(--color-border-subtle)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function ThemePage() {
  const current = useTheme();
  const [theme, setThemeState] = useState<DashboardTheme>(current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setThemeState(current); }, [current.colorAccent]);

  const update = useCallback(<K extends keyof DashboardTheme>(key: K, value: DashboardTheme[K]) => {
    const next = { ...theme, [key]: value };
    setThemeState(next);
    applyThemeToDOM(next);
    if (key === 'fontFamily') loadFontByFamily(value as string);
  }, [theme]);

  const applyPreset = useCallback((patch: Partial<DashboardTheme>) => {
    const next = { ...DEFAULT_THEME, ...patch };
    setThemeState(next);
    applyThemeToDOM(next);
    loadFontByFamily(next.fontFamily);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { localStorage.setItem('cls_theme', JSON.stringify(theme)); } catch {}
    const ok = await saveThemeToServer(theme);
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else { alert('서버 저장 실패. 브라우저에는 저장됐습니다.'); }
  };

  return (
    <div className="space-y-6 max-w-xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-text-primary" style={{ fontSize: 'var(--font-page-title)' }}>🎨 테마 설정</h1>
          <p className="text-text-tertiary mt-1" style={{ fontSize: 'var(--font-table-body)' }}>
            저장하면 모든 접속자에게 동일하게 적용됩니다
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => applyPreset({})}
            className="px-4 py-2 rounded-lg font-semibold border border-def text-text-tertiary hover:text-text-secondary hover:border-strong transition-all" 
            style={{ fontSize: 'var(--font-body)' }}>
            초기화
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg font-bold transition-all"
            style={{
              fontSize: 'var(--font-body)',
              backgroundColor: saved ? 'rgba(16,185,129,0.2)' : 'var(--color-accent)',
              color: saved ? '#6ee7b7' : '#fff',
              border: saved ? '1px solid rgba(16,185,129,0.4)' : 'none',
              opacity: saving ? 0.6 : 1,
            }}>
            {saved ? '✓ 저장됨' : saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>

      {/* 빠른 프리셋 */}
      <SectionCard title="⚡ 빠른 프리셋">
        <div className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map(p => (
            <button key={p.name} onClick={() => applyPreset(p.patch)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-def
                hover:border-accent/50 hover:bg-accent/5 transition-all text-left"
              style={{ fontSize: 'var(--font-table-body)', color: 'var(--color-text-secondary)' }}>
              <span className="text-lg">{p.emoji}</span>
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-text-muted" style={{ fontSize: 'var(--font-tiny)' }}>{p.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 폰트 */}
      <SectionCard title="📝 폰트">
        <div className="grid grid-cols-1 gap-2">
          {FONT_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => update('fontFamily', opt.value)}
              className={`px-4 py-3 rounded-xl text-left transition-all border
                ${theme.fontFamily === opt.value
                  ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                  : 'text-text-secondary border-def hover:border-strong hover:bg-surface-2'}`}
              style={{ fontFamily: opt.value, fontSize: 'var(--font-table-body)' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 전체 텍스트 크기 */}
      <SectionCard title="🔤 전체 텍스트 크기">
        <SliderRow 
          label="크기 조정" 
          hint="모든 텍스트에 적용"
          value={theme.fontSizeGlobal} 
          min={-4} 
          max={6} 
          step={1}
          onChange={v => update('fontSizeGlobal', v)} 
        />
        <div className="flex justify-between text-text-muted mt-1" style={{ fontSize: 'var(--font-tiny)' }}>
          <span>작게</span>
          <span>기본</span>
          <span>크게</span>
        </div>
      </SectionCard>

      {/* 강조색 */}
      <SectionCard title="🎯 강조색">
        <ColorRow 
          label="강조색" 
          hint="버튼, 활성 탭, 링크에 적용" 
          value={theme.colorAccent}
          onChange={v => update('colorAccent', v)} 
        />
      </SectionCard>

      {/* 차트 색상 */}
      <SectionCard title="📊 차트 색상">
        <ColorRow 
          label="막대 그래프" 
          hint="지원자 수 등" 
          value={theme.colorChartBar}
          onChange={v => update('colorChartBar', v)} 
        />
        <div className="border-t my-1" style={{ borderColor: 'var(--color-border-subtle)' }} />
        <ColorRow 
          label="선 그래프" 
          hint="CPA, 트렌드 등" 
          value={theme.colorChartLine}
          onChange={v => update('colorChartLine', v)} 
        />
      </SectionCard>
    </div>
  );
}
