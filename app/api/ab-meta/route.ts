import { NextRequest, NextResponse } from 'next/server';
import { getBQClient, queryDistinctMedia } from '@/lib/bigquery';
import {
  IS_PORTFOLIO,
  maskCampaign, maskGroup, maskAd,
  buildReverseChannelMap, reverseChannel,
} from '@/lib/portfolio/transform';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;
const TABLE   = `\`${PROJECT}.${DATASET}.all_marketing_data_partitioned\``;

async function queryDistinct(sql: string, params: Record<string, any> = {}) {
  const bq = getBQClient();
  const [job] = await bq.createQueryJob({ query: sql, params, useLegacySql: false });
  const [rows] = await job.getQueryResults();
  return rows;
}

const extractValue = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'value' in v) return String(v.value);
  return String(v);
};

/**
 * v2 SQL 기반 + 포트폴리오 역매핑 레이어
 * 날짜 범위 있으면 IMP > 0 필터, 없으면 전체 DISTINCT
 *
 * GET /api/ab-meta?type=campaign&media=채널XX&selStart=...&selEnd=...&cmpStart=...&cmpEnd=...
 * GET /api/ab-meta?type=group&media=채널XX&campaign=캠페인XX&...
 * GET /api/ab-meta?type=ad&media=채널XX&campaign=캠페인XX&group=그룹XX&...
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get('type');
  let   media    = searchParams.get('media')    ?? '';
  let   campaign = searchParams.get('campaign') ?? '';
  let   group    = searchParams.get('group')    ?? '';
  const selStart = searchParams.get('selStart') ?? '';
  const selEnd   = searchParams.get('selEnd')   ?? '';
  const cmpStart = searchParams.get('cmpStart') ?? '';
  const cmpEnd   = searchParams.get('cmpEnd')   ?? '';

  const hasDates = !!(selStart && selEnd && cmpStart && cmpEnd);

  // ── 포트폴리오: 마스킹된 파라미터 → 실제 값 역변환 ─────────────────────
  if (IS_PORTFOLIO) {
    try {
      const realChannels = await queryDistinctMedia();
      const chRevMap = buildReverseChannelMap(realChannels);
      media = reverseChannel(media, chRevMap);

      if (campaign) {
        const campRows = await queryDistinct(
          `SELECT DISTINCT campaign FROM ${TABLE} WHERE media = @media AND campaign IS NOT NULL ORDER BY campaign`,
          { media }
        );
        const campRevMap = new Map(
          campRows.map((r: any) => {
            const real = extractValue(r.campaign);
            return [maskCampaign(real), real];
          })
        );
        campaign = campRevMap.get(campaign) ?? campaign;
      }

      if (group && campaign) {
        const grpRows = await queryDistinct(
          `SELECT DISTINCT \`group\` FROM ${TABLE} WHERE media = @media AND campaign = @campaign AND \`group\` IS NOT NULL ORDER BY \`group\``,
          { media, campaign }
        );
        const grpRevMap = new Map(
          grpRows.map((r: any) => {
            const real = extractValue(r.group);
            return [maskGroup(real), real];
          })
        );
        group = grpRevMap.get(group) ?? group;
      }
    } catch (e) {
      console.error('[ab-meta] reverse map error:', e);
    }
  }

  // ── v2 SQL: 날짜 필터 빌더 ───────────────────────────────────────────────
  const buildDateFilter = (col: string, extra = '') => {
    if (!hasDates) {
      return `
        SELECT DISTINCT ${col}
        FROM ${TABLE}
        WHERE ${col} IS NOT NULL ${extra}
        ORDER BY ${col}
      `;
    }
    return `
      SELECT ${col}
      FROM ${TABLE}
      WHERE ${col} IS NOT NULL ${extra}
        AND date BETWEEN @selStart AND @selEnd
      GROUP BY ${col}
      HAVING SUM(imp) > 0
      UNION DISTINCT
      SELECT ${col}
      FROM ${TABLE}
      WHERE ${col} IS NOT NULL ${extra}
        AND date BETWEEN @cmpStart AND @cmpEnd
      GROUP BY ${col}
      HAVING SUM(imp) > 0
      ORDER BY ${col}
    `;
  };

  const dateParams = hasDates ? { selStart, selEnd, cmpStart, cmpEnd } : {};

  try {
    if (type === 'campaign') {
      const sql = buildDateFilter('campaign', `AND media = @media`);
      const rows = await queryDistinct(sql, { media, ...dateParams });
      const values = rows.map((r: any) => extractValue(r.campaign)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskCampaign) : values });
    }

    if (type === 'group') {
      const sql = buildDateFilter('`group`', `AND media = @media AND campaign = @campaign`);
      const rows = await queryDistinct(sql, { media, campaign, ...dateParams });
      const values = rows.map((r: any) => extractValue(r.group)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskGroup) : values });
    }

    if (type === 'ad') {
      const sql = buildDateFilter('ad', `AND media = @media AND campaign = @campaign AND \`group\` = @group`);
      const rows = await queryDistinct(sql, { media, campaign, group, ...dateParams });
      const values = rows.map((r: any) => extractValue(r.ad)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskAd) : values });
    }

    return NextResponse.json({ error: 'type 파라미터 필요 (campaign | group | ad)' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
