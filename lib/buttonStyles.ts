import React from 'react';

/** 필터/토글 버튼 공통 스타일 — 비선택: transparent, 선택: accent 채움 */
export const filterBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 10px',
  borderRadius: 6,
  fontSize: 'var(--font-label)',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.15s',
  backgroundColor: active ? 'var(--color-accent)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-secondary)',
});

/** 드롭다운 공통 스타일 */
export const dropdownStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-surface-1)',
  border: '1px solid var(--color-accent)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 'var(--font-small)',
  fontWeight: 700,
  color: 'var(--color-accent)',
  cursor: 'pointer',
  outline: 'none',
  minHeight: 32,
};
