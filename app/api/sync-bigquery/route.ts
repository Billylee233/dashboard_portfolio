import { NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

export const maxDuration = 300;

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;

const SA_PROJECT = 'n8n-credential-483211';
const SA_DATASET = 'all_position_sa';

// ─── 1. Helper_Merge_24 동기화 ─────────────────────────────────────────────────
async function syncMarketingData() {
  const bq = getBQClient();
  const sql = `
    CREATE OR REPLACE TABLE \`${PROJECT}.${DATASET}.all_marketing_data\` AS
    SELECT * EXCEPT(rn, _source_priority) FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY month, media, date, campaign, \`group\`, ad, lptag
          ORDER BY _source_priority ASC
        ) AS rn
      FROM (
        SELECT *, 1 AS _source_priority FROM \`${PROJECT}.${DATASET}.raw_live\`
        UNION ALL
        SELECT *, 2 AS _source_priority FROM \`${PROJECT}.${DATASET}.raw_2026\`
        UNION ALL
        SELECT *, 3 AS _source_priority FROM \`${PROJECT}.${DATASET}.raw_2025\`
        UNION ALL
        SELECT *, 4 AS _source_priority FROM \`${PROJECT}.${DATASET}.raw_2024\`
      )
    )
    WHERE rn = 1;

    CREATE OR REPLACE TABLE \`${PROJECT}.${DATASET}.all_marketing_data_partitioned\`
    PARTITION BY date AS
    SELECT * FROM \`${PROJECT}.${DATASET}.all_marketing_data\`;
  `;

  const [job] = await bq.createQueryJob({ query: sql, useLegacySql: false });
  await job.getQueryResults();
}

// ─── 2. SA 동기화 (단순 UNION ALL) ─────────────────────────────────────────────
// live_SA + sa_archive → sa_merged_table
async function syncSAData() {
  const bq = getBQClient();

  const sql = `
    CREATE OR REPLACE TABLE \`${SA_PROJECT}.${SA_DATASET}.sa_merged_table\` AS

    SELECT
      campaign_kr, \`group\`, keyword, imp, click, cost, date, campaign,
      CASE UPPER(media)
        WHEN 'SA_NAVER'  THEN 'SA_Naver'
        WHEN 'SA_GOOGLE' THEN 'SA_Google'
        WHEN 'SA_DAUM'   THEN 'SA_Daum'
        WHEN 'SA_CARROT' THEN 'SA_Carrot'
        ELSE media
      END AS media,
      job_position, device, campaign_type, \`merge\`, month, week, applicant
    FROM \`${SA_PROJECT}.${SA_DATASET}.live_SA\`

    UNION ALL

    SELECT * FROM \`${SA_PROJECT}.${SA_DATASET}.sa_archive\`;
  `;

  const [job] = await bq.createQueryJob({ query: sql, useLegacySql: false });
  await job.getQueryResults();
}

// ─── POST 핸들러 ───────────────────────────────────────────────────────────────
export async function POST() {
  const results = {
    marketing: { ok: false, msg: '' },
    sa: { ok: false, msg: '' },
  };

  try {
    await syncMarketingData();
    results.marketing = { ok: true, msg: 'ok' };
  } catch (err: any) {
    results.marketing = { ok: false, msg: err?.message ?? '오류' };
  }

  try {
    await syncSAData();
    results.sa = { ok: true, msg: 'ok' };
  } catch (err: any) {
    results.sa = { ok: false, msg: err?.message ?? '오류' };
  }

  const allOk = results.marketing.ok && results.sa.ok;

  let message: string;
  if (allOk) {
    message = '동기화 완료';
  } else if (!results.marketing.ok && !results.sa.ok) {
    message = '전체 동기화 실패';
  } else if (!results.marketing.ok) {
    message = `마케팅 데이터 실패: ${results.marketing.msg}`;
  } else {
    message = `SA 데이터 실패: ${results.sa.msg}`;
  }

  console.log('[sync-bigquery]', results);

  return NextResponse.json({ ok: allOk, message }, { status: allOk ? 200 : 200 });
}
