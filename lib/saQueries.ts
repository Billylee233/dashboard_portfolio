import { getBQClient } from './bigquery';

const SA_PROJECT = 'n8n-credential-483211';
const SA_DATASET = 'all_position_sa';
const SA_TABLE   = `\`${SA_PROJECT}.${SA_DATASET}.sa_merged_table\``;  // ← 변경

async function saQuery<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
  const bq = getBQClient();
  const options: any = { query: sql, useLegacySql: false };
  if (params) {
    options.params = params;
    const types: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined) types[k] = 'STRING';
    }
    if (Object.keys(types).length > 0) options.types = types;
  }
  const [rows] = await bq.query(options);
  return rows as T[];
}

const SA_METRICS_SQL = `
  SUM(IFNULL(imp, 0))       AS imp,
  SUM(IFNULL(click, 0))     AS click,
  SUM(IFNULL(cost, 0))      AS cost,
  SUM(IFNULL(applicant, 0)) AS applicant
`;

export interface SADateRange {
  start: string; // 'YYYY-MM-DD'
  end:   string;
}

export interface SAFilter {
  media?:    string[];   // 멀티셀렉트
  campaign?: string[];
  group?:    string[];
  keywords?: string[];   // 키워드 검색 태그
  kwMode?:   'contain' | 'exact' | 'exclude';  // 키워드 매칭 모드
  topN?:     number[];   // 1=Top1~10, 11=Top11~20, 21=Top21~30 (선택기간 APP 기준 랭킹)
}

// ─── WHERE 절 빌더 ─────────────────────────────────────────────────────────────
function buildWhere(range: SADateRange, filter: SAFilter, params: Record<string, any>): string {
  const clauses: string[] = [
    'date BETWEEN @saStart AND @saEnd',
    "job_position = 'H'",   // SA Detail은 H 직무만 표시
  ];
  params.saStart = range.start;
  params.saEnd   = range.end;

  if (filter.media?.length) {
    // BigQuery IN list — 파라미터 배열로 처리
    const placeholders = filter.media.map((_, i) => `@saMedia${i}`).join(', ');
    filter.media.forEach((m, i) => { params[`saMedia${i}`] = m; });
    clauses.push(`media IN (${placeholders})`);
  }

  if (filter.campaign?.length) {
    const placeholders = filter.campaign.map((_, i) => `@saCampaign${i}`).join(', ');
    filter.campaign.forEach((c, i) => { params[`saCampaign${i}`] = c; });
    clauses.push(`campaign IN (${placeholders})`);
  }

  if (filter.group?.length) {
    const placeholders = filter.group.map((_, i) => `@saGroup${i}`).join(', ');
    filter.group.forEach((g, i) => { params[`saGroup${i}`] = g; });
    clauses.push(`\`group\` IN (${placeholders})`);
  }

  if (filter.keywords?.length) {
    const mode = filter.kwMode ?? 'contain';
    if (mode === 'exact') {
      // 일치: keyword = kw1 OR keyword = kw2 ...
      const kwClauses = filter.keywords.map((kw, i) => {
        params[`saKw${i}`] = kw;
        return `keyword = @saKw${i}`;
      });
      clauses.push(`(${kwClauses.join(' OR ')})`);
    } else if (mode === 'exclude') {
      // 제외: keyword NOT LIKE kw1 AND keyword NOT LIKE kw2 ...
      const kwClauses = filter.keywords.map((kw, i) => {
        params[`saKw${i}`] = `%${kw}%`;
        return `keyword NOT LIKE @saKw${i}`;
      });
      clauses.push(`(${kwClauses.join(' AND ')})`);
    } else {
      // 포함 (기본): keyword LIKE kw1 OR keyword LIKE kw2 ...
      const kwClauses = filter.keywords.map((kw, i) => {
        params[`saKw${i}`] = `%${kw}%`;
        return `keyword LIKE @saKw${i}`;
      });
      clauses.push(`(${kwClauses.join(' OR ')})`);
    }
  }

  if (filter.topN?.length) {
    // Top N — 선택기간 APP 기준 랭킹으로 키워드 서브쿼리 필터
    // buildWhere 내부에서는 range가 선택기간이므로 동일 조건 재사용
    const topNRanges = filter.topN
      .map(n => `(rn BETWEEN ${n} AND ${n + 9})`)
      .join(' OR ');

    // 미디어/캠페인/그룹 필터를 서브쿼리에도 동일 적용
    const subClauses: string[] = [
      `date BETWEEN @saStart AND @saEnd`,
      `job_position = 'H'`,
      `keyword IS NOT NULL AND keyword != ''`,
    ];
    if (filter.media?.length)    subClauses.push(`media IN (${filter.media.map((_,i) => `@saMedia${i}`).join(',')})`);
    if (filter.campaign?.length) subClauses.push(`campaign IN (${filter.campaign.map((_,i) => `@saCampaign${i}`).join(',')})`);
    if (filter.group?.length)    subClauses.push(`\`group\` IN (${filter.group.map((_,i) => `@saGroup${i}`).join(',')})`);

    clauses.push(`keyword IN (
        SELECT keyword FROM (
          SELECT keyword,
            ROW_NUMBER() OVER (ORDER BY SUM(IFNULL(applicant,0)) DESC) AS rn
          FROM ${SA_TABLE}
          WHERE ${subClauses.join(' AND ')}
          GROUP BY keyword
        )
        WHERE ${topNRanges}
      )`);
  }

  return clauses.join('\n      AND ');
}

// ─── 1. 전체 KPI 집계 (Period Summary) ────────────────────────────────────────
export async function querySAPeriodSummary(range: SADateRange, filter: SAFilter) {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT ${SA_METRICS_SQL}
    FROM ${SA_TABLE}
    WHERE ${where}
  `;
  return saQuery(sql, params);
}

// ─── 2. 일자별 실적 (Daily Performance / TrendChart) ──────────────────────────
export async function querySADailyMetrics(range: SADateRange, filter: SAFilter) {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT
      CAST(\`date\` AS STRING) AS date,
      ${SA_METRICS_SQL}
    FROM ${SA_TABLE}
    WHERE ${where}
    GROUP BY \`date\`
    ORDER BY \`date\`
  `;
  return saQuery(sql, params);
}

// ─── 3. 주간 집계 ─────────────────────────────────────────────────────────────
export async function querySAWeeklyMetrics(range: SADateRange, filter: SAFilter) {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT
      CAST(\`week\` AS STRING) AS week,
      MIN(CAST(\`date\` AS STRING)) AS week_start,
      MAX(CAST(\`date\` AS STRING)) AS week_end,
      ${SA_METRICS_SQL}
    FROM ${SA_TABLE}
    WHERE ${where}
    GROUP BY \`week\`
    ORDER BY \`week\`
  `;
  return saQuery(sql, params);
}

// ─── 4. 월간 집계 ─────────────────────────────────────────────────────────────
export async function querySAMonthlyMetrics(range: SADateRange, filter: SAFilter) {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT
      CAST(\`month\` AS STRING) AS month,
      ${SA_METRICS_SQL}
    FROM ${SA_TABLE}
    WHERE ${where}
    GROUP BY \`month\`
    ORDER BY \`month\`
  `;
  return saQuery(sql, params);
}

// ─── 5. 키워드별 집계 (Keyword Leaderboard) ───────────────────────────────────
export async function querySAKeywordMetrics(range: SADateRange, filter: SAFilter) {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT
      keyword,
      ${SA_METRICS_SQL}
    FROM ${SA_TABLE}
    WHERE ${where}
      AND keyword IS NOT NULL
      AND keyword != ''
    GROUP BY keyword
    ORDER BY applicant DESC
  `;
  return saQuery(sql, params);
}

// ─── 6. 필터 옵션 조회 ────────────────────────────────────────────────────────

/** 매체 목록 */
export async function querySADistinctMedia(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT media
    FROM ${SA_TABLE}
    WHERE media IS NOT NULL AND media != ''
    ORDER BY media
  `;
  const rows = await saQuery<{ media: string }>(sql);
  return rows.map(r => r.media);
}

/** 캠페인 목록 (매체 기준 필터) */
export async function querySADistinctCampaigns(media?: string[]): Promise<string[]> {
  const params: Record<string, any> = {};
  let mediaClause = '';
  if (media?.length) {
    const placeholders = media.map((_, i) => `@saFilterMedia${i}`).join(', ');
    media.forEach((m, i) => { params[`saFilterMedia${i}`] = m; });
    mediaClause = `AND media IN (${placeholders})`;
  }
  const sql = `
    SELECT DISTINCT campaign
    FROM ${SA_TABLE}
    WHERE campaign IS NOT NULL AND campaign != ''
    ${mediaClause}
    ORDER BY campaign
  `;
  const rows = await saQuery<{ campaign: string }>(sql, params);
  return rows.map(r => r.campaign);
}

/** 그룹 목록 (캠페인 기준 필터) */
export async function querySADistinctGroups(campaign?: string[]): Promise<string[]> {
  const params: Record<string, any> = {};
  let campaignClause = '';
  if (campaign?.length) {
    const placeholders = campaign.map((_, i) => `@saFilterCampaign${i}`).join(', ');
    campaign.forEach((c, i) => { params[`saFilterCampaign${i}`] = c; });
    campaignClause = `AND campaign IN (${placeholders})`;
  }
  const sql = `
    SELECT DISTINCT \`group\`
    FROM ${SA_TABLE}
    WHERE \`group\` IS NOT NULL AND \`group\` != ''
    ${campaignClause}
    ORDER BY \`group\`
  `;
  const rows = await saQuery<{ group: string }>(sql, params);
  return rows.map(r => r.group);
}

/** 키워드 자동완성 (검색어 기준) */
export async function querySAKeywordSuggestions(q: string, limit = 20): Promise<string[]> {
  const params: Record<string, any> = { saQ: `%${q}%` };
  const sql = `
    SELECT DISTINCT keyword
    FROM ${SA_TABLE}
    WHERE keyword LIKE @saQ
      AND keyword IS NOT NULL AND keyword != ''
    ORDER BY keyword
    LIMIT ${limit}
  `;
  const rows = await saQuery<{ keyword: string }>(sql, params);
  return rows.map(r => r.keyword);
}

// ─── 7. 기간 비교용 (선택 + 비교 동시 조회) ───────────────────────────────────
export async function querySAKeywordComparison(
  selRange: SADateRange,
  cmpRange: SADateRange,
  filter: SAFilter
) {
  const selParams: Record<string, any> = {};
  const cmpParams: Record<string, any> = {};

  // 선택 기간 WHERE
  const selWhere = buildWhere(selRange, filter, selParams);
  // 비교 기간 WHERE — param 이름 충돌 방지를 위해 접두사 교체
  const cmpParamsRaw: Record<string, any> = {};
  const cmpWhereRaw = buildWhere(cmpRange, filter, cmpParamsRaw);
  // cmp 파라미터 이름에 'Cmp' 접두사 추가
  const cmpWhereFixed = cmpWhereRaw.replace(/@sa/g, '@saCmp');
  Object.entries(cmpParamsRaw).forEach(([k, v]) => {
    cmpParams[k.replace('sa', 'saCmp')] = v;
  });

  const allParams = { ...selParams, ...cmpParams };

  // Top N 필터 — 선택기간 APP 기준 랭킹으로 슬라이싱
  const topNFilter = filter.topN?.length
    ? filter.topN.map(n => `(ranked.rn BETWEEN ${n} AND ${n + 9})`).join(' OR ')
    : null;

  const sql = `
    WITH sel AS (
      SELECT
        keyword,
        ${SA_METRICS_SQL}
      FROM ${SA_TABLE}
      WHERE ${selWhere}
        AND keyword IS NOT NULL AND keyword != ''
      GROUP BY keyword
    ),
    cmp AS (
      SELECT
        keyword,
        ${SA_METRICS_SQL}
      FROM ${SA_TABLE}
      WHERE ${cmpWhereFixed}
        AND keyword IS NOT NULL AND keyword != ''
      GROUP BY keyword
    ),
    ranked AS (
      SELECT
        COALESCE(sel.keyword, cmp.keyword) AS keyword,
        IFNULL(sel.imp, 0)       AS sel_imp,
        IFNULL(sel.click, 0)     AS sel_click,
        IFNULL(sel.cost, 0)      AS sel_cost,
        IFNULL(sel.applicant, 0) AS sel_applicant,
        IFNULL(cmp.imp, 0)       AS cmp_imp,
        IFNULL(cmp.click, 0)     AS cmp_click,
        IFNULL(cmp.cost, 0)      AS cmp_cost,
        IFNULL(cmp.applicant, 0) AS cmp_applicant,
        ROW_NUMBER() OVER (ORDER BY IFNULL(sel.applicant, 0) DESC) AS rn
      FROM sel
      FULL OUTER JOIN cmp USING (keyword)
    )
    SELECT * EXCEPT(rn)
    FROM ranked
    ${topNFilter ? `WHERE (${topNFilter})` : 'WHERE rn <= 50'}
    ORDER BY sel_applicant DESC
  `;
  return saQuery(sql, allParams);
}

// ─── 8. 키워드별 대표 캠페인/그룹 (APP 기준 Top 1) ──────────────────────────
export async function querySAKeywordCampaignGroup(
  range: SADateRange,
  filter: SAFilter
): Promise<{ keyword: string; campaign: string; group: string }[]> {
  const params: Record<string, any> = {};
  const where = buildWhere(range, filter, params);
  const sql = `
    SELECT keyword, campaign, \`group\`
    FROM (
      SELECT
        keyword, campaign, \`group\`,
        ROW_NUMBER() OVER (
          PARTITION BY keyword
          ORDER BY SUM(IFNULL(applicant, 0)) DESC
        ) AS rn
      FROM ${SA_TABLE}
      WHERE ${where}
        AND keyword IS NOT NULL AND keyword != ''
      GROUP BY keyword, campaign, \`group\`
    )
    WHERE rn = 1
  `;
  const rows = await saQuery<{ keyword: string; campaign: string; group: string }>(sql, params);
  return rows;
}
