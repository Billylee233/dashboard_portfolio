import { NextRequest, NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';

export const dynamic = 'force-dynamic';

const SA_PROJECT  = 'n8n-credential-483211';
const SA_DATASET  = 'all_position_sa';
const SETTINGS_TABLE = `\`${SA_PROJECT}.${SA_DATASET}.sa_action_settings\``;

async function bqQuery(sql: string, params?: any) {
  const bq = getBQClient();
  const [rows] = await bq.query({ query: sql, useLegacySql: false, params });
  return rows;
}

// ─── GET: 모든 설정 로드 ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const rows = await bqQuery(
      `SELECT setting_key, setting_json FROM ${SETTINGS_TABLE} ORDER BY updated_at DESC`
    );

    const result: Record<string, any> = {};
    for (const row of rows as any[]) {
      // 같은 key가 여러 개면 최신 1개만 (ORDER BY DESC 순서)
      if (!result[row.setting_key]) {
        try { result[row.setting_key] = JSON.parse(row.setting_json); }
        catch { result[row.setting_key] = null; }
      }
    }
    return NextResponse.json({ ok: true, settings: result });
  } catch (err: any) {
    console.error('[action-settings GET]', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// ─── POST: 설정 저장 (DELETE + INSERT 방식 upsert) ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { setting_key, setting_value } = body;

    if (!setting_key || setting_value === undefined) {
      return NextResponse.json({ ok: false, error: 'setting_key, setting_value required' }, { status: 400 });
    }

    const bq = getBQClient();

    // 기존 동일 key 삭제
    await bq.query({
      query: `DELETE FROM ${SETTINGS_TABLE} WHERE setting_key = @key`,
      useLegacySql: false,
      params: { key: setting_key },
    });

    // 새 값 INSERT
    await bq.query({
      query: `INSERT INTO ${SETTINGS_TABLE} (setting_key, setting_json, updated_at)
              VALUES (@key, @json, CURRENT_TIMESTAMP())`,
      useLegacySql: false,
      params: {
        key:  setting_key,
        json: JSON.stringify(setting_value),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[action-settings POST]', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
