import { NextResponse } from 'next/server';

// Vercel Edge Config 또는 환경변수 기반 간이 저장
// → process.env에 THEME_JSON을 쓸 수 없으니, 실용적으로 BigQuery 사용
// 단, 테이블 없으면 그냥 null 반환 (에러 없이)
import { getBQClient } from '@/lib/bigquery';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;

async function safeQuery(sql: string, params?: Record<string, any>) {
  const bq = getBQClient();
  const [rows] = await bq.query({ query: sql, params, useLegacySql: false });
  return rows;
}

async function ensureTable() {
  try {
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${DATASET}.dashboard_theme\`
       (id STRING, theme_json STRING, updated_at TIMESTAMP)`
    );
  } catch (e: any) {
    // 이미 있거나 권한 없으면 무시
    console.warn('ensureTable warn:', e.message);
  }
}

export async function GET() {
  try {
    await ensureTable();
    const rows = await safeQuery(
      `SELECT theme_json FROM \`${PROJECT}.${DATASET}.dashboard_theme\`
       WHERE id = 'global' ORDER BY updated_at DESC LIMIT 1`
    );
    if (rows.length > 0 && rows[0].theme_json) {
      return NextResponse.json(JSON.parse(rows[0].theme_json));
    }
    return NextResponse.json(null);
  } catch (e: any) {
    console.error('theme GET:', e.message);
    return NextResponse.json(null);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await ensureTable();

    // 기존 행 삭제 후 삽입
    try {
      await safeQuery(
        `DELETE FROM \`${PROJECT}.${DATASET}.dashboard_theme\` WHERE id = 'global'`
      );
    } catch {}

    await safeQuery(
      `INSERT INTO \`${PROJECT}.${DATASET}.dashboard_theme\` (id, theme_json, updated_at)
       VALUES ('global', @theme_json, CURRENT_TIMESTAMP())`,
      { theme_json: JSON.stringify(body) }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('theme POST:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
