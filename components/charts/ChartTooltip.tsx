import { TooltipProps } from 'recharts';

interface ChartTooltipProps extends TooltipProps<number, string> {
  formatters?: Record<string, (value: number) => string>;
  labelFormatter?: (label: string) => string;
}

export default function ChartTooltip({
  active,
  payload,
  label,
  formatters,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        backgroundColor: 'var(--tooltip-bg)',
        border: '1px solid var(--tooltip-border)',
        borderRadius: 'var(--tooltip-radius)',
        padding: 'var(--tooltip-padding)',
        boxShadow: 'var(--tooltip-shadow)',
        fontSize: 'var(--font-small)',
        minWidth: 140,
      }}
    >
      <p
        style={{
          fontWeight: 700,
          marginBottom: 'var(--space-2)',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--font-small)',
        }}
      >
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: i < payload.length - 1 ? 'var(--space-1)' : 0,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: p.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--color-text-tertiary)', flex: 1 }}>
            {p.name}:
          </span>
          <span style={{ fontWeight: 600, color: p.color }}>
            {formatters?.[p.dataKey as string]
              ? formatters[p.dataKey as string](p.value as number)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
