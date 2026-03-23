import { NextRequest, NextResponse } from 'next/server';
import { queryBudgetResponseData, queryDistinctMedia } from '@/lib/bigquery';
import type { BudgetMode, BudgetAllocation } from '@/lib/types';
import { IS_PORTFOLIO, maskChannel, buildReverseChannelMap, reverseChannel } from '@/lib/portfolio/transform';

// ── Hill 함수 기반 포화 곡선 ──────────────────────────────────────────────
// Meta Robyn 표준: y = maxVal * x^alpha / (x^alpha + gamma^alpha)
// - alpha: 곡선 형태 (작을수록 C자, 클수록 S자). 여기서는 고정 1.0 (단순 체감)
// - gamma: 변곡점 위치 (데이터 범위 대비 비율로 최적화)
// - maxVal: 최대 지원자 추정치 (데이터 최대값 기반)
//
// 로그 곡선 대비 장점:
// 1. 자연스러운 포화 표현 (무한히 증가하지 않고 maxVal에서 수렴)
// 2. alpha 파라미터로 S자/C자 전환 가능
// 3. 한계 CPA = 도함수 역수가 실측 CPA 수준에서 나옴

function fitHillCurve(data: { cost: number; applicant: number }[]): { alpha: number; gamma: number; maxVal: number } {
  if (data.length < 3) return { alpha: 1, gamma: 1, maxVal: 100 };

  const maxX = Math.max(...data.map(d => d.cost));
  const maxY = Math.max(...data.map(d => d.applicant));
  const maxVal = maxY * 1.2;

  // gamma 범위: 전체 예산 범위의 40~70%
  // 근거: 2025년 1~10월 전체 채널 합산 데이터(246일, R²=0.82) 실증 분석 결과
  // 전체 채널 합산 Hill 피팅에서 gamma = 최대 예산의 55%로 수렴
  // 채널별 적용 시 40~70% 범위가 현실적인 포화 구간을 포착함
  let bestGamma = maxX * 0.55;
  let bestAlpha = 1.0;
  let bestSSE = Infinity;

  for (let gi = 8; gi <= 14; gi++) {  // 40% ~ 70%
    const gamma = (gi / 20) * maxX;
    for (let ai = 5; ai <= 25; ai += 5) {
      const alpha = ai / 10; // 0.5 ~ 2.5
      const sse = data.reduce((s, d) => {
        const pred = hillPredict(d.cost, alpha, gamma, maxVal);
        return s + (d.applicant - pred) ** 2;
      }, 0);
      if (sse < bestSSE) {
        bestSSE = sse;
        bestGamma = gamma;
        bestAlpha = alpha;
      }
    }
  }

  return { alpha: bestAlpha, gamma: bestGamma, maxVal };
}

function hillPredict(cost: number, alpha: number, gamma: number, maxVal: number): number {
  if (cost <= 0) return 0;
  const xa = Math.pow(cost, alpha);
  const ga = Math.pow(gamma, alpha);
  return maxVal * xa / (xa + ga);
}

// Hill 한계 CPA: dy/dx 역수
// dy/dx = maxVal * alpha * gamma^alpha * x^(alpha-1) / (x^alpha + gamma^alpha)^2
function hillMarginalCpa(cost: number, alpha: number, gamma: number, maxVal: number): number {
  if (cost <= 0 || maxVal <= 0) return 999999;
  const xa = Math.pow(cost, alpha);
  const ga = Math.pow(gamma, alpha);
  const denom = (xa + ga) ** 2;
  const numerator = maxVal * alpha * ga * Math.pow(cost, alpha - 1);
  const slope = numerator / denom;
  if (slope <= 0) return 999999;
  return Math.round(1 / slope);
}

// Hill R² 계산
function calcHillRSquared(data: { cost: number; applicant: number }[], alpha: number, gamma: number, maxVal: number): number {
  if (data.length < 3) return 0;
  const ys = data.map(d => d.applicant);
  const yMean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = data.reduce((s, d) => {
    const pred = hillPredict(d.cost, alpha, gamma, maxVal);
    return s + (d.applicant - pred) ** 2;
  }, 0);
  if (ssTot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

// 기존 로그 곡선 (Response Curve 섹션에서 계속 사용)
function fitLogCurve(data: { cost: number; applicant: number }[]): { a: number; b: number } {
  if (data.length < 3) return { a: 0, b: 0 };

  // 최소제곱법으로 y = a*ln(x+1) + b 피팅
  const xs = data.map(d => Math.log(d.cost / 1000 + 1));
  const ys = data.map(d => d.applicant);
  const n = xs.length;
  const sumX  = xs.reduce((s, x) => s + x, 0);
  const sumY  = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { a: 0, b: sumY / n };

  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  return { a: Math.max(0, a), b }; // b는 음수 허용 — 음수여야 곡선이 실제 데이터 높이로 내려옴
}

// R² (결정계수) 계산
function calcRSquared(data: { cost: number; applicant: number }[], a: number, b: number): number {
  if (data.length < 3) return 0;
  const ys = data.map(d => d.applicant);
  const yMean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = data.reduce((s, d) => {
    const pred = predictApplicant(d.cost, a, b);
    return s + (d.applicant - pred) ** 2;
  }, 0);
  if (ssTot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}
function predictApplicant(cost: number, a: number, b: number): number {
  return Math.max(0, a * Math.log(cost / 1000 + 1) + b);
}

// ── 포화도 분석 ────────────────────────────────────────────────────────
// 비용 구간(bin)별로 한계 CPA를 계산하고 효율/체감/포화 구간을 분류합니다.
//
// [핵심 설계 원칙]
// bin 간 raw 차분(delta cost / delta applicant)은 데이터 노이즈에 취약합니다.
// 같은 비용에서도 지원자가 날마다 크게 달라지기 때문에 bin 평균이 오르락내리락하고,
// 지원자가 감소하는 구간에서는 marginal CPA가 수백만원 같은 이상치가 나옵니다.
// ── Channel Saturation Analysis ──────────────────────────────────────────────
// 목표: "예산이 얼마일 때 추가 지출 대비 지원자 증가가 한계에 달하는가"를 실측 데이터로 직접 계산
//
// [설계 원칙]
// 곡선 피팅(R²)에 의존하지 않음 — R²가 낮으면 도함수 기반 한계 CPA가 완전히 틀림
// 실측 scatter 데이터를 비용 순으로 bin 분할 후 bin 간 직접 차분:
//   한계 CPA = Δ비용 / Δ지원자
// 노이즈 제거: 3-bin 이동평균
// 최적 예산: smoothed 한계 CPA가 actualAvgCpa를 최초로 넘는 직전 bin

interface SatBin {
  binCost: number;
  predictedApplicant: number;
  predictedCpa: number;
}

function buildSaturationAnalysis(
  data: { cost: number; applicant: number }[],
  currentBudget: number,
  curveA: number,
  curveB: number,
  actualAvgCpa: number
): { bins: SatBin[]; optimalBudget: number | null; currentZone: string } {
  if (data.length < 6) return { bins: [], optimalBudget: null, currentZone: '' };

  const sorted = [...data].sort((a, b) => a.cost - b.cost);
  const numBins = Math.min(12, Math.max(6, Math.floor(data.length / 5)));
  const minC = sorted[0].cost;
  const maxC = sorted[sorted.length - 1].cost;
  const binSize = (maxC - minC) / numBins;
  const { alpha, gamma, maxVal } = fitHillCurve(sorted);

  const bins: SatBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const lo = minC + i * binSize;
    const hi = lo + binSize + (i === numBins - 1 ? 1 : 0);
    const pts = sorted.filter(d => d.cost >= lo && d.cost < hi);
    if (pts.length === 0) continue;
    const avgCost = pts.reduce((s, d) => s + d.cost, 0) / pts.length;
    const predictedApp = Math.max(0.1, hillPredict(avgCost, alpha, gamma, maxVal));
    bins.push({
      binCost: Math.round(avgCost),
      predictedApplicant: Math.round(predictedApp * 10) / 10,
      predictedCpa: Math.round(avgCost / predictedApp),
    });
  }

  if (bins.length < 3) return { bins: [], optimalBudget: null, currentZone: '' };

  // 최적 예산: 지원자 증가율이 CPA 증가율을 앞서는 마지막 구간
  // = 두 선(predictedApplicant, predictedCpa)의 교차 직전 지점
  let optimalBudget: number = bins[0].binCost;
  for (let i = 1; i < bins.length; i++) {
    const dCost = bins[i].binCost - bins[i-1].binCost;
    if (dCost <= 0) continue;
    const appGrowthRate = (bins[i].predictedApplicant - bins[i-1].predictedApplicant) / dCost;
    const cpaGrowthRate = (bins[i].predictedCpa - bins[i-1].predictedCpa) / dCost;
    if (appGrowthRate * bins[i].predictedCpa > cpaGrowthRate) {
      optimalBudget = bins[i].binCost;
    }
  }

  return { bins, optimalBudget, currentZone: '' };
}


function removeOutliers(data: { cost: number; applicant: number }[]) {
  // Step 1: 지원자 0명인 날 제거
  const withApplicant = data.filter(d => d.applicant > 0);
  if (withApplicant.length < 5) return data; // 데이터 너무 적으면 원본 유지

  // Step 2: 비용이 평균의 10% 미만인 날 제거 (테스트/일시중단 집행일)
  const avgCost = withApplicant.reduce((s, d) => s + d.cost, 0) / withApplicant.length;
  const validCost = withApplicant.filter(d => d.cost >= avgCost * 0.1);

  // Step 3: 비용 / 지원자 각각 평균 ± 2.5σ 밖 제거
  const clip = (arr: { cost: number; applicant: number }[], key: 'cost' | 'applicant') => {
    const vals = arr.map(d => d[key]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const lo = mean - 2.5 * std;
    const hi = mean + 2.5 * std;
    return arr.filter(d => d[key] >= lo && d[key] <= hi);
  };

  let cleaned = clip(validCost, 'cost');
  cleaned = clip(cleaned, 'applicant');
  return cleaned.length >= 5 ? cleaned : validCost; // 너무 많이 제거되면 롤백
}

// ── 전처리 2: 비용 구간 버킷팅 → 구간별 평균으로 피팅 ──────────────
// 날짜별 raw 노이즈 대신 "비용 구간의 평균 지원자"로 안정화
function bucketAndAverage(
  data: { cost: number; applicant: number }[],
  numBuckets = 10
): { cost: number; applicant: number }[] {
  if (data.length < numBuckets) return data;

  const minCost = Math.min(...data.map(d => d.cost));
  const maxCost = Math.max(...data.map(d => d.cost));
  const bucketSize = (maxCost - minCost) / numBuckets;

  const buckets: { cost: number; applicant: number }[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const lo = minCost + i * bucketSize;
    const hi = lo + bucketSize;
    const inBucket = data.filter(d => d.cost >= lo && d.cost < hi + (i === numBuckets - 1 ? 1 : 0));
    if (inBucket.length === 0) continue;
    const avgC = inBucket.reduce((s, d) => s + d.cost, 0) / inBucket.length;
    const avgA = inBucket.reduce((s, d) => s + d.applicant, 0) / inBucket.length;
    buckets.push({ cost: Math.round(avgC), applicant: Math.round(avgA * 10) / 10 });
  }
  return buckets.length >= 3 ? buckets : data;
}


// 곡선 시작점 = 실제 데이터 최솟값의 50% (0부터 시작하면 로그 특성상 곡선이 실제 데이터와 동떨어짐)
function buildResponseCurve(
  a: number, b: number,
  minCost: number,
  currentBudget: number,
  saturationPoint: number | null
) {
  const points = [];
  const steps = 40;
  const start = Math.max(minCost * 0.5, 10000); // 최소 ₩1만부터
  const baseCap = currentBudget * 3;
  const cap = Math.min(
    saturationPoint ? Math.max(baseCap, saturationPoint * 1.1) : baseCap,
    20000000
  );

  for (let i = 0; i <= steps; i++) {
    const cost = start + ((cap - start) / steps) * i;
    const applicant = predictApplicant(cost, a, b);
    const cpa = cost > 0 && applicant > 0 ? cost / applicant : 0;
    points.push({ cost: Math.round(cost), applicant: Math.round(applicant * 10) / 10, cpa: Math.round(cpa) });
  }
  return points;
}

// 채널별 포화 임계값 (알려진 채널 특성)
const SATURATION_POINTS: Record<string, number> = {
  Tiktok: 500000,   // 틱톡: 50만원 초과 시 효율 급감
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    let media = searchParams.get('media')!;
    const days = Number(searchParams.get('days') ?? '90');

    // 포트폴리오 모드: 마스킹된 채널명 → 실제 채널명 역변환
    let revMap = new Map<string, string>();
    if (IS_PORTFOLIO) {
      const realChannels = await queryDistinctMedia();
      revMap = buildReverseChannelMap(realChannels);
      media = reverseChannel(media, revMap);
    }

    const rawData = await queryBudgetResponseData(media, days);

    if (!rawData.length) {
      return NextResponse.json({ error: 'No data' }, { status: 404 });
    }

    // 일자별 cost/applicant 집계
    const dailyData = rawData.map((r: any) => ({
      cost: Number(r.cost) || 0,
      applicant: Number(r.applicant) || 0,
    })).filter((d: any) => d.cost > 0);

    // ── 전처리: 이상치 제거 → 버킷 평균화 → 피팅 ──
    const cleaned   = removeOutliers(dailyData);       // 이상치 제거
    const bucketed  = bucketAndAverage(cleaned, 10);   // 구간 평균화

    const { a, b } = fitLogCurve(bucketed);            // 버킷 평균으로 피팅
    const minCost   = Math.min(...cleaned.map(d => d.cost));
    const maxCost   = Math.max(...cleaned.map(d => d.cost));
    const satPoint  = SATURATION_POINTS[media] ?? null;

    // 최근 7일 평균 현재 예산
    const recent7 = rawData.slice(-7);
    const avgCost = recent7.reduce((s: number, r: any) => s + Number(r.cost || 0), 0) / recent7.length;

    const curve = buildResponseCurve(a, b, minCost, Math.round(avgCost), satPoint);

    // R²: 버킷 평균 기준으로 계산 (안정적인 신뢰도 지표)
    const rSquared   = calcRSquared(bucketed, a, b);
    const confidence = rSquared >= 0.7 ? 'high' : rSquared >= 0.4 ? 'medium' : 'low';

    // 실측 평균값 — Efficiency Map용
    const activeDays = cleaned.filter(d => d.applicant > 0);
    const actualAvgApplicant = activeDays.length
      ? activeDays.reduce((s, d) => s + (d.applicant || 0), 0) / activeDays.length
      : 0;
    const totalCost = cleaned.reduce((s, d) => s + (d.cost || 0), 0);
    const totalApplicant = cleaned.reduce((s, d) => s + (d.applicant || 0), 0);
    const actualAvgCpa = totalApplicant > 0 ? Math.round(totalCost / totalApplicant) : 0;

    // 포화도 분석
    const saturationAnalysis = buildSaturationAnalysis(cleaned, Math.round(avgCost), a, b, actualAvgCpa);

    return NextResponse.json({
      media: IS_PORTFOLIO ? maskChannel(media) : media,
      currentDailyBudget: Math.round(avgCost),
      responseCurve: curve,
      scatterData: cleaned,
      saturationPoint: satPoint,
      curveParams: { a, b },
      rSquared: Math.round(rSquared * 100) / 100,
      dataPoints: cleaned.length,
      rawDataPoints: dailyData.length,
      confidence,
      actualAvgCpa,
      actualAvgApplicant: Math.round(actualAvgApplicant),
      minCost: Math.round(minCost),
      maxCost: Math.round(maxCost),
      saturationAnalysis,
    });
  } catch (err: any) {
    console.error('[API /budget GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { channels, budgetDelta, mode } = await req.json() as {
      channels: string[];
      budgetDelta: number;  // 증감액 (양수=증가, 음수=감소)
      mode: BudgetMode;
    };

    // 포트폴리오 모드: 마스킹된 채널명 → 실제 채널명 역변환
    let realChannelList = channels;
    if (IS_PORTFOLIO) {
      const realChannels = await queryDistinctMedia();
      const revMap = buildReverseChannelMap(realChannels);
      realChannelList = channels.map(c => reverseChannel(c, revMap));
    }

    // 모든 채널 곡선 데이터 조회
    const channelModels = await Promise.all(
      realChannelList.map(async (media) => {
        const rawData = await queryBudgetResponseData(media);
        const dailyData = rawData.map((r: any) => ({
          cost: Number(r.cost) || 0,
          applicant: Number(r.applicant) || 0,
        })).filter((d: any) => d.cost > 0);

        const { a, b } = fitLogCurve(dailyData);
        const recent7 = rawData.slice(-7);
        const currentBudget = recent7.length > 0
          ? recent7.reduce((s: number, r: any) => s + Number(r.cost || 0), 0) / recent7.length
          : 0;

        const satPoint = SATURATION_POINTS[media] ?? null;
        const currentApplicant = predictApplicant(currentBudget, a, b);
        const currentCpa = currentBudget > 0 && currentApplicant > 0
          ? currentBudget / currentApplicant : 0;

        // 한계 수익 (현재 예산 +1만원당 추가 지원자)
        const marginalReturn = predictApplicant(currentBudget + 10000, a, b) - currentApplicant;

        return {
          media, a, b, currentBudget, currentApplicant, currentCpa,
          satPoint, marginalReturn,
        };
      })
    );

    const totalCurrentBudget = channelModels.reduce((s, c) => s + c.currentBudget, 0);
    const newTotal = totalCurrentBudget + budgetDelta;

    // 배분 계산
    let allocations: BudgetAllocation[] = [];

    if (mode === 'volume') {
      // 한계 수익 높은 채널 우선 배분 (Greedy)
      allocations = allocateGreedy(channelModels, newTotal, 'volume');
    } else if (mode === 'balanced') {
      // 현재 평균 CPA 유지하며 지원자 최대화
      const avgCpa = channelModels.reduce((s, c) => s + c.currentCpa, 0) / channelModels.length;
      allocations = allocateGreedy(channelModels, newTotal, 'balanced', avgCpa);
    } else {
      // 효율 중심: 비효율 채널 감액 우선
      allocations = allocateEfficiency(channelModels, newTotal);
    }

    const finalAllocations = IS_PORTFOLIO
      ? allocations.map(a => ({ ...a, media: maskChannel(a.media) }))
      : allocations;
    return NextResponse.json({ allocations: finalAllocations, totalBudget: newTotal });
  } catch (err: any) {
    console.error('[API /budget POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function allocateGreedy(
  models: any[],
  totalBudget: number,
  mode: 'volume' | 'balanced',
  cpaCap?: number
): BudgetAllocation[] {
  const budgets = models.map(m => m.currentBudget);
  const step = 10000;
  let remaining = totalBudget - budgets.reduce((s, b) => s + b, 0);

  const maxIter = Math.abs(remaining) / step + 1;
  let iter = 0;

  while (Math.abs(remaining) >= step && iter < maxIter) {
    iter++;
    if (remaining > 0) {
      // 추가 예산: 한계수익 최대 채널에 배분
      let bestIdx = -1, bestReturn = -Infinity;
      models.forEach((m, i) => {
        const b = budgets[i];
        if (m.satPoint && b >= m.satPoint * 1.5) return; // 포화 채널 제외
        const marginal = predictApplicant(b + step, m.a, m.b) - predictApplicant(b, m.a, m.b);
        if (mode === 'balanced' && cpaCap) {
          const newCpa = (b + step) / Math.max(predictApplicant(b + step, m.a, m.b), 0.001);
          if (newCpa > cpaCap * 1.2) return;
        }
        if (marginal > bestReturn) { bestReturn = marginal; bestIdx = i; }
      });
      if (bestIdx >= 0) { budgets[bestIdx] += step; remaining -= step; }
      else break;
    } else {
      // 감액: 한계수익 최소 채널 먼저 삭감
      let worstIdx = -1, worstReturn = Infinity;
      models.forEach((m, i) => {
        if (budgets[i] < step) return;
        const marginal = predictApplicant(budgets[i], m.a, m.b) - predictApplicant(budgets[i] - step, m.a, m.b);
        if (marginal < worstReturn) { worstReturn = marginal; worstIdx = i; }
      });
      if (worstIdx >= 0) { budgets[worstIdx] -= step; remaining += step; }
      else break;
    }
  }

  return models.map((m, i) => {
    const proposed = budgets[i];
    const projApplicant = predictApplicant(proposed, m.a, m.b);
    const projCpa = proposed > 0 && projApplicant > 0 ? proposed / projApplicant : 0;
    return {
      media: m.media,
      currentBudget: Math.round(m.currentBudget),
      proposedBudget: Math.round(proposed),
      currentApplicant: Math.round(m.currentApplicant),
      projectedApplicant: Math.round(projApplicant),
      currentCpa: Math.round(m.currentCpa),
      projectedCpa: Math.round(projCpa),
      action: proposed > m.currentBudget * 1.05 ? 'increase'
            : proposed < m.currentBudget * 0.95 ? 'decrease'
            : proposed < 1000 ? 'off'
            : 'maintain',
    };
  });
}

function allocateEfficiency(models: any[], totalBudget: number): BudgetAllocation[] {
  // CPA 기준 내림차순 정렬, 비효율 채널부터 감액
  const sorted = [...models].sort((a, b) => b.currentCpa - a.currentCpa);
  const budgets = Object.fromEntries(models.map(m => [m.media, m.currentBudget]));

  let remaining = totalBudget - Object.values(budgets).reduce((s: number, b: unknown) => s + (b as number), 0);
  const step = 10000;

  while (Math.abs(remaining) >= step) {
    if (remaining < 0) {
      // 가장 비효율 채널 감액
      const target = sorted.find(m => budgets[m.media] >= step);
      if (!target) break;
      budgets[target.media] -= step;
      remaining += step;
    } else {
      // 가장 효율적 채널 증액
      const target = [...sorted].reverse().find(m => !m.satPoint || budgets[m.media] < m.satPoint);
      if (!target) break;
      budgets[target.media] += step;
      remaining -= step;
    }
  }

  return models.map(m => {
    const proposed = budgets[m.media];
    const projApplicant = predictApplicant(proposed, m.a, m.b);
    const projCpa = proposed > 0 && projApplicant > 0 ? proposed / projApplicant : 0;
    return {
      media: m.media,
      currentBudget: Math.round(m.currentBudget),
      proposedBudget: Math.round(proposed),
      currentApplicant: Math.round(m.currentApplicant),
      projectedApplicant: Math.round(projApplicant),
      currentCpa: Math.round(m.currentCpa),
      projectedCpa: Math.round(projCpa),
      action: proposed > m.currentBudget * 1.05 ? 'increase'
            : proposed < m.currentBudget * 0.95 ? 'decrease'
            : proposed < 1000 ? 'off'
            : 'maintain',
    };
  });
}
