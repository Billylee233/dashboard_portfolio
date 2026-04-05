import { NextRequest, NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

export const dynamic = 'force-dynamic';

const PROJECT  = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;
const HISTORY_T = `\`${PROJECT}.${DATASET}.portfolio_agent_history\``;

// ── GET: 대화 이력 조회 ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const media = req.nextUrl.searchParams.get('media');
    if (!media)
      return NextResponse.json({ error: 'media 필수' }, { status: 400 });

    const bq  = getBQClient();
    const sql = `
      SELECT id, media, chat_date, question, answer, created_at
      FROM ${HISTORY_T}
      WHERE job_position = 'portfolio'
        AND media = @media
      ORDER BY created_at DESC
      LIMIT 20`;

    const [rows] = await bq.query({ query: sql, useLegacySql: false, params: { media } });
    return NextResponse.json({ history: rows });
  } catch (err: any) {
    console.error('[agent-history GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
