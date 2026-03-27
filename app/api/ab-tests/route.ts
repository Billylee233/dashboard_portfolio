import { NextRequest, NextResponse } from 'next/server';
import { getABTests, saveABTest, updateABTest, deleteABTest, queryAdPerformance, getBQClient } from '@/lib/bigquery';
import { calcMetrics } from '@/lib/calculations';
import { calcABStats } from '@/lib/abTestStats';
import { IS_PORTFOLIO, ptable, maskChannel, maskCampaign, maskGroup, maskAd, transformMetrics, buildReverseChannelMap, reverseChannel } from '@/lib/portfolio/transform';
import type { DateRange } from '@/lib/types';

const uuidv4 = () => crypto.randomUUID();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;
const AB_TABLE = () => `\`${PROJECT}.${DATASET}.${ptable('ab_tests')}\``;

// test_rows 내 media/campaign/ad_group/ad 마스킹
function maskTestRows(rows: any[]): any[] {
  if (!IS_PORTFOLIO) return rows;
  return rows.map(r => ({
    ...r,
    media:    maskChannel(r.media),
    campaign: maskCampaign(r.campaign),
    ad_group: maskGroup(r.ad_group),
    ad:       maskAd(r.ad),
    metrics:  r.metrics ? transformMetrics(r.metrics) : null,
  }));
}

/** GET: 전체 A/B 테스트 목록 조회 */
export async function GET() {
  try {
    let rows: any[];
    if (IS_PORTFOLIO) {
      [rows] = await getBQClient().query({
        query: `SELECT * FROM ${AB_TABLE()} ORDER BY created_at DESC`,
        useLegacySql: false,
      }) as any;
    } else {
      rows = await getABTests();
    }

    const extract = (v: any): any => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'object' && 'value' in v) return v.value;
      return v;
    };

    const normalizeRow = (r: any): any => {
      if (!r || typeof r !== 'object') return r;
      const obj: any = {};
      for (const key of Object.keys(r)) obj[key] = extract(r[key]);
      return obj;
    };

    const tests = rows.map((r: any) => {
      const norm = normalizeRow(r);
      let test_rows: any[] = [];
      if (typeof norm.test_rows === 'string') {
        try { test_rows = JSON.parse(norm.test_rows); } catch { test_rows = []; }
      } else if (Array.isArray(norm.test_rows)) {
        test_rows = norm.test_rows.map((tr: any) => normalizeRow(tr));
      }
      return {
        ...norm,
        test_rows: maskTestRows(test_rows),
        test_date_start: norm.test_date_start ?? null,
        test_date_end:   norm.test_date_end   ?? null,
      };
    });

    return NextResponse.json({ tests });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST: 새 A/B 테스트 등록 + 실적 조회 + Gemini 코멘트 생성 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test_name, description, test_date_start, test_date_end, rows, job_type } = body;

    if (!test_name || !rows?.length) {
      return NextResponse.json({ error: 'test_name, rows 필수' }, { status: 400 });
    }

    // 포트폴리오 모드: 역매핑 맵 사전 빌드
    let chRevMap = new Map<string, string>();
    const campRevMaps = new Map<string, Map<string, string>>();
    if (IS_PORTFOLIO) {
      const realChs = await (await import('@/lib/bigquery')).queryDistinctMedia();
      chRevMap = buildReverseChannelMap(realChs);
    }

    const rowsWithMetrics = await Promise.all(
      rows.map(async (row: any) => {
        if (!row.media || !row.campaign) return { ...row, metrics: null };
        // try 밖에서 선언 → catch에서도 접근 가능
        let realMedia = IS_PORTFOLIO ? reverseChannel(row.media, chRevMap) : row.media;
        let realCamp  = row.campaign;
        const realGroup = row.ad_group ?? '';
        const realAd    = row.ad ?? '';
        try {
          if (IS_PORTFOLIO) {
            if (!campRevMaps.has(realMedia)) {
              const P = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
              const D = process.env.NEXT_PUBLIC_BQ_DATASET!;
              const [cr] = await getBQClient().query({
                query: `SELECT DISTINCT campaign FROM \`${P}.${D}.all_marketing_data_partitioned\` WHERE media = @media AND campaign IS NOT NULL`,
                params: { media: realMedia }, useLegacySql: false,
              }) as any;
              campRevMaps.set(realMedia, new Map(
                (cr as any[]).map((r: any) => {
                  const real = r.campaign?.value ?? r.campaign ?? '';
                  return [maskCampaign(real), real] as [string, string];
                })
              ));
            }
            realCamp = campRevMaps.get(realMedia)?.get(row.campaign) ?? row.campaign;
          }

          const data = await queryAdPerformance(
            { start: row.dateRange.start, end: row.dateRange.end },
            realMedia, realCamp, realGroup, realAd
          );
          // BQ에는 실제 채널명으로 저장 (GET 시 maskTestRows가 다시 마스킹)
          const savedRow = IS_PORTFOLIO
            ? { ...row, media: realMedia, campaign: realCamp, ad_group: realGroup, ad: realAd }
            : row;
          return { ...savedRow, metrics: data ? calcMetrics(data) : null };
        } catch {
          // catch에서도 실제 채널명으로 저장
          const savedRow = IS_PORTFOLIO
            ? { ...row, media: realMedia, campaign: realCamp, ad_group: realGroup, ad: realAd }
            : row;
          return { ...savedRow, metrics: null };
        }
      })
    );

    let ai_comment: string | null = null;
    try {
      const validRows = rowsWithMetrics.filter((r: any) => r.metrics);
      if (validRows.length >= 2 && GEMINI_API_KEY) {
        const summary = validRows
          .map((r: any) =>
            `[${r.label}/${r.group}] APP=${r.metrics.applicant} CPA=${Math.round(r.metrics.cpa)} CVR=${(r.metrics.cvr * 100).toFixed(2)}% CTR=${(r.metrics.ctr * 100).toFixed(2)}%`
          ).join('\n');

        const prompt = `다음 A/B 테스트 결과를 분석해주세요.\n테스트명: ${test_name}\n\n[결과]\n${summary}\n\n3줄 이내로 핵심 결론만 작성하세요. 마크다운 없이 plain text로.`.trim();
        const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.3 } }),
        });
        const json = await res.json();
        ai_comment = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
      }
    } catch (e) { console.warn('Gemini comment failed:', e); }

    const controlRows = rowsWithMetrics.filter((r: any) => r.group === 'control' && r.metrics);
    const testRows    = rowsWithMetrics.filter((r: any) => r.group === 'test'    && r.metrics);
    let stats = null;
    if (controlRows.length && testRows.length) {
      const avgM = (arr: any[]) => arr.reduce((acc: any, r: any) => ({
        applicant: acc.applicant + r.metrics.applicant / arr.length,
        click:     acc.click     + r.metrics.click     / arr.length,
      }), { applicant: 0, click: 0 });
      const ctrl = avgM(controlRows);
      const test = avgM(testRows);
      stats = calcABStats(Math.round(ctrl.applicant), Math.round(ctrl.click), Math.round(test.applicant), Math.round(test.click));
    }

    const test_id = uuidv4();

    if (IS_PORTFOLIO) {
      const bq = getBQClient();
      await bq.query({
        query: `INSERT INTO ${AB_TABLE()} (test_id, test_name, description, test_date_start, test_date_end, test_rows, ai_comment, job_type, created_at, updated_at)
                VALUES (@test_id, @test_name, @description, @test_date_start, @test_date_end, PARSE_JSON(@test_rows), @ai_comment, @job_type, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
        params: { test_id, test_name, description: description ?? '', test_date_start: test_date_start ?? null, test_date_end: test_date_end ?? null, test_rows: JSON.stringify(rowsWithMetrics), ai_comment, job_type: job_type ?? null },
        types: { test_date_start: 'DATE', test_date_end: 'DATE', ai_comment: 'STRING', job_type: 'STRING' },
        useLegacySql: false,
      });
    } else {
      await saveABTest({ test_id, test_name, description: description ?? '', test_date_start: test_date_start ?? null, test_date_end: test_date_end ?? null, test_rows: JSON.stringify(rowsWithMetrics), ai_comment, job_type: job_type ?? null });
    }

    return NextResponse.json({ test_id, stats, ai_comment });
  } catch (err: any) {
    console.error('[API /ab-tests POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE */
export async function DELETE(req: NextRequest) {
  try {
    const { test_id } = await req.json();
    if (IS_PORTFOLIO) {
      await getBQClient().query({ query: `DELETE FROM ${AB_TABLE()} WHERE test_id = @test_id`, params: { test_id }, useLegacySql: false });
    } else {
      await deleteABTest(test_id);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PATCH */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { test_id, test_name, description, test_date_start, test_date_end, rows, job_type } = body;
    if (!test_id || !rows?.length) return NextResponse.json({ error: 'test_id, rows 필수' }, { status: 400 });

    // 포트폴리오 모드: PATCH도 역매핑 필요
    let chRevMapP = new Map<string, string>();
    const campRevMapsP = new Map<string, Map<string, string>>();
    if (IS_PORTFOLIO) {
      const realChs = await (await import('@/lib/bigquery')).queryDistinctMedia();
      chRevMapP = buildReverseChannelMap(realChs);
    }

    const rowsWithMetrics = await Promise.all(
      rows.map(async (row: any) => {
        if (!row.media || !row.campaign || !row.dateRange?.start || !row.dateRange?.end) return { ...row, metrics: null };
        let realMedia = IS_PORTFOLIO ? reverseChannel(row.media, chRevMapP) : row.media;
        let realCamp  = row.campaign;
        const realGroup = row.ad_group ?? '';
        const realAd    = row.ad ?? '';
        try {
          if (IS_PORTFOLIO) {
            if (!campRevMapsP.has(realMedia)) {
              const P = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
              const D = process.env.NEXT_PUBLIC_BQ_DATASET!;
              const [cr] = await getBQClient().query({
                query: `SELECT DISTINCT campaign FROM \`${P}.${D}.all_marketing_data_partitioned\` WHERE media = @media AND campaign IS NOT NULL`,
                params: { media: realMedia }, useLegacySql: false,
              }) as any;
              campRevMapsP.set(realMedia, new Map(
                (cr as any[]).map((r: any) => {
                  const real = r.campaign?.value ?? r.campaign ?? '';
                  return [maskCampaign(real), real] as [string, string];
                })
              ));
            }
            realCamp = campRevMapsP.get(realMedia)?.get(row.campaign) ?? row.campaign;
          }
          const data = await queryAdPerformance({ start: row.dateRange.start, end: row.dateRange.end }, realMedia, realCamp, realGroup, realAd);
          const savedRow = IS_PORTFOLIO
            ? { ...row, media: realMedia, campaign: realCamp, ad_group: realGroup, ad: realAd }
            : row;
          return { ...savedRow, metrics: data ? calcMetrics(data) : null };
        } catch {
          const savedRow = IS_PORTFOLIO
            ? { ...row, media: realMedia, campaign: realCamp, ad_group: realGroup, ad: realAd }
            : row;
          return { ...savedRow, metrics: null };
        }
      })
    );

    if (IS_PORTFOLIO) {

      const sets = ['test_rows = PARSE_JSON(@test_rows)', 'updated_at = CURRENT_TIMESTAMP()'];
      const params: any = { test_id, test_rows: JSON.stringify(rowsWithMetrics) };
      if (test_name       !== undefined) { sets.push('test_name = @test_name');           params.test_name       = test_name; }
      if (description     !== undefined) { sets.push('description = @description');       params.description     = description; }
      if (test_date_start !== undefined) { sets.push('test_date_start = @test_date_start'); params.test_date_start = test_date_start; }
      if (test_date_end   !== undefined) { sets.push('test_date_end = @test_date_end');   params.test_date_end   = test_date_end; }
      if (job_type        !== undefined) { sets.push('job_type = @job_type');             params.job_type        = job_type; }
      await getBQClient().query({ query: `UPDATE ${AB_TABLE()} SET ${sets.join(', ')} WHERE test_id = @test_id`, params, useLegacySql: false });
    } else {
      await updateABTest(test_id, {
        test_rows: JSON.stringify(rowsWithMetrics),
        ...(test_name       !== undefined ? { test_name }       : {}),
        ...(description     !== undefined ? { description }     : {}),
        ...(test_date_start !== undefined ? { test_date_start } : {}),
        ...(test_date_end   !== undefined ? { test_date_end }   : {}),
        ...(job_type        !== undefined ? { job_type }        : {}),
      });
    }

    return NextResponse.json({ ok: true, rows: maskTestRows(rowsWithMetrics) });
  } catch (err: any) {
    console.error('[API /ab-tests PATCH]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
