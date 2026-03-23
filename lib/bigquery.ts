import { BigQuery } from '@google-cloud/bigquery';
import type { DateRange, RawRow } from './types';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;
const TABLE   = `${PROJECT}.${DATASET}.all_marketing_data_partitioned`;
const AI_DIAG = `${PROJECT}.${DATASET}.ai_diagnosis`;
const AB_TEST = `${PROJECT}.${DATASET}.ab_tests`;

let _client: BigQuery | null = null;

export function getBQClient(): BigQuery {
  if (_client) return _client;
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credJson) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not set');
  const credentials = JSON.parse(credJson);
  _client = new BigQuery({
    projectId: PROJECT,
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
  return _client;
}

async function query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
  const bq = getBQClient();
  const options: any = { query: sql, useLegacySql: false };
  if (params) {
    options.params = params;
    // BigQuery requires explicit type info for null values
    const types: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined) {
        types[k] = 'STRING';
      }
    }
    if (Object.keys(types).length > 0) options.types = types;
  }
  const [rows] = await bq.query(options);
  return rows as T[];
}

const METRICS_SQL = `
  SUM(IFNULL(imp, 0))       AS imp,
  SUM(IFNULL(click, 0))     AS click,
  SUM(IFNULL(cost, 0))      AS cost,
  SUM(IFNULL(applicant, 0)) AS applicant
`;

export async function queryD1Summary() {
  const sql = `SELECT ${METRICS_SQL} FROM \`${TABLE}\` WHERE date = DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)`;
  return query(sql);
}

export async function queryDailyMetrics(range: DateRange, media?: string) {
  const sql = `
    SELECT CAST(date AS STRING) AS date, ${media ? "media," : ""} ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end ${media ? "AND media = @media" : ""}
    GROUP BY date ${media ? ", media" : ""}
    ORDER BY date
  `;
  const params: any = { start: range.start, end: range.end };
  if (media) params.media = media;
  return query(sql, params);
}

export async function queryChannelMetrics(range: DateRange) {
  const sql = `
    SELECT media, ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end
    GROUP BY media
    ORDER BY applicant DESC
  `;
  return query(sql, { start: range.start, end: range.end });
}

export async function queryApplicantTrend(range: DateRange, media?: string) {
  const sql = `
    SELECT CAST(date AS STRING) AS date,
      SUM(IFNULL(imp,0)) AS imp,
      SUM(IFNULL(click,0)) AS click,
      SUM(IFNULL(cost,0)) AS cost,
      SUM(IFNULL(applicant,0)) AS applicant
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end ${media ? "AND media = @media" : ""}
    GROUP BY date ORDER BY date
  `;
  const params: any = { start: range.start, end: range.end };
  if (media) params.media = media;
  return query(sql, params);
}

export async function queryChannelComparison(selected: DateRange, compared: DateRange) {
  const sql = `
    WITH sel AS (SELECT media, ${METRICS_SQL} FROM \`${TABLE}\` WHERE date BETWEEN @selStart AND @selEnd GROUP BY media),
    cmp AS (SELECT media, ${METRICS_SQL} FROM \`${TABLE}\` WHERE date BETWEEN @cmpStart AND @cmpEnd GROUP BY media)
    SELECT COALESCE(sel.media, cmp.media) AS media,
      IFNULL(sel.imp,0) AS sel_imp, IFNULL(sel.click,0) AS sel_click,
      IFNULL(sel.cost,0) AS sel_cost, IFNULL(sel.applicant,0) AS sel_applicant,
      IFNULL(cmp.imp,0) AS cmp_imp, IFNULL(cmp.click,0) AS cmp_click,
      IFNULL(cmp.cost,0) AS cmp_cost, IFNULL(cmp.applicant,0) AS cmp_applicant
    FROM sel FULL OUTER JOIN cmp USING (media)
    ORDER BY sel_applicant DESC
  `;
  return query(sql, { selStart: selected.start, selEnd: selected.end, cmpStart: compared.start, cmpEnd: compared.end });
}

export async function queryCrisisData(latestDate?: string) {
  // latestDate를 전역 기준으로 사용 (채널별 max_date 대신)
  // latestDate 없으면 전역 MAX로 폴백
  const latestExpr = latestDate ? `DATE('${latestDate}')` : `(SELECT MAX(date) FROM \`${TABLE}\`)`;
  const sql = `
    WITH
    -- 전역 latestDate 기준 (모든 채널 동일 날짜 기준 비교)
    d1 AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date = ${latestExpr}
        AND IFNULL(imp, 0) > 0
      GROUP BY media
    ),
    d1_prev AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date = DATE_SUB(${latestExpr}, INTERVAL 7 DAY)
      GROUP BY media
    ),
    r3 AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date BETWEEN DATE_SUB(${latestExpr}, INTERVAL 2 DAY) AND ${latestExpr}
      GROUP BY media
    ),
    r3_prev AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date BETWEEN DATE_SUB(${latestExpr}, INTERVAL 9 DAY) AND DATE_SUB(${latestExpr}, INTERVAL 7 DAY)
      GROUP BY media
    ),
    r7 AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date BETWEEN DATE_SUB(${latestExpr}, INTERVAL 6 DAY) AND ${latestExpr}
      GROUP BY media
    ),
    r7_prev AS (
      SELECT media, ${METRICS_SQL}
      FROM \`${TABLE}\`
      WHERE date BETWEEN DATE_SUB(${latestExpr}, INTERVAL 13 DAY) AND DATE_SUB(${latestExpr}, INTERVAL 7 DAY)
      GROUP BY media
    )
    SELECT d1.media,
      d1.imp AS d1_imp, d1.click AS d1_click, d1.cost AS d1_cost, d1.applicant AS d1_app,
      IFNULL(d1_prev.imp,0) AS d1p_imp, IFNULL(d1_prev.click,0) AS d1p_click, IFNULL(d1_prev.cost,0) AS d1p_cost, IFNULL(d1_prev.applicant,0) AS d1p_app,
      IFNULL(r3.imp,0) AS r3_imp, IFNULL(r3.click,0) AS r3_click, IFNULL(r3.cost,0) AS r3_cost, IFNULL(r3.applicant,0) AS r3_app,
      IFNULL(r3_prev.imp,0) AS r3p_imp, IFNULL(r3_prev.click,0) AS r3p_click, IFNULL(r3_prev.cost,0) AS r3p_cost, IFNULL(r3_prev.applicant,0) AS r3p_app,
      IFNULL(r7.imp,0) AS r7_imp, IFNULL(r7.click,0) AS r7_click, IFNULL(r7.cost,0) AS r7_cost, IFNULL(r7.applicant,0) AS r7_app,
      IFNULL(r7_prev.imp,0) AS r7p_imp, IFNULL(r7_prev.click,0) AS r7p_click, IFNULL(r7_prev.cost,0) AS r7p_cost, IFNULL(r7_prev.applicant,0) AS r7p_app
    FROM d1
    LEFT JOIN d1_prev USING (media) LEFT JOIN r3 USING (media) LEFT JOIN r3_prev USING (media)
    LEFT JOIN r7 USING (media) LEFT JOIN r7_prev USING (media)
    ORDER BY d1.applicant DESC
  `;
  return query(sql);
}

export async function queryCampaignMetrics(range: DateRange, media: string) {
  const sql = `SELECT campaign, ${METRICS_SQL} FROM \`${TABLE}\` WHERE date BETWEEN @start AND @end AND media = @media GROUP BY campaign ORDER BY applicant DESC`;
  return query(sql, { start: range.start, end: range.end, media });
}

export async function queryGroupMetrics(range: DateRange, media: string, campaign?: string) {
  const sql = `
    SELECT campaign, \`group\`, ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end AND media = @media ${campaign ? "AND campaign = @campaign" : ""}
    GROUP BY campaign, \`group\` ORDER BY applicant DESC
  `;
  const params: any = { start: range.start, end: range.end, media };
  if (campaign) params.campaign = campaign;
  return query(sql, params);
}

export async function queryAdMetrics(range: DateRange, media: string, campaign?: string) {
  const sql = `
    SELECT campaign, \`group\`, ad, MAX(image_code) AS image_code, MAX(text_code) AS text_code,
      MAX(image_content) AS image_content, MAX(text_content) AS text_content, ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end AND media = @media ${campaign ? "AND campaign = @campaign" : ""}
    GROUP BY campaign, \`group\`, ad ORDER BY applicant DESC
  `;
  const params: any = { start: range.start, end: range.end, media };
  if (campaign) params.campaign = campaign;
  return query(sql, params);
}

export async function queryHierarchyDailyMetrics(range: DateRange, media: string) {
  const sql = `
    SELECT CAST(date AS STRING) AS date, campaign, \`group\`, ad, ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE date BETWEEN @start AND @end AND media = @media
    GROUP BY date, campaign, \`group\`, ad ORDER BY date, applicant DESC
  `;
  return query(sql, { start: range.start, end: range.end, media });
}

export async function queryAIDiagnosisInput(media: string) {
  const sql = `
    SELECT CAST(date AS STRING) AS date,
      ROUND(SUM(IFNULL(applicant,0)),1) AS applicant,
      ROUND(SUM(IFNULL(cost,0)),0) AS cost,
      ROUND(SUM(IFNULL(click,0)),0) AS click,
      ROUND(SAFE_DIVIDE(SUM(IFNULL(cost,0)),SUM(IFNULL(applicant,0))),0) AS cpa,
      ROUND(SAFE_DIVIDE(SUM(IFNULL(applicant,0)),SUM(IFNULL(click,0))),4) AS cvr
    FROM \`${TABLE}\`
    WHERE date BETWEEN DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 14 DAY)
                   AND DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
      AND media = @media
    GROUP BY date ORDER BY date
  `;
  return query(sql, { media });
}

export async function getAIDiagnosis(media: string) {
  const sql = `SELECT * FROM \`${AI_DIAG}\` WHERE media = @media AND valid_until > CURRENT_TIMESTAMP() ORDER BY diagnosed_at DESC LIMIT 1`;
  const rows = await query(sql, { media });
  return rows[0] ?? null;
}

export async function saveAIDiagnosis(data: { media: string; status: string; summary: string; cause: string | null; action: string | null; }) {
  const sql = `
    INSERT INTO \`${AI_DIAG}\` (media, diagnosed_at, valid_until, status, summary, cause, action, created_at)
    VALUES (@media, CURRENT_TIMESTAMP(),
      TIMESTAMP_ADD(TIMESTAMP_TRUNC(TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), HOUR), INTERVAL EXTRACT(HOUR FROM CURRENT_TIMESTAMP()) HOUR),
      @status, @summary, @cause, @action, CURRENT_TIMESTAMP())
  `;
  await query(sql, data);
}

export async function getABTests() {
  return query(`SELECT * FROM \`${AB_TEST}\` ORDER BY created_at DESC`);
}

export async function saveABTest(data: { test_id: string; test_name: string; description: string; test_date_start?: string|null; test_date_end?: string|null; test_rows: string; ai_comment: string | null; job_type?: string|null; }) {
  const sql = `INSERT INTO \`${AB_TEST}\` (test_id, test_name, description, test_date_start, test_date_end, test_rows, ai_comment, job_type, created_at, updated_at) VALUES (@test_id, @test_name, @description, @test_date_start, @test_date_end, PARSE_JSON(@test_rows), @ai_comment, @job_type, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`;
  await query(sql, { ...data, job_type: data.job_type ?? null });
}

export async function updateABTest(test_id: string, updates: { ai_comment?: string; test_rows?: string; test_name?: string; description?: string; test_date_start?: string|null; test_date_end?: string|null; job_type?: string|null; }) {
  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP()'];
  const params: any = { test_id };
  if (updates.ai_comment  !== undefined) { sets.push('ai_comment = @ai_comment');   params.ai_comment  = updates.ai_comment; }
  if (updates.test_rows   !== undefined) { sets.push('test_rows = PARSE_JSON(@test_rows)'); params.test_rows = updates.test_rows; }
  if (updates.test_name   !== undefined) { sets.push('test_name = @test_name');     params.test_name   = updates.test_name; }
  if (updates.description      !== undefined) { sets.push('description = @description');           params.description      = updates.description; }
  if (updates.test_date_start  !== undefined) { sets.push('test_date_start = @test_date_start');   params.test_date_start  = updates.test_date_start; }
  if (updates.test_date_end    !== undefined) { sets.push('test_date_end = @test_date_end');       params.test_date_end    = updates.test_date_end; }
  if (updates.job_type         !== undefined) { sets.push('job_type = @job_type');                 params.job_type         = updates.job_type; }
  await query(`UPDATE \`${AB_TEST}\` SET ${sets.join(', ')} WHERE test_id = @test_id`, params);
}

export async function deleteABTest(test_id: string) {
  await query(`DELETE FROM \`${AB_TEST}\` WHERE test_id = @test_id`, { test_id });
}

export async function queryInsights(range: DateRange, media?: string) {
  const sql = `
    WITH daily AS (
      SELECT image_code, text_code,
        MAX(image_content) AS image_content,
        MAX(text_content)  AS text_content,
        ${METRICS_SQL},
        COUNT(DISTINCT date) AS day_count,
        -- 일자별 imp가 1 이하인 날만 있는 소재 제외
        SUM(CASE WHEN imp <= 1 THEN 1 ELSE 0 END) AS low_imp_days
      FROM \`${TABLE}\`
      WHERE date BETWEEN @start AND @end
        ${media ? 'AND media = @media' : ''}
        AND (image_code IS NOT NULL OR text_code IS NOT NULL)
        -- error / Unknown / - / 임시 소재 제외
        AND COALESCE(image_code, '') NOT IN ('error', 'Unknown', '-', '')
        AND COALESCE(text_code,  '') NOT IN ('error', 'Unknown', '-', '')
        AND COALESCE(image_content, '') NOT LIKE '%임시%'
        AND COALESCE(text_content,  '') NOT LIKE '%임시%'
      GROUP BY image_code, text_code
    )
    SELECT * FROM daily
    WHERE low_imp_days < day_count  -- 모든 날이 imp<=1인 소재 제외
    ORDER BY applicant DESC
  `;
  const params: any = { start: range.start, end: range.end };
  if (media) params.media = media;
  return query(sql, params);
}

export async function queryBudgetResponseData(media: string, days: number = 90) {
  const sql = `
    SELECT CAST(date AS STRING) AS date, SUM(IFNULL(cost,0)) AS cost, SUM(IFNULL(applicant,0)) AS applicant, SUM(IFNULL(click,0)) AS click
    FROM \`${TABLE}\`
    WHERE media = @media
      AND date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL ${days} DAY)
    GROUP BY date ORDER BY date
  `;
  return query(sql, { media });
}

export async function querySeasonalityData() {
  const sql = `
    SELECT CAST(EXTRACT(MONTH FROM date) AS INT64) AS month, CAST(EXTRACT(DAYOFWEEK FROM date) AS INT64) AS dow,
      CAST(EXTRACT(WEEK FROM date) AS INT64) AS week_num, AVG(IFNULL(applicant,0)) AS avg_applicant, AVG(IFNULL(cost,0)) AS avg_cost
    FROM \`${TABLE}\` WHERE date >= '2025-01-01'
    GROUP BY month, dow, week_num ORDER BY month, dow
  `;
  return query(sql);
}

export async function queryRecentTrend() {
  const sql = `
    SELECT CAST(date AS STRING) AS date, SUM(IFNULL(applicant,0)) AS applicant, SUM(IFNULL(cost,0)) AS cost
    FROM \`${TABLE}\`
    WHERE date BETWEEN DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
    GROUP BY date ORDER BY date
  `;
  return query(sql);
}

export async function queryDistinctMedia(): Promise<string[]> {
  const rows = await query<{ media: string }>(`SELECT DISTINCT media FROM \`${TABLE}\` WHERE media IS NOT NULL ORDER BY media`);
  return rows.map(r => r.media);
}

// 선택/비교 기간 중 하나라도 IMP > 0인 채널 반환 (UNION)
export async function queryActiveChannels(
  selStart: string, selEnd: string,
  cmpStart: string, cmpEnd: string,
): Promise<string[]> {
  const sql = `
    SELECT media
    FROM \`${TABLE}\`
    WHERE media IS NOT NULL
      AND date BETWEEN @selStart AND @selEnd
    GROUP BY media
    HAVING SUM(imp) > 0
    UNION DISTINCT
    SELECT media
    FROM \`${TABLE}\`
    WHERE media IS NOT NULL
      AND date BETWEEN @cmpStart AND @cmpEnd
    GROUP BY media
    HAVING SUM(imp) > 0
    ORDER BY media
  `;
  const rows = await query<{ media: string }>(sql, { selStart, selEnd, cmpStart, cmpEnd });
  return rows.map(r => r.media);
}

export async function queryAdPerformance(range: DateRange, media: string, campaign: string, group: string, ad: string) {
  const conditions: string[] = [
    'date BETWEEN @start AND @end',
    'media = @media',
    'campaign = @campaign',
  ];
  const params: any = { start: range.start, end: range.end, media, campaign };

  if (group) { conditions.push('`group` = @group'); params.group = group; }
  if (ad)    { conditions.push('ad = @ad');         params.ad    = ad;    }

  const sql = `SELECT ${METRICS_SQL} FROM \`${TABLE}\` WHERE ${conditions.join(' AND ')}`;
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** 일자별 실적 — 선택 레벨(캠페인/그룹/소재)에 따라 조건 자동 적용 */
export async function queryAdPerformanceDaily(
  range: DateRange,
  media: string,
  campaign: string,
  group?: string,
  ad?: string
) {
  const conditions: string[] = [
    'date BETWEEN @start AND @end',
    'media = @media',
    'campaign = @campaign',
  ];
  const params: any = { start: range.start, end: range.end, media, campaign };

  if (group) { conditions.push('`group` = @group'); params.group = group; }
  if (ad)    { conditions.push('ad = @ad');         params.ad    = ad;    }

  const sql = `
    SELECT
      CAST(date AS STRING) AS date,
      ${METRICS_SQL}
    FROM \`${TABLE}\`
    WHERE ${conditions.join(' AND ')}
    GROUP BY date
    ORDER BY date
  `;
  return query(sql, params);
}
