/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // ── 하위 호환 ──
        slate: { 950: '#020817' },

        // ── CLS Design System: CSS 변수 연동 ──────────────────────────────
        // 배경 레이어
        'bg-base':    'var(--color-bg)',
        'surface-1':  'var(--color-surface-1)',
        'surface-2':  'var(--color-surface-2)',
        'surface-3':  'var(--color-surface-3)',
        'elevated':   'var(--color-surface-elevated)',

        // 테두리
        'border-subtle':  'var(--color-border-subtle)',
        'border-def':     'var(--color-border-default)',
        'border-strong':  'var(--color-border-strong)',

        // 텍스트
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary':  'var(--color-text-tertiary)',
        'text-muted':     'var(--color-text-muted)',

        // 인터랙티브
        'accent':         'var(--color-accent)',
        'accent-hover':   'var(--color-accent-hover)',

        // 시맨틱
        'success':        'var(--color-success)',
        'warning':        'var(--color-warning)',
        'error':          'var(--color-error)',

        // 델타
        'delta-pos':      'var(--color-delta-pos)',
        'delta-neg':      'var(--color-delta-neg)',
        'delta-neutral':  'var(--color-delta-neutral)',
      },
      borderColor: {
        'subtle':  'var(--color-border-subtle)',
        'def':     'var(--color-border-default)',
        'strong':  'var(--color-border-strong)',
        'accent':  'var(--color-accent)',
      },
      borderRadius: {
        'xs':   'var(--radius-xs)',
        'sm':   'var(--radius-sm)',
        'card': 'var(--card-radius)',
      },
      boxShadow: {
        'sm':      'var(--shadow-sm)',
        'md':      'var(--shadow-md)',
        'lg':      'var(--shadow-lg)',
        'xl':      'var(--shadow-xl)',
        'tooltip': 'var(--shadow-tooltip)',
        'accent':  'var(--shadow-accent)',
      },
    },
  },
  plugins: [],
};
