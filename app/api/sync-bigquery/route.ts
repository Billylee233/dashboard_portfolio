import { NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

export const maxDuration = 300;

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;

const SA_PROJECT = 'n8n-credential-483211';
const SA_DATASET = 'all_position_sa';
const SA_TABLE = 'sa_merged_table';
const SA_ARCHIVE = 'sa_archive';  // 아카이브 테이블 (2508~2602 고정 데이터)

// ─── media 정규화 맵 ───────────────────────────────────────────────────────────
const MEDIA_NORMALIZE = `
  CASE UPPER(media)
    WHEN 'SA_NAVER'  THEN 'SA_Naver'
    WHEN 'SA_GOOGLE' THEN 'SA_Google'
    WHEN 'SA_DAUM'   THEN 'SA_Daum'
    WHEN 'SA_CARROT' THEN 'SA_Carrot'
    ELSE media
  END AS media
`;

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

// ─── 2. SA 동기화 (증분 업데이트 방식) ─────────────────────────────────────────
// live_SA(Sheets)만 읽고, sa_archive(네이티브 TABLE)와 병합
// → Sheets API 호출 1회로 과부하 방지
async function syncSAData() {
  const bq = getBQClient();

  const sql = `
    CREATE OR REPLACE TABLE \`${SA_PROJECT}.${SA_DATASET}.${SA_TABLE}\` AS
    SELECT * EXCEPT(rn, _src_priority)
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY \`merge\`
          ORDER BY _src_priority ASC
        ) AS rn
      FROM (
        -- live_SA: 최신 데이터 (Sheets에서 읽기, 우선순위 1)
        SELECT
          campaign_kr,
          \`group\`,
          keyword,
          imp,
          click,
          cost,
          date,
          campaign,
          ${MEDIA_NORMALIZE},
          job_position,
          device,
          campaign_type,
          \`merge\`,
          month,
          week,
          applicant,
          1 AS _src_priority
        FROM \`${SA_PROJECT}.${SA_DATASET}.live_SA\`

        UNION ALL

        -- sa_archive: 아카이브 데이터 (네이티브 TABLE, 우선순위 2)
        SELECT
          campaign_kr,
          \`group\`,
          keyword,
          imp,
          click,
          cost,
          date,
          campaign,
          media,  -- 이미 정규화됨
          job_position,
          device,
          campaign_type,
          \`merge\`,
          month,
          week,
          applicant,
          2 AS _src_priority
        FROM \`${SA_PROJECT}.${SA_DATASET}.${SA_ARCHIVE}\`
      )
    )
    WHERE rn = 1;
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
