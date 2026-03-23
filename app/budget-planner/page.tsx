'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  ScatterChart, ZAxis, Cell, LabelList,
} from 'recharts';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import EmptyState from '@/components/ui/EmptyState';

// ── 분석 방법론 접기/펼치기 컴포넌트 ─────────────────────────────────
function MethodBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 'var(--font-label)', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function MethodologySection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
      <button
        onClick={() => setOpen((o: boolean) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
          backgroundColor: 'var(--color-bg)', border: 'none',
        }}
      >
        <span style={{ fontSize: 'var(--font-label)', fontWeight: 700, color: 'var(--color-text-tertiary)' }}>📌 {title}</span>
        <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 16px', backgroundColor: 'var(--color-bg)', fontSize: 'var(--font-small)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const CHANNELS = [
  'Brand_Search_Naver','SA_Carrot','SA_Daum','SA_Google','SA_Naver',
  'Kakao_Tokchannel','Carrot Market','Criteo','Demandgen',
  'Google_pmax','Instagram','Tiktok','toss',
];

// 채널별 색상
const CHANNEL_COLORS: Record<string, string> = {
  Brand_Search_Naver: '#38bdf8', SA_Carrot:    '#f97316', SA_Daum:    '#a78bfa',
  SA_Google:          '#34d399', SA_Naver:     '#4ade80', Kakao_Tokchannel: '#facc15',
  'Carrot Market':    '#fb923c', Criteo:       '#e879f9', Demandgen:  '#67e8f9',
  Google_pmax:        '#f472b6', Instagram:    '#c084fc', Tiktok:     '#94a3b8',
  toss:               '#60a5fa',
};

interface SatBin {
  binCost: number;
  predictedApplicant: number;
  predictedCpa: number;
}

interface SaturationAnalysis {
  bins: SatBin[];
  optimalBudget: number | null;
  currentZone: string;
}

interface ChannelCurve {
  media: string;
  currentDailyBudget: number;
  responseCurve: { cost: number; applicant: number; cpa: number }[];
  scatterData: { cost: number; applicant: number }[];
  saturationPoint: number | null;
  rSquared: number;
  dataPoints: number;
  rawDataPoints?: number;
  confidence: 'high' | 'medium' | 'low';
  curveParams: { a: number; b: number };
  minCost?: number;
  maxCost?: number;
  actualAvgCpa?: number;
  actualAvgApplicant?: number;
  saturationAnalysis?: SaturationAnalysis;
}

interface ChannelSummary {
  media: string;
  cost: number;           // 일 평균 비용 (실측)
  cpa: number;            // 실측 평균 CPA
  applicant: number;      // 실측 일평균 지원자
  rSquared: number;
  confidence: 'high' | 'medium' | 'low';
}

function predictApplicant(cost: number, a: number, b: number) {
  return Math.max(0, a * Math.log(cost / 1000 + 1) + b);
}

// 한계효율 계산: 현재 예산 x에서 +step당 추가 지원자
function buildMarginalCurve(
  responseCurve: { cost: number; applicant: number }[],
  step: number = 50000
): { cost: number; marginalApp: number; cumulativeApp: number }[] {
  const result = [];
  for (let i = 1; i < responseCurve.length; i++) {
    const prev = responseCurve[i - 1];
    const curr = responseCurve[i];
    const costDiff = curr.cost - prev.cost;
    if (costDiff <= 0) continue;
    const marginal = ((curr.applicant - prev.applicant) / costDiff) * step;
    result.push({
      cost: curr.cost,
      marginalApp: Math.max(0, Math.round(marginal * 10) / 10),
      cumulativeApp: curr.applicant,
    });
  }
  return result;
}

function BudgetPlannerPage() {
  const theme = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  // URL params에서 기간/채널 읽기 (헤더 컨트롤과 공유)
  const period = (Number(searchParams.get('days') ?? '90')) as 30 | 60 | 90 | 180;
  const selectedChannel = searchParams.get('media') ?? CHANNELS[0];

  const [curveData, setCurveData] = useState<ChannelCurve | null>(null);
  const [curveLoading, setCurveLoading] = useState(false);
  const [allSummary, setAllSummary] = useState<ChannelSummary[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  // 선택 채널 반응 곡선 조회
  useEffect(() => {
    const load = async () => {
      setCurveLoading(true);
      try {
        const res = await fetch(`/api/budget?media=${encodeURIComponent(selectedChannel)}&days=${period}`);
        const json = await res.json();
        if (!json.error) setCurveData(json);
      } finally {
        setCurveLoading(false);
      }
    };
    load();
  }, [selectedChannel, period]);

  // 전체 채널 효율 맵 데이터 (마운트 시 1회)
  useEffect(() => {
    const loadAll = async () => {
      setAllLoading(true);
      try {
        const results = await Promise.all(
          CHANNELS.map(ch =>
            fetch(`/api/budget?media=${encodeURIComponent(ch)}&days=${period}`)
              .then(r => r.json())
              .catch(() => null)
          )
        );
        const summaries: ChannelSummary[] = results
          .filter(r => r && !r.error)
          .map(r => ({
            media: r.media,
            cost: r.currentDailyBudget ?? 0,
            cpa: r.actualAvgCpa ?? 0,
            applicant: r.actualAvgApplicant ?? 0,
            rSquared: r.rSquared ?? 0,
            confidence: r.confidence ?? 'low',
          }));
        setAllSummary(summaries);
      } finally {
        setAllLoading(false);
      }
    };
    loadAll();
  }, [period]);

  // Marginal Return 재설계: 현재 예산 기준 ±20스텝 × ₩5만 직접 계산
  const marginalCurve = useMemo(() => {
    if (!curveData?.curveParams) return [];
    const { a, b } = curveData.curveParams;
    if (!a && !b) return []; // 모델 피팅 실패 시 빈 배열
    const budget = curveData.currentDailyBudget;
    const step = 50000;
    const steps = 20; // 현재 기준 ±20단계
    const result = [];
    const start = Math.max(step, budget - steps * step);
    const end = budget + steps * step;
    for (let cost = start; cost <= end; cost += step) {
      const gain = predictApplicant(cost + step, a, b) - predictApplicant(cost, a, b);
      result.push({
        cost,
        marginalApp: Math.max(0, Math.round(gain * 100) / 100),
      });
    }
    return result;
  }, [curveData]);

  // 효율맵 축 범위 — X: CPA(낮을수록 좋음, reversed), Y: 일평균 지원자(높을수록 좋음)
  // 버블 크기 = 일평균 비용
  const efficiencyMapDomain = useMemo(() => {
    if (!allSummary.length) return null;

    const validCpa = allSummary.filter(d => d.cpa > 0).map(d => d.cpa);
    const validApp = allSummary.filter(d => d.applicant > 0).map(d => d.applicant);

    if (!validCpa.length || !validApp.length) return null;

    const avgCpa = validCpa.reduce((s, v) => s + v, 0) / validCpa.length;
    const avgApp = validApp.reduce((s, v) => s + v, 0) / validApp.length;

    // log 스케일 대칭 도메인 계산
    const logAvgCpa = Math.log10(avgCpa);
    const maxLogDevCpa = Math.max(...validCpa.filter(c => c > 0).map(c => Math.abs(Math.log10(c) - logAvgCpa)));

    const logAvgApp = Math.log10(avgApp);
    const maxLogDevApp = Math.max(...validApp.filter(a => a > 0).map(a => Math.abs(Math.log10(a) - logAvgApp)));

    return {
      avgCpa, avgApp,
      cpaMin: Math.max(1, Math.pow(10, logAvgCpa - maxLogDevCpa)),
      cpaMax: Math.pow(10, logAvgCpa + maxLogDevCpa),
      appMin: Math.max(0.5, Math.pow(10, logAvgApp - maxLogDevApp)),
      appMax: Math.pow(10, logAvgApp + maxLogDevApp),
    };
  }, [allSummary]);

  const confidenceBadge = (c: ChannelCurve) => ({
    high:   'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
    medium: 'bg-amber-900/60 text-amber-300 border border-amber-700',
    low:    'bg-red-900/60 text-red-300 border border-red-700',
  }[c.confidence]);

  const confidenceLabel = (c: ChannelCurve) => ({
    high: '높음 ✓', medium: '보통 △', low: '낮음 ✗',
  }[c.confidence]);

  return (
    <div className="space-y-6">
      {/* 헤더 — Channel Detail 스타일 */}
      <div>
        <h1 className="font-bold text-text-primary" style={{ fontSize: 'var(--font-page-title)' }}>
          💰 Budget Planner
        </h1>
        <p className="font-bold mt-0.5" style={{ fontSize: 'var(--font-body)', color: 'var(--color-accent)' }}>
          {selectedChannel}
        </p>
      </div>


      {/* ── Section 2: Response Curve ── */}
      <div className="card">
        <div className="section-header">
          <span className="card-title mb-0">📉 Response Curve</span>
        </div>

        {curveLoading ? (
          <div className="skeleton" style={{ height: 256 }} />
        ) : curveData ? (
          <>
            {/* 메타 배지 */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                Avg. Daily Budget: <span className="font-bold text-text-secondary">{fmt.cost(curveData.currentDailyBudget)}</span>
              </span>
              <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                Data: <span className="font-bold text-text-secondary">{curveData.dataPoints}일</span>
                {curveData.rawDataPoints && curveData.rawDataPoints > curveData.dataPoints && (
                  <span className="text-text-muted"> (원본 {curveData.rawDataPoints}일 → 이상치 제거 후)</span>
                )}
              </span>
              {curveData.saturationPoint && (
                <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-delta-inv-pos)' }}>
                  ⚠️ Saturation: {fmt.cost(curveData.saturationPoint)}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full font-bold ${confidenceBadge(curveData)}`} style={{ fontSize: 'var(--font-body)' }}>
                R² = {curveData.rSquared.toFixed(2)} · Fit {confidenceLabel(curveData)}
              </span>
            </div>



            {/* 산점도 + 추세선 */}
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart margin={{ top: 8, right: 20, bottom: 4, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="cost" type="number"
                  domain={[
                    curveData.minCost ? Math.round(curveData.minCost * 0.5) : 0,
                    curveData.currentDailyBudget * 3,
                  ]}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  tickFormatter={v => `₩${fmt.number(v / 10000)}만`}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  dataKey="applicant" type="number"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  tickFormatter={v => fmt.number(v)}
                  axisLine={false} tickLine={false}
                  label={{ value: 'Applicants', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                />
                <YAxis
                  yAxisId="cpa" orientation="right"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  tickFormatter={v => `₩${fmt.number(Math.round(v / 10000))}만`}
                  axisLine={false} tickLine={false}
                  label={{ value: '예측 CPA', angle: 90, position: 'insideRight', fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                />
                <Tooltip
                  content={({ active, label }) => {
                    if (!active || label == null || !curveData?.curveParams) return null;
                    const cost = Number(label);
                    const { a, b } = curveData.curveParams;
                    const predicted = Math.max(0, a * Math.log(cost / 1000 + 1) + b);
                    const predCpa = predicted > 0 ? Math.round(cost / predicted) : 0;
                    return (
                      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: '8px 12px', fontSize: theme.fontSizeChartAxis }}>
                        <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)', marginBottom: 4 }}>Budget: {fmt.cost(cost)}</div>
                        <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-accent)', fontWeight: 700 }}>예측 지원자: {fmt.number(Math.round(predicted))} 명</div>
                        <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-chart-line)', fontWeight: 700 }}>예측 CPA: {fmt.cost(predCpa)}</div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  x={curveData.currentDailyBudget} stroke="#38bdf8" strokeDasharray="4 4"
                  label={{ value: 'Current', fill: 'var(--color-accent)', fontSize: theme.fontSizeChartAxis }}
                />
                {curveData.saturationPoint && (
                  <ReferenceLine
                    x={curveData.saturationPoint} stroke="#f59e0b" strokeDasharray="4 4"
                    label={{ value: 'Saturation', fill: 'var(--color-delta-inv-pos)', fontSize: theme.fontSizeChartAxis }}
                  />
                )}
                {/* 실제 데이터 산점 */}
                <Scatter data={curveData.scatterData} fill="#64748b" opacity={0.55} name="Actual" />
                {/* 로그 추세선 — 지원자 */}
                <Line
                  data={curveData.responseCurve} type="monotone" dataKey="applicant"
                  stroke="#38bdf8" strokeWidth={2.5} dot={false} name="Trend"
                />
                {/* 예측 CPA 선 — 예산 증가에 따라 가속 상승 */}
                <Line
                  yAxisId="cpa"
                  data={curveData.responseCurve} type="monotone" dataKey="cpa"
                  stroke="#f59e0b" strokeWidth={2} dot={false} name="예측 CPA"
                />
              </ComposedChart>
            </ResponsiveContainer>

            <div className="flex items-center gap-4 mt-2">
              <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="inline-block w-3 h-3 rounded-full bg-surface-3 opacity-60" />
                Actual daily data
              </span>
              <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="inline-block w-4 h-0.5 bg-accent" />
                예측 지원자 (체감수익 모델)
              </span>
              <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="inline-block w-4 h-0.5 bg-amber-400" />
                예측 CPA (우축)
              </span>
              <span style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
                R²: how well the curve fits actual data (max 1.0)
              </span>
            </div>
          </>
        ) : (
          <EmptyState icon="📊" title="데이터 없음" />
        )}

        {/* Response Curve 분석 방법론 — 접기/펼치기 */}
        <MethodologySection title="Response Curve 분석 방법론">
          <MethodBlock title="1. 데이터 전처리 — 이상치 제거">
            원시 일별 데이터에서 다음 3단계로 이상치를 순차 제거함.
            <ul>
              <li>지원자 0명인 날 제거 (광고 미집행 또는 일시중단일)</li>
              <li>일 예산이 기간 평균의 10% 미만인 날 제거 (테스트 집행 및 예산 급감일)</li>
              <li>비용·지원자 각각 평균 ±2.5σ 범위 초과 데이터 제거 (극단 이상치)</li>
              <li>단, 제거 후 잔여 데이터가 5건 미만인 경우 원본 데이터를 유지함</li>
            </ul>
          </MethodBlock>
          <MethodBlock title="2. 데이터 전처리 — 버킷 평균화">
            정제된 데이터를 비용 기준 10개 등간격 구간으로 분할 후 각 구간 내 평균 비용·지원자를 산출함. 날별 노이즈 억제 및 추세 안정화를 위한 처리임.
          </MethodBlock>
          <MethodBlock title="3. 곡선 피팅 — 로그 함수">
            버킷 평균값에 로그 함수 y = a × ln(x/1000 + 1) + b 를 최소제곱법으로 피팅함. 예산(x) 증가에 따른 지원자(y)의 체감 증가 구조를 반영함.
          </MethodBlock>
          <MethodBlock title="4. 예측 CPA 산출">
            동일 로그 함수에서 각 예산 수준의 예측 지원자를 도출한 후 예측 CPA = 예산 ÷ 예측 지원자로 산출함. 예산 증가에 따른 CPA의 점진적 상승 추세를 시각화함.
          </MethodBlock>
          <MethodBlock title="5. Hill 함수 기반 포화 곡선">
            Response Curve의 로그 함수와 별도로, 채널 포화도 분석에는 Hill 함수 y = maxVal × xᵅ / (xᵅ + γᵅ)를 적용함.
            <ul>
              <li>α (알파): 곡선 형태 결정 파라미터. 낮을수록 C자형, 높을수록 S자형.</li>
              <li>γ (감마): 포화 변곡점. 해당 예산 수준에서 반응이 최대치의 50%에 도달함.</li>
              <li>γ 탐색 범위 (40~70%) 근거: 2025년 1~10월 전체 채널 합산 일별 데이터 246일 Hill 피팅 결과 γ = 최대 예산의 55%, R² = 0.82로 수렴. 이를 채널별 분석의 경험적 기준으로 채택함.</li>
            </ul>
          </MethodBlock>
          <MethodBlock title="6. 신뢰도 지표 — R²">
            R²(결정계수)는 곡선이 실제 데이터를 얼마나 설명하는지를 나타내는 지표임 (최대 1.0).
            <ul>
              <li>0.7 이상: High — 높은 신뢰도</li>
              <li>0.4~0.7: Medium — 참고 가능</li>
              <li>0.4 미만: Low — 예산 외 요인(소재 변경, 시즌, 경쟁 강도 등)의 영향이 상대적으로 크므로 수치 해석 시 주의 요망</li>
            </ul>
          </MethodBlock>
        </MethodologySection>
      </div>

      {/* ── Section 3: Marginal Return ── */}
      <div className="card">
        <div className="section-header">
          <span className="card-title mb-0">📈 Marginal Return</span>
          <div className="flex items-center gap-2">
            {curveData && (
              <span className={`px-2 py-0.5 rounded-full font-bold ${confidenceBadge(curveData)}`} style={{ fontSize: 'var(--font-body)' }}>
                R² = {curveData.rSquared.toFixed(2)} · {confidenceLabel(curveData)}
              </span>
            )}
            <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>예산 레벨별 ₩5만 추가 시 증가 지원자 수 · {selectedChannel}</span>
          </div>
        </div>

        {curveLoading ? (
          <div className="skeleton" style={{ height: 192 }} />
        ) : marginalCurve.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={marginalCurve} margin={{ top: 8, right: 20, bottom: 4, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="cost"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  tickFormatter={v => `₩${fmt.number(v / 10000)}만`}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  axisLine={false} tickLine={false}
                  label={{ value: 'Marginal App.', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, fontSize: theme.fontSizeChartAxis }}
                  formatter={(v: any) => [`+${fmt.number(Number(v), 1)} applicants`, 'Marginal gain']}
                  labelFormatter={v => `Budget: ${fmt.cost(Number(v))}`}
                />
                {curveData && (
                  <ReferenceLine
                    x={curveData.currentDailyBudget} stroke="#38bdf8" strokeDasharray="4 4"
                    label={{ value: 'Current', fill: 'var(--color-accent)', fontSize: theme.fontSizeChartAxis }}
                  />
                )}
                {/* 한계효율 곡선 */}
                <Line
                  dataKey="marginalApp" type="monotone"
                  stroke="#34d399" strokeWidth={2.5} dot={false}
                />
                {/* 기준선: 0 */}
                <ReferenceLine y={0} stroke="#334155" />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-1" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
              Curve slopes downward = diminishing returns. At saturation, additional spend yields minimal applicants.
            </p>
          </>
        ) : (
          <div className="text-center py-8" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Select a channel above</div>
        )}

        {/* Marginal Return 분석 방법론 — 접기/펼치기 */}
        <MethodologySection title="Marginal Return 분석 방법론">
          <MethodBlock title="1. 계산 방식">
            Response Curve와 동일한 로그 함수(a, b)를 기반으로, 현재 일 예산 기준 ±20단계 × ₩5만 범위에 대한 한계 지원자를 산출함.
            <ul>
              <li>각 구간별 한계 지원자 = 예측(예산 + ₩5만) - 예측(예산)</li>
              <li>예산 ₩5만 추가 집행 시 확보 가능한 증분 지원자 수를 의미함</li>
            </ul>
          </MethodBlock>
          <MethodBlock title="2. 해석 기준">
            한계 지원자가 감소하는 구간은 추가 예산 투입의 효율이 저하되고 있음을 의미함. 현재 예산 수준이 체감 구간 내에 위치하는지 여부를 파악하는 데 활용함.
          </MethodBlock>
          <MethodBlock title="3. Response Curve와의 관계">
            Marginal Return은 Response Curve 피팅 결과(a, b)에 직접 의존함. R²가 낮을수록 로그 피팅의 정확도가 저하되므로 Marginal Return 수치의 신뢰도도 동일하게 저하됨.
          </MethodBlock>
        </MethodologySection>
      </div>

      {/* ── Section 4: Channel Efficiency Map ── */}
      <div className="card">
        <div className="section-header">
          <span className="card-title mb-0">🗺️ Channel Efficiency Map</span>
          <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Avg. daily cost vs CPA · all channels</span>
        </div>



        {/* 4분면 로직 설명:
            X축 = CPA (←낮을수록 좋음, reversed)  →  좌측 = 효율 우수
            Y축 = 일평균 지원자 (↑높을수록 좋음)   →  상단 = 규모 큼
            4분면:
              좌상 = 낮은CPA + 많은지원자 → 핵심채널(효율+규모 모두 우수)
              우상 = 높은CPA + 많은지원자 → 규모 대비 효율 개선 필요
              좌하 = 낮은CPA + 적은지원자 → 효율은 좋으나 규모 확대 여지
              우하 = 높은CPA + 적은지원자 → 비효율 (재검토 필요)
        */}
        <p className="mb-3" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
          X축 = CPA (←낮을수록 효율 우수) · Y축 = 일평균 지원자수 (↑많을수록 규모 큼) · 버블 크기 = 일평균 비용 · 점선 = 전체 평균
        </p>

        {allLoading ? (
          <div className="skeleton" style={{ height: 256 }} />
        ) : allSummary.length > 0 && efficiencyMapDomain ? (
          <>
            <div style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 24, right: 40, bottom: 36, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                  <XAxis
                    dataKey="cpa" type="number" name="CPA"
                    scale="log"
                    domain={[efficiencyMapDomain.cpaMin, efficiencyMapDomain.cpaMax]}
                    reversed
                    tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                    tickFormatter={v => fmt.cost(Math.round(v))}
                    axisLine={false} tickLine={false}
                    label={{ value: 'CPA ← (낮을수록 효율 우수)', position: 'insideBottom', offset: -16, fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  />
                  <YAxis
                    dataKey="applicant" type="number" name="일평균 지원자"
                    scale="log"
                    domain={[efficiencyMapDomain.appMin, efficiencyMapDomain.appMax]}
                    tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                    tickFormatter={v => `${fmt.number(Math.round(v))}명`}
                    axisLine={false} tickLine={false}
                    label={{ value: '일평균 지원자 ↑', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }}
                  />
                  <ZAxis range={[1, 1]} />
                  <ReferenceLine
                    x={efficiencyMapDomain.avgCpa} stroke="var(--color-text-muted)" strokeDasharray="5 3" strokeOpacity={0.5}
                    label={{ value: `avg ${fmt.cost(Math.round(efficiencyMapDomain.avgCpa))}`, position: 'top', fill: 'var(--color-text-tertiary)', fontSize: theme.fontSizeTiny }}
                  />
                  <ReferenceLine
                    y={efficiencyMapDomain.avgApp} stroke="var(--color-text-muted)" strokeDasharray="5 3" strokeOpacity={0.5}
                    label={{ value: `avg ${fmt.number(Math.round(efficiencyMapDomain.avgApp))}명`, position: 'right', fill: 'var(--color-text-tertiary)', fontSize: theme.fontSizeTiny }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      // 4분면 분류
                      const isGoodCpa = d.cpa <= efficiencyMapDomain.avgCpa;
                      const isBigScale = d.applicant >= efficiencyMapDomain.avgApp;
                      const quadrant = isGoodCpa && isBigScale ? '🏆 핵심 채널'
                        : !isGoodCpa && isBigScale ? '⚠️ 규모 대비 효율'
                        : isGoodCpa && !isBigScale ? '💎 효율 우수'
                        : '🔻 비효율';
                      return (
                        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: '10px 14px', fontSize: theme.fontSizeChartAxis, minWidth: 180 }}>
                          <div style={{ fontSize: 'var(--font-body)', fontWeight: 700, color: CHANNEL_COLORS[d.media] ?? '#94a3b8', marginBottom: 6 }}>{d.media}</div>
                          <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginBottom: 6 }}>{quadrant}</div>
                          <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Avg. CPA: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 700 }}>{fmt.cost(d.cpa)}</span></div>
                          <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Avg. 지원자: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 700 }}>{fmt.number(d.applicant)}명</span></div>
                          <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Avg. Daily Cost: <span style={{ color: 'var(--color-text-secondary)' }}>{fmt.cost(d.cost)}</span></div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={allSummary.filter(d => d.cpa > 0 && d.applicant > 0)}
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return <g/>;
                      const maxApp = Math.max(...allSummary.map(d => d.applicant ?? 0), 1);
                      const r = Math.max(18, Math.sqrt((payload.applicant ?? 0) / maxApp) * 65);
                      const color = CHANNEL_COLORS[payload.media] ?? '#94a3b8';
                      const opacity = payload.confidence === 'low' ? 0.45 : 0.85;
                      const fs = 11;
                      const label = payload.media.length > (r < 22 ? 3 : r < 30 ? 5 : r < 45 ? 8 : r < 55 ? 11 : 14)
                        ? payload.media.slice(0, r < 22 ? 3 : r < 30 ? 5 : r < 45 ? 8 : r < 55 ? 11 : 14)
                        : payload.media;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={opacity} stroke={color} strokeWidth={1.5} style={{ cursor: 'pointer' }} />
                          <text x={cx} y={cy + fs * 0.35} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight={700} style={{ pointerEvents: 'none' }}>{label}</text>
                        </g>
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* 채널 범례 테이블 */}
            <div className="mt-4 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">CHANNEL</th>
                    <th>AVG. DAILY COST</th>
                    <th>AVG. CPA (실측)</th>
                    <th>AVG. 지원자 (실측)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allSummary]
                    .sort((a, b) => a.cpa - b.cpa)
                    .map(ch => (
                      <tr
                        key={ch.media}
                        className="cursor-pointer hover:bg-surface-2/50 transition-colors"
                        onClick={() => router.push(`/budget-planner?days=${period}&media=${encodeURIComponent(ch.media)}`)}
                      >
                        <td>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: CHANNEL_COLORS[ch.media] ?? '#94a3b8' }}
                            />
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{ch.media}</span>
                          </span>
                        </td>
                        <td>{fmt.cost(ch.cost)}</td>
                        <td>{fmt.cost(ch.cpa)}</td>
                        <td>{fmt.number(ch.applicant)}명</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

          </>
        ) : (
          <EmptyState icon="📊" title="데이터 없음" />
        )}
      </div>
    </div>
  );
}

export default function BudgetPlannerPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>Loading...</div>}>
      <BudgetPlannerPage />
    </Suspense>
  );
}
