import type { ABTestStats } from '@/lib/types';

/**
 * A/B 테스트 통계 계산
 * CVR (applicant/click) 기반 비율 검정
 */
export function calcABStats(
  controlApplicant: number,
  controlClick: number,
  testApplicant: number,
  testClick: number
): ABTestStats {
  const MIN_SAMPLE = 100; // 최소 클릭 수

  // CVR
  const pControl = controlClick > 0 ? controlApplicant / controlClick : 0;
  const pTest    = testClick > 0    ? testApplicant / testClick       : 0;

  // Z-test (Two-proportion z-test)
  const n1 = controlClick;
  const n2 = testClick;
  const p1 = pControl;
  const p2 = pTest;

  // Pooled proportion
  const pPool = (controlApplicant + testApplicant) / (n1 + n2 || 1);

  // Standard error
  const se = Math.sqrt(pPool * (1 - pPool) * ((1 / (n1 || 1)) + (1 / (n2 || 1))));

  // Z-score
  const zScore = se > 0 ? (p2 - p1) / se : 0;

  // P-value (two-tailed, using normal distribution approximation)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

  // 95% 신뢰구간 (test CVR)
  const zCrit = 1.96;
  const seSingle = Math.sqrt((p2 * (1 - p2)) / (n2 || 1));
  const ciLow  = p2 - zCrit * seSingle;
  const ciHigh = p2 + zCrit * seSingle;

  // 베이지안 승률 (Beta distribution approximation)
  // P(test > control) using Beta(a,b) where a=applicant+1, b=click-applicant+1
  const bayesianWinProbability = calcBayesianWinProbability(
    controlApplicant, controlClick - controlApplicant,
    testApplicant,    testClick - testApplicant
  );

  // Lift
  const lift = pControl > 0 ? (p2 - p1) / p1 : 0;

  // 샘플 충분성 (각 그룹 최소 100 클릭)
  const sampleSufficient = n1 >= MIN_SAMPLE && n2 >= MIN_SAMPLE;

  return {
    pValue,
    significant: pValue < 0.05,
    confidenceInterval: [ciLow, ciHigh],
    bayesianWinProbability,
    sampleSufficient,
    lift,
    zScore,
  };
}

/** 표준 정규분포 CDF (Abramowitz & Stegun 근사) */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

/**
 * 베이지안 승률 — Monte Carlo 근사
 * Beta(a1, b1) vs Beta(a2, b2)
 * P(test > control) 계산
 */
function calcBayesianWinProbability(
  a1: number, b1: number,
  a2: number, b2: number,
  samples = 10000
): number {
  // Beta 분포 샘플링 (Johnk method)
  let testWins = 0;

  for (let i = 0; i < samples; i++) {
    const x1 = sampleBeta(Math.max(a1 + 1, 1), Math.max(b1 + 1, 1));
    const x2 = sampleBeta(Math.max(a2 + 1, 1), Math.max(b2 + 1, 1));
    if (x2 > x1) testWins++;
  }

  return testWins / samples;
}

/** Johnk's method for Beta distribution sampling */
function sampleBeta(alpha: number, beta: number): number {
  // Using relationship: Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))
  const g1 = sampleGamma(alpha);
  const g2 = sampleGamma(beta);
  return g1 / (g1 + g2 + 1e-10);
}

/** Marsaglia & Tsang method for Gamma sampling */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number, v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller normal random */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** 최소 샘플 사이즈 계산 (MDE 10%, 검정력 80%, α=0.05) */
export function calcMinSampleSize(baselineCVR: number, mde = 0.1): number {
  const p1 = baselineCVR;
  const p2 = baselineCVR * (1 + mde);
  const pBar = (p1 + p2) / 2;
  const zAlpha = 1.96;  // α = 0.05
  const zBeta  = 0.842; // power = 80%
  const n = ((zAlpha + zBeta) ** 2 * 2 * pBar * (1 - pBar)) / ((p2 - p1) ** 2);
  return Math.ceil(n);
}
