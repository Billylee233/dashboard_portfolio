import { NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;

const SA_PROJECT = 'n8n-credential-483211';
const SA_DATASET = 'all_position_sa';

// ─── 1. Helper_Merge_24 동기화 (기존 로직 그대로) ──────────────────────────────
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

// ─── 2. all_position_sa 동기화 ─────────────────────────────────────────────────
// 2508_SA ~ live_SA 를 merge 컬럼 기준 dedup → sa_all_merged 재생성
// → sa_all_native (date 파티션) 재생성
async function syncSAData() {
  const bq = getBQClient();

  // Step 1: *_SA 테이블 목록 동적 조회 (sa_all_merged, sa_all_native 제외)
  const [tables] = await bq.query({
    query: `
      SELECT table_id
      FROM \`${SA_PROJECT}.${SA_DATASET}.__TABLES__\`
      WHERE REGEXP_CONTAINS(table_id, r'^[0-9a-zA-Z]+_SA$')
        AND table_id NOT IN ('sa_all_merged', 'sa_all_native')
      ORDER BY
        CASE WHEN table_id = 'live_SA' THEN 0 ELSE 1 END ASC,
        table_id DESC
    `,
    useLegacySql: false,
  });

  if (!tables || tables.length === 0) {
    throw new Error('동기화할 *_SA 테이블이 없습니다.');
  }

  // Step 2: 동적 UNION ALL — live_SA 우선(priority 1), 월별 테이블(priority 2)
  const unionParts = (tables as { table_id: string }[]).map((row) => {
    const priority = row.table_id === 'live_SA' ? 1 : 2;
    return `SELECT *, ${priority} AS _src_priority FROM \`${SA_PROJECT}.${SA_DATASET}.${row.table_id}\``;
  });

  // Step 3: sa_all_merged — merge 컬럼 기준 dedup
  const mergeSql = `
    CREATE OR REPLACE TABLE \`${SA_PROJECT}.${SA_DATASET}.sa_all_merged\` AS
    SELECT * EXCEPT(rn, _src_priority)
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY merge
          ORDER BY _src_priority ASC
        ) AS rn
      FROM (
        ${unionParts.join('\n        UNION ALL\n        ')}
      )
    )
    WHERE rn = 1;
  `;

  const [mergeJob] = await bq.createQueryJob({ query: mergeSql, useLegacySql: false });
  await mergeJob.getQueryResults();

  // Step 4: sa_all_native — date 파티션 (Marketing의 partitioned 테이블과 동일 구조)
  const nativeSql = `
    CREATE OR REPLACE TABLE \`${SA_PROJECT}.${SA_DATASET}.sa_all_native\`
    PARTITION BY date AS
    SELECT * FROM \`${SA_PROJECT}.${SA_DATASET}.sa_all_merged\`;
  `;

  const [nativeJob] = await bq.createQueryJob({ query: nativeSql, useLegacySql: false });
  await nativeJob.getQueryResults();
}

// ─── POST 핸들러 ───────────────────────────────────────────────────────────────
export async function POST() {
  const [mktResult, saResult] = await Promise.allSettled([
    syncMarketingData(),
    syncSAData(),
  ]);

  const mktOk = mktResult.status === 'fulfilled';
  const saOk  = saResult.status  === 'fulfilled';
  const allOk = mktOk && saOk;

  let message: string;
  if (allOk) {
    message = '동기화 완료';
  } else if (!mktOk && !saOk) {
    message = '전체 동기화 실패';
  } else if (!mktOk) {
    const err = (mktResult as PromiseRejectedResult).reason?.message ?? '오류';
    message = `마케팅 데이터 실패: ${err}`;
  } else {
    const err = (saResult as PromiseRejectedResult).reason?.message ?? '오류';
    message = `SA 데이터 실패: ${err}`;
  }

  console.log('[sync-bigquery]', {
    marketing: mktOk ? 'ok' : (mktResult as PromiseRejectedResult).reason?.message,
    sa:        saOk  ? 'ok' : (saResult  as PromiseRejectedResult).reason?.message,
  });

  return NextResponse.json({ ok: allOk, message }, { status: allOk ? 200 : 500 });
}
