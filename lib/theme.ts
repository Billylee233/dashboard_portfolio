export interface FontOption {
  label: string;
  value: string;
  url?: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { label: 'Pretendard (기본)', value: 'Pretendard Variable, Pretendard, -apple-system, sans-serif', url: '' },
  { label: 'Noto Sans KR', value: "'Noto Sans KR', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
  { label: 'IBM Plex Sans KR', value: "'IBM Plex Sans KR', sans-serif", url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap' },
  { label: 'Nanum Gothic', value: "'Nanum Gothic', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap' },
  { label: 'Nanum Myeongjo (명조)', value: "'Nanum Myeongjo', serif", url: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&display=swap' },
  { label: 'Black Han Sans (임팩트)', value: "'Black Han Sans', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap' },
];

export interface DashboardTheme {
  fontFamily: string;
  fontSizeGlobal: number;
  fontSizeDisplay: number;
  fontSizePageTitle: number;
  fontSizeSectionTitle: number;
  fontSizeNavTab: number;
  fontSizeTableHeader: number;
  fontSizeTableBody: number;
  fontSizeKpiValue: number;
  fontSizeKpiLabel: number;
  fontSizeChartAxis: number;
  fontSizeTiny: number;

  /* ── 배경 레이어 (5단계) ── */
  colorBg: string;
  colorSurface1: string;
  colorSurface2: string;
  colorSurface3: string;
  colorSurfaceElevated: string;

  /* ── 테두리 (3단계) ── */
  colorBorderSubtle: string;
  colorBorderDefault: string;
  colorBorderStrong: string;

  /* ── 텍스트 (4단계) ── */
  colorTextPrimary: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextMuted: string;

  /* ── 인터랙티브 ── */
  colorAccent: string;
  colorAccentHover: string;

  /* ── 시맨틱 상태 ── */
  colorSuccess: string;
  colorWarning: string;
  colorError: string;

  /* ── 델타 ── */
  colorDeltaPos: string;
  colorDeltaNeg: string;
  colorDeltaInvPos: string;
  colorDeltaInvNeg: string;
  colorDeltaNeutral: string;

  /* ── 차트 ── */
  colorChartBar: string;
  colorChartBar2: string;
  colorChartLine: string;
  colorChartLine2: string;
  colorChartGrid: string;

  /* ── 레이아웃 & 카드 ── */
  barMaxWidth: number;
  cardBorderRadius: number;
  cardBorderOpacity: number;
  tableRowPadding: number;

  /* ── 하위 호환 (기존 코드가 참조하는 alias) ── */
  colorSection: string;
  colorSectionBorder: string;
  colorTextMain: string;
  colorTextEmphasis: string;
  colorTextTableHeader: string;
  colorBar: string;
  colorBar2: string;
  colorCpaLine: string;
  colorLine2: string;
}

export const DEFAULT_THEME: DashboardTheme = {
  fontFamily: 'Pretendard Variable, Pretendard, -apple-system, sans-serif',
  fontSizeGlobal: 0,
  fontSizeDisplay: 32,
  fontSizePageTitle: 20,
  fontSizeSectionTitle: 12,
  fontSizeNavTab: 12,
  fontSizeTableHeader: 11,
  fontSizeTableBody: 12,
  fontSizeKpiValue: 24,
  fontSizeKpiLabel: 14,
  fontSizeChartAxis: 10,
  fontSizeTiny: 9,

  colorBg:               '#020617',
  colorSurface1:         '#0f172a',
  colorSurface2:         '#1e293b',
  colorSurface3:         '#334155',
  colorSurfaceElevated:  '#1e293b',
  colorBorderSubtle:     '#1e293b',
  colorBorderDefault:    '#334155',
  colorBorderStrong:     '#475569',
  colorTextPrimary:      '#f8fafc',
  colorTextSecondary:    '#e2e8f0',
  colorTextTertiary:     '#94a3b8',
  colorTextMuted:        '#64748b',
  colorAccent:           '#0ea5e9',
  colorAccentHover:      '#38bdf8',
  colorSuccess:          '#10b981',
  colorWarning:          '#f59e0b',
  colorError:            '#ef4444',
  colorDeltaPos:         '#10b981',
  colorDeltaNeg:         '#ef4444',
  colorDeltaInvPos:      '#ef4444',
  colorDeltaInvNeg:      '#10b981',
  colorDeltaNeutral:     '#64748b',
  colorChartBar:         '#0ea5e9',
  colorChartBar2:        '#334155',
  colorChartLine:        '#f59e0b',
  colorChartLine2:       '#8b5cf6',
  colorChartGrid:        '#1e293b',
  barMaxWidth:           24,
  cardBorderRadius:      16,
  cardBorderOpacity:     100,
  tableRowPadding:       10,

  // 하위 호환 alias — applyThemeToDOM에서 자동 계산
  colorSection:          '#0f172a',
  colorSectionBorder:    '#1e293b',
  colorTextMain:         '#e2e8f0',
  colorTextEmphasis:     '#f8fafc',
  colorTextTableHeader:  '#94a3b8',
  colorBar:              '#0ea5e9',
  colorBar2:             '#334155',
  colorCpaLine:          '#f59e0b',
  colorLine2:            '#8b5cf6',
};

const MOBILE_SCALE_FONT   = 0.82;
const MOBILE_SCALE_SPACE  = 0.78;
const MOBILE_SCALE_RADIUS = 0.75;

function fs(base: number, global: number) {
  return Math.max(8, base + global);
}

function injectMobileScaleStyle(theme: DashboardTheme) {
  const id = 'cls-mobile-scale';
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  const g = theme.fontSizeGlobal;
  el.textContent = `
    @media (max-width: 767px) {
      :root {
        --font-display:       ${Math.round(fs(theme.fontSizeDisplay, g) * MOBILE_SCALE_FONT)}px;
        --font-page-title:    ${Math.round(fs(theme.fontSizePageTitle, g) * MOBILE_SCALE_FONT)}px;
        --font-section-title: ${Math.round(fs(theme.fontSizeSectionTitle, g) * MOBILE_SCALE_FONT)}px;
        --font-body:          ${Math.round(fs(theme.fontSizeTableBody, g) * MOBILE_SCALE_FONT)}px;
        --font-label:         ${Math.round(fs(theme.fontSizeTableHeader, g) * MOBILE_SCALE_FONT)}px;
        --font-small:         ${Math.round(fs(theme.fontSizeChartAxis, g) * MOBILE_SCALE_FONT)}px;
        --font-tiny:          ${Math.round(fs(theme.fontSizeTiny, g) * MOBILE_SCALE_FONT)}px;
        --font-nav-tab:       ${Math.round(fs(theme.fontSizeNavTab, g) * MOBILE_SCALE_FONT)}px;
        --font-table-header:  ${Math.round(fs(theme.fontSizeTableHeader, g) * MOBILE_SCALE_FONT)}px;
        --font-table-body:    ${Math.round(fs(theme.fontSizeTableBody, g) * MOBILE_SCALE_FONT)}px;
        --font-kpi-value:     ${Math.round(fs(theme.fontSizeKpiValue, g) * MOBILE_SCALE_FONT)}px;
        --font-kpi-label:     ${Math.round(fs(theme.fontSizeKpiLabel, g) * MOBILE_SCALE_FONT)}px;
        --font-chart-axis:    ${Math.round(fs(theme.fontSizeChartAxis, g) * MOBILE_SCALE_FONT)}px;
        --table-row-padding:  ${Math.round(theme.tableRowPadding * MOBILE_SCALE_SPACE)}px;
        --card-radius:        ${Math.round(theme.cardBorderRadius * MOBILE_SCALE_RADIUS)}px;
      }
    }
  `;
}

export function applyThemeToDOM(theme: DashboardTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const g = theme.fontSizeGlobal;

  document.body.style.fontFamily = theme.fontFamily;
  document.body.style.backgroundColor = theme.colorBg;
  document.body.style.color = theme.colorTextSecondary;

  // ── 타이포그래피 ──
  root.style.setProperty('--font-family',        theme.fontFamily);
  root.style.setProperty('--font-display',       `${fs(theme.fontSizeDisplay, g)}px`);
  root.style.setProperty('--font-page-title',    `${fs(theme.fontSizePageTitle, g)}px`);
  root.style.setProperty('--font-section-title', `${fs(theme.fontSizeSectionTitle, g)}px`);
  root.style.setProperty('--font-body',          `${fs(theme.fontSizeTableBody, g)}px`);
  root.style.setProperty('--font-label',         `${fs(theme.fontSizeTableHeader, g)}px`);
  root.style.setProperty('--font-small',         `${fs(theme.fontSizeChartAxis, g)}px`);
  root.style.setProperty('--font-tiny',          `${fs(theme.fontSizeTiny, g)}px`);
  root.style.setProperty('--font-nav-tab',       `${fs(theme.fontSizeNavTab, g)}px`);
  root.style.setProperty('--font-table-header',  `${fs(theme.fontSizeTableHeader, g)}px`);
  root.style.setProperty('--font-table-body',    `${fs(theme.fontSizeTableBody, g)}px`);
  root.style.setProperty('--font-kpi-value',     `${fs(theme.fontSizeKpiValue, g)}px`);
  root.style.setProperty('--font-kpi-label',     `${fs(theme.fontSizeKpiLabel, g)}px`);
  root.style.setProperty('--font-chart-axis',    `${fs(theme.fontSizeChartAxis, g)}px`);

  // ── 배경 레이어 ──
  root.style.setProperty('--color-bg',               theme.colorBg);
  root.style.setProperty('--color-surface-1',        theme.colorSurface1);
  root.style.setProperty('--color-surface-2',        theme.colorSurface2);
  root.style.setProperty('--color-surface-3',        theme.colorSurface3);
  root.style.setProperty('--color-surface-elevated', theme.colorSurfaceElevated);

  // ── 테두리 ──
  root.style.setProperty('--color-border-subtle',    theme.colorBorderSubtle);
  root.style.setProperty('--color-border-default',   theme.colorBorderDefault);
  root.style.setProperty('--color-border-strong',    theme.colorBorderStrong);

  // ── 텍스트 ──
  root.style.setProperty('--color-text-primary',     theme.colorTextPrimary);
  root.style.setProperty('--color-text-secondary',   theme.colorTextSecondary);
  root.style.setProperty('--color-text-tertiary',    theme.colorTextTertiary);
  root.style.setProperty('--color-text-muted',       theme.colorTextMuted);

  // ── 인터랙티브 ──
  root.style.setProperty('--color-accent',           theme.colorAccent);
  root.style.setProperty('--color-accent-hover',     theme.colorAccentHover);
  // accent-muted는 자동 계산 (라이트/다크 구분)
  const isLight = isLightColor(theme.colorBg);
  root.style.setProperty('--color-accent-muted',     hexToRgba(theme.colorAccent, isLight ? 0.12 : 0.15));

  // ── 시맨틱 상태 ──
  root.style.setProperty('--color-success',          theme.colorSuccess);
  root.style.setProperty('--color-success-muted',    hexToRgba(theme.colorSuccess, 0.15));
  root.style.setProperty('--color-warning',          theme.colorWarning);
  root.style.setProperty('--color-warning-muted',    hexToRgba(theme.colorWarning, 0.15));
  root.style.setProperty('--color-error',            theme.colorError);
  root.style.setProperty('--color-error-muted',      hexToRgba(theme.colorError, 0.15));

  // ── 델타 ──
  root.style.setProperty('--color-delta-pos',        theme.colorDeltaPos);
  root.style.setProperty('--color-delta-neg',        theme.colorDeltaNeg);
  root.style.setProperty('--color-delta-inv-pos',    theme.colorDeltaInvPos);
  root.style.setProperty('--color-delta-inv-neg',    theme.colorDeltaInvNeg);
  root.style.setProperty('--color-delta-neutral',    theme.colorDeltaNeutral);

  // ── 차트 ──
  root.style.setProperty('--color-chart-bar',        theme.colorChartBar);
  root.style.setProperty('--color-chart-bar-2',      theme.colorChartBar2);
  root.style.setProperty('--color-chart-line',       theme.colorChartLine);
  root.style.setProperty('--color-chart-line-2',     theme.colorChartLine2);
  root.style.setProperty('--color-chart-grid',       theme.colorChartGrid);
  root.style.setProperty('--color-chart-area',       hexToRgba(theme.colorChartBar, 0.1));

  // ── 하위 호환 alias ──
  root.style.setProperty('--color-section',           theme.colorSurface1);
  root.style.setProperty('--color-section-border',    theme.colorBorderSubtle);
  root.style.setProperty('--color-text-main',         theme.colorTextSecondary);
  root.style.setProperty('--color-text-emphasis',     theme.colorTextPrimary);
  root.style.setProperty('--color-text-table-header', theme.colorTextTertiary);
  root.style.setProperty('--color-bar',               theme.colorChartBar);
  root.style.setProperty('--color-bar-2',             theme.colorChartBar2);
  root.style.setProperty('--color-cpa-line',          theme.colorChartLine);
  root.style.setProperty('--color-line-2',            theme.colorChartLine2);

  // ── 레이아웃 & 카드 ──
  root.style.setProperty('--card-radius',         `${theme.cardBorderRadius}px`);
  root.style.setProperty('--card-radius-sm',      `${Math.max(4, theme.cardBorderRadius - 8)}px`);
  root.style.setProperty('--card-border-opacity', String(theme.cardBorderOpacity / 100));
  root.style.setProperty('--table-row-padding',   `${theme.tableRowPadding}px`);
  root.style.setProperty('--bar-max-width',       `${theme.barMaxWidth}px`);

  // ── color-scheme (라이트 테마일 때 스크롤바·input 색상 맞춤) ──
  root.style.colorScheme = isLight ? 'light' : 'dark';

  injectMobileScaleStyle(theme);
}

export function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0,2), 16);
  const g = parseInt(c.slice(2,4), 16);
  const b = parseInt(c.slice(4,6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
}

/** hex → rgba() 문자열. rgba는 hex가 아닌 경우 그대로 반환 */
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return hex;
  const r = parseInt(c.slice(0,2), 16);
  const g = parseInt(c.slice(2,4), 16);
  const b = parseInt(c.slice(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function loadFontByFamily(fontFamily: string) {
  if (typeof document === 'undefined') return;
  const opt = FONT_OPTIONS.find(f => f.value === fontFamily);
  if (!opt?.url) return;
  if (document.querySelector(`link[data-font-family="${opt.label}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = opt.url;
  link.setAttribute('data-font-family', opt.label);
  document.head.appendChild(link);
}

export async function fetchThemeFromServer(): Promise<DashboardTheme | null> {
  try {
    const res = await fetch('/api/theme', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data ? { ...DEFAULT_THEME, ...data } : null;
  } catch { return null; }
}

export async function saveThemeToServer(theme: DashboardTheme): Promise<boolean> {
  try {
    const res = await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(theme),
    });
    return res.ok;
  } catch { return false; }
}

// ─── 4개 테마 프리셋 ─────────────────────────────────────────────────────────
export const THEME_PRESETS: {
  name: string;
  emoji: string;
  desc: string;
  patch: Partial<DashboardTheme>;
}[] = [
  {
    // ── 1. Slate Dark (기본 다크, 현재 개선) ──
    name: 'Slate Dark',
    emoji: '🌙',
    desc: '기본 다크 테마',
    patch: {
      colorBg:              '#020617',
      colorSurface1:        '#0f172a',
      colorSurface2:        '#1e293b',
      colorSurface3:        '#334155',
      colorSurfaceElevated: '#1e293b',
      colorBorderSubtle:    '#1e293b',
      colorBorderDefault:   '#334155',
      colorBorderStrong:    '#475569',
      colorTextPrimary:     '#f8fafc',
      colorTextSecondary:   '#e2e8f0',
      colorTextTertiary:    '#94a3b8',
      colorTextMuted:       '#64748b',
      colorAccent:          '#0ea5e9',
      colorAccentHover:     '#38bdf8',
      colorSuccess:         '#10b981',
      colorWarning:         '#f59e0b',
      colorError:           '#ef4444',
      colorDeltaPos:        '#10b981',
      colorDeltaNeg:        '#ef4444',
      colorDeltaInvPos:     '#ef4444',
      colorDeltaInvNeg:     '#10b981',
      colorDeltaNeutral:    '#64748b',
      colorChartBar:        '#0ea5e9',
      colorChartBar2:       '#334155',
      colorChartLine:       '#f59e0b',
      colorChartLine2:      '#8b5cf6',
      colorChartGrid:       '#1e293b',
      cardBorderRadius:     16,
    },
  },
  {
    // ── 2. Clean Light ⭐ 최우선 (라이트 모드) ──
    name: 'Clean Light',
    emoji: '☀️',
    desc: '라이트 모드 · 업무용',
    patch: {
      colorBg:              '#f8fafc',
      colorSurface1:        '#ffffff',
      colorSurface2:        '#f1f5f9',
      colorSurface3:        '#e2e8f0',
      colorSurfaceElevated: '#ffffff',
      colorBorderSubtle:    '#e2e8f0',
      colorBorderDefault:   '#cbd5e1',
      colorBorderStrong:    '#94a3b8',
      colorTextPrimary:     '#0f172a',
      colorTextSecondary:   '#334155',
      colorTextTertiary:    '#64748b',
      colorTextMuted:       '#94a3b8',
      colorAccent:          '#0284c7',
      colorAccentHover:     '#0369a1',
      colorSuccess:         '#059669',
      colorWarning:         '#d97706',
      colorError:           '#dc2626',
      colorDeltaPos:        '#059669',
      colorDeltaNeg:        '#dc2626',
      colorDeltaInvPos:     '#dc2626',
      colorDeltaInvNeg:     '#059669',
      colorDeltaNeutral:    '#94a3b8',
      colorChartBar:        '#0284c7',
      colorChartBar2:       '#e2e8f0',
      colorChartLine:       '#d97706',
      colorChartLine2:      '#7c3aed',
      colorChartGrid:       '#e2e8f0',
      cardBorderRadius:     12,
    },
  },
  {
    // ── 3. Carbon Pro (IBM Carbon 기반 관제센터) ──
    name: 'Carbon Pro',
    emoji: '🖥️',
    desc: '관제센터 · 전문가용',
    patch: {
      fontFamily:           "'IBM Plex Sans KR', sans-serif",
      colorBg:              '#161616',
      colorSurface1:        '#262626',
      colorSurface2:        '#393939',
      colorSurface3:        '#525252',
      colorSurfaceElevated: '#262626',
      colorBorderSubtle:    '#393939',
      colorBorderDefault:   '#525252',
      colorBorderStrong:    '#6f6f6f',
      colorTextPrimary:     '#ffffff',
      colorTextSecondary:   '#f4f4f4',
      colorTextTertiary:    '#c6c6c6',
      colorTextMuted:       '#8d8d8d',
      colorAccent:          '#0f62fe',
      colorAccentHover:     '#0050e6',
      colorSuccess:         '#42be65',
      colorWarning:         '#ff832b',
      colorError:           '#fa4d56',
      colorDeltaPos:        '#42be65',
      colorDeltaNeg:        '#fa4d56',
      colorDeltaInvPos:     '#fa4d56',
      colorDeltaInvNeg:     '#42be65',
      colorDeltaNeutral:    '#6f6f6f',
      colorChartBar:        '#0f62fe',
      colorChartBar2:       '#525252',
      colorChartLine:       '#ff832b',
      colorChartLine2:      '#be95ff',
      colorChartGrid:       '#393939',
      cardBorderRadius:     2,
    },
  },
  {
    // ── 4. Warm Dusk (따뜻한 다크) ──
    name: 'Warm Dusk',
    emoji: '🌅',
    desc: '웜 다크 · 편안한',
    patch: {
      fontFamily:           "'Noto Sans KR', sans-serif",
      colorBg:              '#1c1917',
      colorSurface1:        '#292524',
      colorSurface2:        '#44403c',
      colorSurface3:        '#57534e',
      colorSurfaceElevated: '#292524',
      colorBorderSubtle:    '#44403c',
      colorBorderDefault:   '#57534e',
      colorBorderStrong:    '#78716c',
      colorTextPrimary:     '#fafaf9',
      colorTextSecondary:   '#e7e5e4',
      colorTextTertiary:    '#a8a29e',
      colorTextMuted:       '#78716c',
      colorAccent:          '#f59e0b',
      colorAccentHover:     '#fbbf24',
      colorSuccess:         '#84cc16',
      colorWarning:         '#fb923c',
      colorError:           '#f87171',
      colorDeltaPos:        '#84cc16',
      colorDeltaNeg:        '#f87171',
      colorDeltaInvPos:     '#f87171',
      colorDeltaInvNeg:     '#84cc16',
      colorDeltaNeutral:    '#78716c',
      colorChartBar:        '#f59e0b',
      colorChartBar2:       '#44403c',
      colorChartLine:       '#84cc16',
      colorChartLine2:      '#a78bfa',
      colorChartGrid:       '#44403c',
      cardBorderRadius:     10,
    },
  },
];
