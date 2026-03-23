'use client';

import { useState } from 'react';

interface ExportButtonProps {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  className?: string;
}

export function ExportToSheetsButton({ title, headers, rows, className }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, headers, rows }),
      });
      if (!res.ok) {
        const text = await res.text();
        try { const j = JSON.parse(text); throw new Error(j.error ?? '내보내기 실패'); }
        catch { throw new Error('내보내기 실패'); }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message ?? '내보내기 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleExport}
        disabled={loading}
        className={`btn ${className ?? ''}`}
        style={{
          fontSize: 'var(--font-body)',
          backgroundColor: 'var(--color-success-muted)',
          color: 'var(--color-success)',
          border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        Excel 다운로드
      </button>
      {error && <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-delta-neg)' }}>⚠️ {error}</span>}
    </div>
  );
}
