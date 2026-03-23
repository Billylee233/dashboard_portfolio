'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MultiSelectDropdownProps {
  label:        string;
  options:      string[];
  selected:     string[];
  onChange:     (val: string[]) => void;
  placeholder?: string;
  required?:    boolean;
  disabled?:    boolean;
  maxWidth?:    number;
}

export function MultiSelectDropdown({
  label, options, selected, onChange,
  placeholder, required = false, disabled = false, maxWidth = 180,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = useCallback((opt: string) => {
    if (selected.includes(opt)) {
      if (required && selected.length <= 1) return;
      onChange(selected.filter(s => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }, [selected, onChange, required]);

  const selectAll = () => onChange([...options]);
  const clearAll  = () => {
    if (required) onChange(options.length ? [options[0]] : []);
    else onChange([]);
  };

  const btnLabel = selected.length === 0
    ? (placeholder ?? label)
    : selected.length === options.length
    ? `${label} (전체)`
    : selected.length === 1
    ? selected[0]
    : `${selected[0]} 외 ${selected.length - 1}`;

  const isActive = selected.length > 0 && selected.length < options.length;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 80, maxWidth }}>
      {/* 트리거 버튼 */}
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             'var(--space-1)',
          padding:         'var(--space-1) var(--space-3)',
          borderRadius:    'var(--radius-sm)',
          fontSize:        'var(--font-label)',
          fontWeight:      700,
          cursor:          disabled ? 'not-allowed' : 'pointer',
          border:          `1px solid ${open || isActive ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
          backgroundColor: open || isActive ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--color-surface-2)',
          color:           open || isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          transition:      'all var(--transition-normal)',
          whiteSpace:      'nowrap',
          maxWidth,
          overflow:        'hidden',
          textOverflow:    'ellipsis',
          opacity:         disabled ? 0.5 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'left' }}>
          {btnLabel}
        </span>
        {selected.length > 0 && selected.length < options.length && (
          <span style={{
            backgroundColor: 'var(--color-accent)',
            color:           '#fff',
            borderRadius:    'var(--radius-full)',
            fontSize:        'var(--font-tiny)',
            fontWeight:      700,
            padding:         '1px 5px',
            flexShrink:      0,
          }}>
            {selected.length}
          </span>
        )}
        <svg
          style={{
            width: 12, height: 12, flexShrink: 0,
            transition: `transform var(--transition-normal)`,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div style={{
          position:        'absolute',
          top:             'calc(100% + 4px)',
          left:            0,
          zIndex:          'var(--z-dropdown)' as any,
          backgroundColor: 'var(--color-surface-1)',
          border:          '1px solid var(--color-accent)',
          borderRadius:    'var(--radius-md)',
          boxShadow:       'var(--shadow-lg)',
          minWidth:        160,
          maxWidth:        240,
          maxHeight:       260,
          overflowY:       'auto',
          padding:         'var(--space-1) 0',
        }}>
          {/* 전체 / 초기화 */}
          <div style={{
            display:      'flex',
            gap:          'var(--space-2)',
            padding:      'var(--space-1) var(--space-3) var(--space-1)',
            borderBottom: '1px solid var(--color-border-subtle)',
            marginBottom: 2,
          }}>
            <button onClick={selectAll} style={subBtnStyle}>전체</button>
            <button onClick={clearAll}  style={subBtnStyle}>초기화</button>
          </div>

          {options.length === 0 && (
            <div style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
              옵션 없음
            </div>
          )}

          {options.map(opt => {
            const checked = selected.includes(opt);
            const isLast  = required && checked && selected.length <= 1;
            return (
              <div
                key={opt}
                onClick={() => !isLast && toggle(opt)}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             'var(--space-2)',
                  padding:         'var(--space-1) var(--space-3)',
                  cursor:          isLast ? 'not-allowed' : 'pointer',
                  backgroundColor: checked ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent',
                  transition:      `background-color var(--transition-fast)`,
                  opacity:         isLast ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!isLast) (e.currentTarget as HTMLDivElement).style.backgroundColor =
                    'color-mix(in srgb, var(--color-accent) 14%, transparent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor =
                    checked ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent';
                }}
              >
                {/* 체크박스 */}
                <div style={{
                  width:           15, height: 15,
                  borderRadius:    'var(--radius-xs)',
                  flexShrink:      0,
                  border:          `1.5px solid ${checked ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
                  backgroundColor: checked ? 'var(--color-accent)' : 'transparent',
                  display:         'flex', alignItems: 'center', justifyContent: 'center',
                  transition:      `all var(--transition-fast)`,
                }}>
                  {checked && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize:     'var(--font-small)',
                  fontWeight:   checked ? 600 : 400,
                  color:        checked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  whiteSpace:   'nowrap',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth:     180,
                }}>
                  {opt}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const subBtnStyle: React.CSSProperties = {
  fontSize:        'var(--font-tiny)',
  fontWeight:      600,
  padding:         '2px var(--space-2)',
  borderRadius:    'var(--radius-xs)',
  border:          '1px solid var(--color-border-default)',
  backgroundColor: 'transparent',
  color:           'var(--color-text-muted)',
  cursor:          'pointer',
};
