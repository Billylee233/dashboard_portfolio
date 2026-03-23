// ─── Raw BigQuery Row ───────────────────────────────────────────────
export interface RawRow {
  month: string | null;
  media: string | null;
  date: string;           // DATE → string 'YYYY-MM-DD'
  campaign: string | null;
  group: string | null;
  ad: string | null;      // 소재 계층
  imp: number | null;
  click: number | null;
  cost: number | null;
  applicant: number | null;
  lptag: string | null;
  region: string | null;
  image_code: string | null;
  text_code: string | null;
  image_content: string | null;
  text_content: string | null;
  type: string | null;
  category: string | null;
  week: number | null;
}

// ─── Derived / Computed Row ──────────────────────────────────────────
export interface MetricsRow {
  imp: number;
  click: number;
  cost: number;
  applicant: number;
  ctr: number;    // click/imp — % 소수 그대로 (×100 없음)
  cvr: number;    // applicant/click — % 소수 그대로
  cpc: number;    // cost/click
  cpa: number;    // cost/applicant
}

// ─── Aggregated Channel Row ──────────────────────────────────────────
export interface ChannelMetrics extends MetricsRow {
  media: string;
}

export interface CampaignMetrics extends MetricsRow {
  media: string;
  campaign: string;
}

export interface GroupMetrics extends MetricsRow {
  media: string;
  campaign: string;
  group: string;
}

export interface AdMetrics extends MetricsRow {
  media: string;
  campaign: string;
  group: string;
  ad: string;
  image_code?: string;
  text_code?: string;
  image_content?: string;
  text_content?: string;
}

// ─── Daily Row ───────────────────────────────────────────────────────
export interface DailyMetrics extends MetricsRow {
  date: string;
  media?: string;
}

// ─── Delta Comparison ────────────────────────────────────────────────
export interface ComparisonRow {
  key: string;             // media | campaign | group | ad
  selected: MetricsRow;
  compared: MetricsRow;
  delta: MetricsRow;
  deltaPercent: MetricsRow;
}

// ─── Date Range ──────────────────────────────────────────────────────
export interface DateRange {
  start: string;   // 'YYYY-MM-DD'
  end: string;
}

// ─── AI Diagnosis ────────────────────────────────────────────────────
export type DiagnosisStatus = '우수' | '보통' | '주의';

export interface AIDiagnosis {
  media: string;
  diagnosed_at: string;
  valid_until: string;
  status: DiagnosisStatus;
  summary: string;
  cause: string | null;
  action: string | null;
  created_at: string;
}

// ─── Alert / Crisis ──────────────────────────────────────────────────
export interface CrisisAlert {
  media: string;
  d1VsPrevWeek: {
    applicant: number;   // delta%
    click: number;
    cvr: number;
    cpa: number;
    cpc: number;
    isAlert: boolean;
  };
  recent3VsPrev3: {
    applicant: number;
    click: number;
    cvr: number;
    cpa: number;
    cpc: number;
    isAlert: boolean;
  };
  recent7VsPrev7: {
    applicant: number;
    click: number;
    cvr: number;
    cpa: number;
    cpc: number;
    isAlert: boolean;
  };
  isCrisis: boolean;   // AND of both conditions
}

// ─── Scatter / Bubble ────────────────────────────────────────────────
export interface BubblePoint {
  id: string;         // media | campaign | group | ad
  label: string;
  cpa: number;
  cvr: number;
  applicant: number;
  trend: 'improving' | 'stable' | 'worsening';   // vs prev same period
  trendPct: number;   // CPA change %
}

// ─── Budget Planner ──────────────────────────────────────────────────
export type BudgetMode = 'volume' | 'balanced' | 'efficiency';

export interface ChannelBudgetModel {
  media: string;
  currentDailyBudget: number;
  responseCurve: ResponseCurvePoint[];
  saturationPoint: number | null;   // e.g. TikTok 500000
}

export interface ResponseCurvePoint {
  cost: number;
  applicant: number;
  cpa: number;
  cvr: number;
}

export interface BudgetAllocation {
  media: string;
  currentBudget: number;
  proposedBudget: number;
  currentApplicant: number;
  projectedApplicant: number;
  currentCpa: number;
  projectedCpa: number;
  action: 'increase' | 'decrease' | 'off' | 'maintain';
}

// ─── Forecast ────────────────────────────────────────────────────────
export interface WeekForecast {
  weekLabel: string;    // '2025 W14'
  startDate: string;
  endDate: string;
  applicant: number;
  applicantLow: number;
  applicantHigh: number;
  cpa: number;
  cvr: number;
  days: DayForecast[];
}

export interface DayForecast {
  date: string;
  dayOfWeek: string;
  applicant: number;
  applicantLow: number;
  applicantHigh: number;
  cpa: number;
  isHoliday: boolean;
}

// ─── A/B Test ────────────────────────────────────────────────────────
export interface ABTestRow {
  id: string;
  label: string;          // 행 이름 (사용자 입력)
  group: 'control' | 'test';
  media?: string;
  campaign?: string;
  ad_group?: string;
  ad?: string;
  dateRange: DateRange;
  metrics?: MetricsRow;
}

export interface ABTest {
  test_id: string;
  test_name: string;
  description: string;
  test_rows: ABTestRow[];
  ai_comment: string | null;
  created_at: string;
  updated_at: string;
  stats?: ABTestStats;
}

export interface ABTestStats {
  pValue: number;
  significant: boolean;         // p < 0.05
  confidenceInterval: [number, number];
  bayesianWinProbability: number;   // 0~1
  sampleSufficient: boolean;
  lift: number;                 // %
  zScore: number;
}

// ─── Insights ────────────────────────────────────────────────────────
export interface InsightItem {
  rank: number;
  image_code: string | null;
  text_code: string | null;
  image_content: string | null;
  text_content: string | null;
  score: number;
  metrics: MetricsRow;
}
// ─────────────────────────────────────────────────────────────────────────────
// SA Detail 전용 타입 (lib/types.ts 파일 맨 끝에 append)
// ─────────────────────────────────────────────────────────────────────────────

// ─── SA Raw Row (sa_all_merged VIEW) ─────────────────────────────────────────
export interface SARawRow {
  campaign_kr:   string | null;
  group:         string | null;
  keyword:       string | null;
  imp:           number | null;
  click:         number | null;
  cost:          number | null;
  date:          string;          // 'YYYY-MM-DD'
  campaign:      string | null;
  media:         string | null;
  job_position:  string | null;
  device:        string | null;
  campaign_type: string | null;
  merge:         string | null;
  month:         number | null;
  week:          number | null;
  applicant:     number | null;
  rank:          number | null;   // 추후 실제 데이터로 대체
}

// ─── SA Keyword Metrics ───────────────────────────────────────────────────────
export interface SAKeywordMetrics {
  keyword:      string;
  selected:     MetricsRow;
  compared:     MetricsRow;
  delta:        MetricsRow;
  deltaPercent: MetricsRow;
}

// ─── SA Period Summary ────────────────────────────────────────────────────────
export interface SAPeriodSummary {
  selected:     MetricsRow;
  compared:     MetricsRow;
  delta:        MetricsRow;
  deltaPercent: MetricsRow;
}

// ─── SA Daily / Weekly / Monthly ─────────────────────────────────────────────
export interface SADailyRow extends MetricsRow {
  date: string;
}

export interface SAWeeklyRow extends MetricsRow {
  week:       string;
  week_start: string;
  week_end:   string;
}

export interface SAMonthlyRow extends MetricsRow {
  month: string;
}

// ─── SA Keyword Movement (상승/하락) ─────────────────────────────────────────
export interface SAKeywordMovement {
  keyword:      string;
  deltaApp:     number;       // Δ applicant (절대값)
  deltaAppPct:  number;       // Δ% applicant
  cause:        string;       // 'CTR↑' | 'CVR↓' | 'IMP↑' | 'CPC↑' | '-'
  selected:     MetricsRow;
  compared:     MetricsRow;
}

// ─── SA Action Classification ─────────────────────────────────────────────────
export type SAActionLabel =
  | '최상위 유지'
  | '단가 UP'
  | '현상 유지'
  | '단가 DOWN'
  | '검토 필요'
  | 'OFF 권고';

export interface SAActionKeyword {
  keyword:     string;
  label:       SAActionLabel;
  selected:    MetricsRow;
  avgCpa:      number;    // 그룹 평균 CPA
  avgCvr:      number;    // 그룹 평균 CVR
  dailyAvgApp: number;    // 일평균 applicant
}

// ─── SA Action Criteria (기준 설정 모달) ─────────────────────────────────────
export interface SAActionCriteria {
  topKeep: {
    minDailyApp: number;
    minCvrRatio: number;    // 그룹평균 대비 배수 (e.g. 1.3)
    maxCpaRatio: number;    // 그룹평균 대비 배수 (e.g. 0.7)
  };
  bidUp: {
    minDailyApp: number;
    minCvrRatio: number;
    maxCpaRatio: number;
  };
  maintain: {
    minDailyApp:    number;
    cvrRatioMin:    number;
    cvrRatioMax:    number;
    cpaRatioMin:    number;
    cpaRatioMax:    number;
  };
  bidDown: {
    minDailyApp:    number;
    maxCvrRatio:    number;
    minCpaRatio:    number;
  };
  review: {
    maxDailyApp:    number;
  };
  off: {
    maxDailyApp:    number;
    maxCvrRatio:    number;
    minCpaRatio:    number;
  };
}

// ─── SA Filter State ──────────────────────────────────────────────────────────
export interface SAFilterState {
  media:    string[];
  campaign: string[];
  group:    string[];
  keywords: string[];
  topN:     number[];   // 선택된 TopN 그룹: 1(=1~10) | 11(=11~20) | 21(=21~30)
}

// ─── SA API Response ──────────────────────────────────────────────────────────
export interface SADetailResponse {
  selRange:      { start: string; end: string };
  cmpRange:      { start: string; end: string };
  filter:        SAFilterState;
  periodSummary: SAPeriodSummary;
  daily:         SADailyRow[];
  weekly:        SAWeeklyRow[];
  monthly:       SAMonthlyRow[];
  keywords:      SAKeywordMetrics[];
}

