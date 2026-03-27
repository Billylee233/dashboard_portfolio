export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getBQClient } from '@/lib/bigquery';
import { IS_PORTFOLIO, ptable, maskChannel, buildReverseChannelMap, reverseChannel } from '@/lib/portfolio/transform';
import { queryDistinctMedia } from '@/lib/bigquery';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;

const TABLE      = () => `\`${PROJECT}.${DATASET}.${ptable('action_record')}\``;
const TYPE_TABLE = () => `\`${PROJECT}.${DATASET}.${ptable('action_record_types')}\``;

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureTable() {
  if (IS_PORTFOLIO) return; // 포트폴리오 테이블은 BQ에 이미 생성돼 있음
  const bq = getBQClient();
  try {
    await bq.query({ query: `CREATE TABLE IF NOT EXISTS ${TABLE()} (
      id STRING, channel STRING, date DATE, type STRING, description STRING, created_at TIMESTAMP
    )`, useLegacySql: false });
    await bq.query({ query: `ALTER TABLE ${TABLE()} ADD COLUMN IF NOT EXISTS type STRING`, useLegacySql: false }).catch(()=>{});
    await bq.query({ query: `ALTER TABLE ${TABLE()} ADD COLUMN IF NOT EXISTS job_type STRING`, useLegacySql: false }).catch(()=>{});
    await bq.query({ query: `CREATE TABLE IF NOT EXISTS ${TYPE_TABLE()} (
      id STRING, name STRING, description STRING, created_at TIMESTAMP
    )`, useLegacySql: false });
  } catch (e: any) { console.warn('ensureTable:', e.message); }
}

export async function GET() {
  try {
    await ensureTable();
    const bq = getBQClient();
    const [rows] = await bq.query({
      query: `SELECT id, channel, CAST(date AS STRING) as date, type, description,
                IFNULL(job_type, '') as job_type,
                CAST(created_at AS STRING) as created_at
              FROM ${TABLE()} ORDER BY date DESC, created_at DESC LIMIT 500`,
      useLegacySql: false,
    });
    const [typeRows] = await bq.query({
      query: `SELECT id, name, description FROM ${TYPE_TABLE()} ORDER BY created_at`,
      useLegacySql: false,
    });

    // 채널명 마스킹 (GET 응답에만 적용)
    const maskedRows = (rows as any[]).map(r => ({
      ...r,
      channel: maskChannel(r.channel),
    }));

    return NextResponse.json({ records: maskedRows, types: typeRows });
  } catch (e: any) {
    console.error('action-record GET:', e.message);
    return NextResponse.json({ records: [], types: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 유형 추가
    if (body.addType) {
      const { name, description } = body;
      if (!name?.trim() || !description?.trim())
        return NextResponse.json({ error: '유형명과 설명은 필수입니다.' }, { status: 400 });
      const bq = getBQClient();
      await bq.query({ query: `INSERT INTO ${TYPE_TABLE()} (id, name, description, created_at)
        VALUES (GENERATE_UUID(), '${esc(name)}', '${esc(description)}', CURRENT_TIMESTAMP())`, useLegacySql: false });
      return NextResponse.json({ ok: true });
    }

    // 유형 삭제
    if (body.deleteType) {
      const bq = getBQClient();
      await bq.query({ query: `DELETE FROM ${TYPE_TABLE()} WHERE id = '${esc(body.id)}'`, useLegacySql: false });
      return NextResponse.json({ ok: true });
    }

    // 액션 레코드 저장
    const rows: { channel: string; date: string; type: string; description: string; job_type?: string }[] = body;
    if (!rows.length) return NextResponse.json({ ok: true });
    await ensureTable();
    // 포트폴리오: 마스킹된 채널명 → 실제 채널명 역변환
    let chRevMap = new Map<string, string>();
    if (IS_PORTFOLIO) {
      const realChs = await queryDistinctMedia();
      chRevMap = buildReverseChannelMap(realChs);
    }
    const bq = getBQClient();
    const values = rows.map(r => {
      const realCh = IS_PORTFOLIO ? reverseChannel(r.channel, chRevMap) : r.channel;
      return `(GENERATE_UUID(), '${esc(realCh)}', DATE('${r.date}'), '${esc(r.type??'')}', '${esc(r.description)}', '${esc(r.job_type??'')}', CURRENT_TIMESTAMP())`;
    }).join(',\n');
    await bq.query({ query: `INSERT INTO ${TABLE()} (id, channel, date, type, description, job_type, created_at) VALUES ${values}`, useLegacySql: false });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('action-record POST:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    const bq = getBQClient();
    await bq.query({ query: `DELETE FROM ${TABLE()} WHERE id = '${esc(id)}'`, useLegacySql: false });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, channel, date, type, description, job_type } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });
    const bq = getBQClient();
    // 포트폴리오: 마스킹된 채널명 → 실제 채널명 역변환
    let realCh = channel;
    if (IS_PORTFOLIO && channel) {
      const realChs = await queryDistinctMedia();
      const revMap = buildReverseChannelMap(realChs);
      realCh = reverseChannel(channel, revMap);
    }
    const sets: string[] = [];
    if (channel)              sets.push(`channel = '${esc(realCh)}'`);
    if (date)                 sets.push(`date = DATE('${date}')`);
    if (type !== undefined)   sets.push(`type = '${esc(type)}'`);
    if (description)          sets.push(`description = '${esc(description)}'`);
    if (job_type !== undefined) sets.push(`job_type = '${esc(job_type)}'`);
    if (!sets.length) return NextResponse.json({ ok: true });
    await bq.query({ query: `UPDATE ${TABLE()} SET ${sets.join(', ')} WHERE id = '${esc(id)}'`, useLegacySql: false });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
