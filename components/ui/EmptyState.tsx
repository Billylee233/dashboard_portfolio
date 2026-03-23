import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  style?: React.CSSProperties;
}

export default function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className = '',
  style,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${className}`}
      style={style}
    >
      <span className="empty-state-icon">{icon}</span>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
