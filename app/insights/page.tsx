'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '@/components/layout/DashboardLayout';
import { ExportToSheetsButton } from '@/components/ui/ExportButton';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import type { MetricsRow } from '@/lib/types';
import EmptyState from '@/components/ui/EmptyState';

const IS_PORTFOLIO_CLIENT = process.env.NEXT_PUBLIC_PORTFOLIO_MODE === 'true';
const CHANNELS = IS_PORTFOLIO_CLIENT ? [
  '채널45','채널52','채널88','채널90','채널69',
  '채널83','채널27','채널90','채널67',
  '채널42','채널60','채널80','채널83',
] : [
  'Brand_Search_Naver','SA_Carrot','SA_Daum','SA_Google','SA_Naver',
  'Kakao_Tokchannel','Carrot Market','Criteo','Demandgen',
  'Google_pmax','Instagram','Tiktok','toss',
];

type InsightType = 'combo' | 'image' | 'text';
type SortBy = 'score' | 'cpa' | 'ctr' | 'cvr';

interface InsightItem {
  rank: number;
  image_code: string | null;
  text_code: string | null;
  image_content: string | null;
  text_content: string | null;
  score: number;
  metrics: MetricsRow;
}

const TYPE_LABELS: Record<InsightType, string> = {
  combo: '소재 조합 Top 10',
  image: '이미지 Top 10',
  text:  '텍스트 Top 10',
};

const SORT_LABELS: Record<SortBy, string> = {
  score: '스코어',
  cpa:   'CPA',
  ctr:   'CTR',
  cvr:   'CVR',
};

function RankBadge({ rank }: { rank: number }) {
  const colors = ['bg-yellow-500', 'bg-surface-3', 'bg-amber-700'];
  const bg = colors[rank - 1] ?? 'bg-surface-3';
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-white ${bg}`} style={{ fontSize: 'var(--font-small)' }}>
      {rank}
    </span>
  );
}

function InsightTable({ items, loading, insightType }: { items: InsightItem[]; loading: boolean; insightType: InsightType }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 56 }} />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState icon="🔍" title="해당 조건의 소재 데이터가 없습니다" />
    );
  }

  const showImage = insightType === 'combo' || insightType === 'image';
  const showText  = insightType === 'combo' || insightType === 'text';

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="text-left w-8">순위</th>
            {showImage && <th className="text-left">이미지 소재</th>}
            {showText  && <th className="text-left">텍스트 소재</th>}
            <th>스코어</th>
            <th>IMP</th><th>CLICK</th><th>CTR</th>
            <th>COST</th><th>CPC</th>
            <th>APP</th><th>CPA</th><th>CVR</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.rank}>
              <td><RankBadge rank={item.rank} /></td>
              {showImage && (
                <td className="max-w-[200px]">
                  {item.image_code ? (
                    <div>
                      <div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>{item.image_code}</div>
                      {item.image_content && <p style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }} className="line-clamp-2 leading-relaxed">{item.image_content}</p>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
              )}
              {showText && (
                <td className="max-w-[200px]">
                  {item.text_code ? (
                    <div>
                      <div style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 2 }}>{item.text_code}</div>
                      {item.text_content && <p style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }} className="line-clamp-2 leading-relaxed">{item.text_content}</p>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
              )}
              <td className="font-bold" style={{ color: "var(--color-accent)" }}>{item.score.toFixed(3)}</td>
              <td>{fmt.number(item.metrics.imp)}</td>
              <td>{fmt.number(item.metrics.click)}</td>
              <td>{fmt.pct(item.metrics.ctr)}</td>
              <td>{fmt.cost(item.metrics.cost)}</td>
              <td>{fmt.cost(item.metrics.cpc)}</td>
              <td className="font-semibold" style={{ color: "var(--color-accent)" }}>{fmt.number(item.metrics.applicant)}</td>
              <td>{fmt.cost(item.metrics.cpa)}</td>
              <td>{fmt.pct(item.metrics.cvr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InsightsPage() {
  const { selectedRange } = useDashboard();
  const [channel, setChannel] = useState<string>('');
  const [insightType, setInsightType] = useState<InsightType>('combo');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [data, setData] = useState<Record<string, InsightItem[]>>({});
  const [loading, setLoading] = useState(false);

  const cacheKey = (t: InsightType, s: SortBy) => `${t}:${s}`;

  const fetchInsights = useCallback(async (type: InsightType, sort: SortBy) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start: selectedRange.start,
        end:   selectedRange.end,
        type,
        sortBy: sort,
        ...(channel ? { media: channel } : {}),
      });
      const res = await fetch(`/api/insights?${params}`);
      const json = await res.json();
      setData(prev => ({ ...prev, [cacheKey(type, sort)]: json.items ?? [] }));
    } finally {
      setLoading(false);
    }
  }, [selectedRange, channel]);

  useEffect(() => {
    fetchInsights(insightType, sortBy);
  }, [insightType, sortBy, selectedRange, channel]);

  const currentItems = data[cacheKey(insightType, sortBy)] ?? [];

  const exportRows = currentItems.map(item => [
    item.rank,
    item.image_code ?? '',
    item.image_content ?? '',
    item.text_code ?? '',
    item.text_content ?? '',
    item.score.toFixed(3),
    item.metrics.imp,
    item.metrics.click,
    fmt.pct(item.metrics.ctr),
    item.metrics.cost,
    item.metrics.cpc,
    item.metrics.applicant,
    item.metrics.cpa,
    fmt.pct(item.metrics.cvr),
  ]);

  const btnStyle = (active: boolean) => ({
    padding: '3px 10px',
    borderRadius: 6,
    fontSize: 'var(--font-label)',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#ffffff' : 'var(--color-text-secondary)',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-text-primary" style={{ fontSize: "var(--font-page-title)" }}>💡 Insights</h1>
          <p className="mt-1" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
            우수 소재 추출 — 스코어 = CPA 50% + CTR 30% + CVR 20%
          </p>
        </div>
        <div className="hidden md:block">
        <ExportToSheetsButton
          title={`Insights_${insightType}_${selectedRange.start}`}
          headers={['순위','이미지코드','이미지내용','텍스트코드','텍스트내용','스코어','IMP','CLICK','CTR','COST','CPC','APP','CPA','CVR']}
          rows={exportRows}
        />
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 채널 선택 */}
        <select
          value={channel}
          onChange={e => setChannel(e.target.value)}
          style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-accent)', borderRadius: 6, padding: '4px 10px', fontSize: 'var(--font-label)', fontWeight: 700, color: 'var(--color-accent)', cursor: 'pointer', outline: 'none', minHeight: 32 }}
        >
          <option value="">전체 채널</option>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* 소재 유형 탭 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['combo', 'image', 'text'] as InsightType[]).map(t => (
            <button key={t} onClick={() => setInsightType(t)}
              style={btnStyle(insightType === t)}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* 정렬 기준 버튼 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['score', 'cpa', 'ctr', 'cvr'] as SortBy[]).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              style={btnStyle(sortBy === s)}>
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>

        <span className="ml-auto" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
          {selectedRange.start} ~ {selectedRange.end}
        </span>
      </div>

      {/* 테이블 */}
      <div className="card">
        <div className="card-title">{TYPE_LABELS[insightType]} — {SORT_LABELS[sortBy]} 기준</div>
        <InsightTable items={currentItems} loading={loading} insightType={insightType} />
        <div className="mt-4 leading-relaxed" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
          * 제외 기준: CPA 100원 미만 · CVR 50% 초과 · CTR 50% 초과 · 지원자 10명 이하 · 노출 1,000 이하 · 클릭 100 이하 · 비용 ₩100,000 이하 · error/Unknown/임시 소재
        </div>
      </div>
    </div>
  );
}
