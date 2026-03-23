import { NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;

export async function POST() {
  try {
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

    return NextResponse.json({ ok: true, message: '동기화 완료' });
  } catch (err: any) {
    console.error('[sync-bigquery] error:', err);
    return NextResponse.json({ ok: false, message: err.message ?? '오류 발생' }, { status: 500 });
  }
}
