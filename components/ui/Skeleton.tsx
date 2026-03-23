import React from 'react';

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 공용 스켈레톤 로딩 컴포넌트
 * globals.css의 .skeleton 클래스 사용 (shimmer 애니메이션 포함)
 */
export default function Skeleton({
  height = 200,
  width = '100%',
  radius,
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        height: typeof height === 'number' ? height : height,
        width: typeof width === 'number' ? width : width,
        borderRadius: radius ?? 'var(--radius-lg)',
        ...style,
      }}
    />
  );
}

/** 차트 전용 스켈레톤 — card 래퍼 포함 */
export function SkeletonCard({ height = 280 }: { height?: number }) {
  return (
    <div className="card">
      <Skeleton height={height} />
    </div>
  );
}

/** 테이블 행 스켈레톤 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height="var(--table-row-height)" radius="var(--radius-sm)" />
      ))}
    </div>
  );
}
