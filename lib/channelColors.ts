/**
 * 채널 공통 컬러 정의
 * - 등록된 채널: 수동 지정 컬러
 * - 미등록 채널: 채널명 해시 → 팔레트 자동 배정 (항상 동일 채널 = 동일 색)
 * - isDark 파라미터로 라이트/다크 테마 텍스트 자동 조정
 */

export interface ChannelBadgeColor {
  bg: string;
  border: string;
  text: string;
}

// ── 미등록 채널 자동 배정 팔레트 (32색) ──
const AUTO_PALETTE: Array<{ solid: string; bg: string; border: string; textDark: string; textLight: string }> = [
  { solid:'#ef4444', bg:'rgba(239,68,68,0.18)',    border:'rgba(239,68,68,0.7)',    textDark:'#fecaca', textLight:'#991b1b'  },
  { solid:'#3b82f6', bg:'rgba(59,130,246,0.18)',   border:'rgba(59,130,246,0.7)',   textDark:'#bfdbfe', textLight:'#1e40af'  },
  { solid:'#22c55e', bg:'rgba(34,197,94,0.18)',    border:'rgba(34,197,94,0.7)',    textDark:'#bbf7d0', textLight:'#15803d'  },
  { solid:'#f97316', bg:'rgba(249,115,22,0.18)',   border:'rgba(249,115,22,0.7)',   textDark:'#fed7aa', textLight:'#c2410c'  },
  { solid:'#a855f7', bg:'rgba(168,85,247,0.18)',   border:'rgba(168,85,247,0.7)',   textDark:'#e9d5ff', textLight:'#7e22ce'  },
  { solid:'#eab308', bg:'rgba(234,179,8,0.18)',    border:'rgba(234,179,8,0.7)',    textDark:'#fef08a', textLight:'#a16207'  },
  { solid:'#06b6d4', bg:'rgba(6,182,212,0.18)',    border:'rgba(6,182,212,0.7)',    textDark:'#a5f3fc', textLight:'#0e7490'  },
  { solid:'#ec4899', bg:'rgba(236,72,153,0.18)',   border:'rgba(236,72,153,0.7)',   textDark:'#fbcfe8', textLight:'#be185d'  },
  { solid:'#84cc16', bg:'rgba(132,204,22,0.18)',   border:'rgba(132,204,22,0.7)',   textDark:'#d9f99d', textLight:'#4d7c0f'  },
  { solid:'#8b5cf6', bg:'rgba(139,92,246,0.18)',   border:'rgba(139,92,246,0.7)',   textDark:'#ddd6fe', textLight:'#6d28d9'  },
  { solid:'#14b8a6', bg:'rgba(20,184,166,0.18)',   border:'rgba(20,184,166,0.7)',   textDark:'#99f6e4', textLight:'#0f766e'  },
  { solid:'#f43f5e', bg:'rgba(244,63,94,0.18)',    border:'rgba(244,63,94,0.7)',    textDark:'#fecdd3', textLight:'#be123c'  },
  { solid:'#0ea5e9', bg:'rgba(14,165,233,0.18)',   border:'rgba(14,165,233,0.7)',   textDark:'#bae6fd', textLight:'#0369a1'  },
  { solid:'#d946ef', bg:'rgba(217,70,239,0.18)',   border:'rgba(217,70,239,0.7)',   textDark:'#f5d0fe', textLight:'#a21caf'  },
  { solid:'#10b981', bg:'rgba(16,185,129,0.18)',   border:'rgba(16,185,129,0.7)',   textDark:'#a7f3d0', textLight:'#065f46'  },
  { solid:'#f59e0b', bg:'rgba(245,158,11,0.18)',   border:'rgba(245,158,11,0.7)',   textDark:'#fde68a', textLight:'#92400e'  },
  { solid:'#6366f1', bg:'rgba(99,102,241,0.18)',   border:'rgba(99,102,241,0.7)',   textDark:'#c7d2fe', textLight:'#4338ca'  },
  { solid:'#2dd4bf', bg:'rgba(45,212,191,0.18)',   border:'rgba(45,212,191,0.7)',   textDark:'#99f6e4', textLight:'#0f766e'  },
  { solid:'#fb7185', bg:'rgba(251,113,133,0.18)',  border:'rgba(251,113,133,0.7)',  textDark:'#fecdd3', textLight:'#9f1239'  },
  { solid:'#60a5fa', bg:'rgba(96,165,250,0.18)',   border:'rgba(96,165,250,0.7)',   textDark:'#bfdbfe', textLight:'#1d4ed8'  },
  { solid:'#4ade80', bg:'rgba(74,222,128,0.18)',   border:'rgba(74,222,128,0.7)',   textDark:'#bbf7d0', textLight:'#166534'  },
  { solid:'#fb923c', bg:'rgba(251,146,60,0.18)',   border:'rgba(251,146,60,0.7)',   textDark:'#fed7aa', textLight:'#9a3412'  },
  { solid:'#c084fc', bg:'rgba(192,132,252,0.18)',  border:'rgba(192,132,252,0.7)',  textDark:'#e9d5ff', textLight:'#6b21a8'  },
  { solid:'#facc15', bg:'rgba(250,204,21,0.18)',   border:'rgba(250,204,21,0.7)',   textDark:'#fef08a', textLight:'#854d0e'  },
  { solid:'#22d3ee', bg:'rgba(34,211,238,0.18)',   border:'rgba(34,211,238,0.7)',   textDark:'#a5f3fc', textLight:'#155e75'  },
  { solid:'#f472b6', bg:'rgba(244,114,182,0.18)',  border:'rgba(244,114,182,0.7)',  textDark:'#fbcfe8', textLight:'#9d174d'  },
  { solid:'#a3e635', bg:'rgba(163,230,53,0.18)',   border:'rgba(163,230,53,0.7)',   textDark:'#d9f99d', textLight:'#3f6212'  },
  { solid:'#818cf8', bg:'rgba(129,140,248,0.18)',  border:'rgba(129,140,248,0.7)',  textDark:'#c7d2fe', textLight:'#3730a3'  },
  { solid:'#34d399', bg:'rgba(52,211,153,0.18)',   border:'rgba(52,211,153,0.7)',   textDark:'#a7f3d0', textLight:'#065f46'  },
  { solid:'#fbbf24', bg:'rgba(251,191,36,0.18)',   border:'rgba(251,191,36,0.7)',   textDark:'#fde68a', textLight:'#78350f'  },
  { solid:'#38bdf8', bg:'rgba(56,189,248,0.18)',   border:'rgba(56,189,248,0.7)',   textDark:'#bae6fd', textLight:'#075985'  },
  { solid:'#e879f9', bg:'rgba(232,121,249,0.18)',  border:'rgba(232,121,249,0.7)',  textDark:'#f5d0fe', textLight:'#86198f'  },
];

function hashChannel(ch: string): number {
  let hash = 0;
  for (let i = 0; i < ch.length; i++) {
    hash = (hash * 31 + ch.charCodeAt(i)) >>> 0;
  }
  return hash % AUTO_PALETTE.length;
}

// ── 등록 채널 고정 컬러 인덱스 매핑 ──────────────────────────────────────────
const REGISTERED_INDEX: Record<string, number> = {
  'Brand_Search_Naver': 1,   // blue
  'SA_Carrot':          3,   // orange
  'SA_Daum':            4,   // purple
  'SA_Google':          2,   // green
  'SA_Naver':           10,  // teal
  'Kakao_Tokchannel':   5,   // yellow
  'Carrot Market':      0,   // red
  'Criteo':             7,   // pink
  'Demandgen':          16,  // indigo
  'Google_pmax':        12,  // sky
  'Instagram':          13,  // fuchsia
  'Tiktok':             8,   // lime
  'toss':               6,   // cyan
};

/** 버블 차트용 단색 */
export const getBubbleColor = (ch: string): string => {
  const idx = REGISTERED_INDEX[ch] ?? hashChannel(ch);
  return AUTO_PALETTE[idx].solid;
};

/**
 * 배지 컬러 조회
 * @param ch 채널명
 * @param isDark 다크 테마 여부 (기본 true). 라이트 테마에서는 더 진한 텍스트 색상 적용.
 */
export const getChColor = (ch: string, isDark = true): ChannelBadgeColor => {
  const idx = REGISTERED_INDEX[ch] ?? hashChannel(ch);
  const p = AUTO_PALETTE[idx];
  return {
    bg:     p.bg,
    border: p.border,
    text:   isDark ? p.textDark : p.textLight,
  };
};

// ── 하위 호환: 기존 CHANNEL_COLORS, BUBBLE_COLORS 참조 코드 대응 ──────────────
export const CHANNEL_COLORS: Record<string, ChannelBadgeColor> = Object.fromEntries(
  Object.keys(REGISTERED_INDEX).map(ch => [ch, getChColor(ch, true)])
);

export const BUBBLE_COLORS: Record<string, string> = Object.fromEntries(
  Object.keys(REGISTERED_INDEX).map(ch => [ch, getBubbleColor(ch)])
);
