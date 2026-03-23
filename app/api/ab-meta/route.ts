import { NextRequest, NextResponse } from 'next/server';
import { getBQClient, queryDistinctMedia } from '@/lib/bigquery';
import {
  IS_PORTFOLIO,
  maskChannel, maskCampaign, maskGroup, maskAd,
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type        = searchParams.get('type');
  let   media       = searchParams.get('media')    ?? '';
  let   campaign    = searchParams.get('campaign') ?? '';
  let   group       = searchParams.get('group')    ?? '';

  try {
    // 포트폴리오 모드: 마스킹된 파라미터 → 실제 값으로 역변환 후 BQ 조회
    if (IS_PORTFOLIO) {
      const realChannels = await queryDistinctMedia();
      const chRevMap     = buildReverseChannelMap(realChannels);
      media = reverseChannel(media, chRevMap);

      // campaign 역맵 (마스킹 → 원본)
      if (campaign) {
        const allCamps = await queryDistinct(
          `SELECT DISTINCT campaign FROM ${TABLE} WHERE media = @media AND campaign IS NOT NULL ORDER BY campaign`,
          { media }
        );
        const campRevMap = new Map(
          allCamps.map((r: any) => {
            const real = extractValue(r.campaign);
            return [maskCampaign(real), real];
          })
        );
        campaign = campRevMap.get(campaign) ?? campaign;
      }

      // group 역맵
      if (group && campaign) {
        const allGroups = await queryDistinct(
          `SELECT DISTINCT \`group\` FROM ${TABLE} WHERE media = @media AND campaign = @campaign AND \`group\` IS NOT NULL ORDER BY \`group\``,
          { media, campaign }
        );
        const grpRevMap = new Map(
          allGroups.map((r: any) => {
            const real = extractValue(r.group);
            return [maskGroup(real), real];
          })
        );
        group = grpRevMap.get(group) ?? group;
      }
    }

    if (type === 'campaign') {
      const rows = await queryDistinct(
        `SELECT DISTINCT campaign FROM ${TABLE} WHERE media = @media AND campaign IS NOT NULL ORDER BY campaign`,
        { media }
      );
      const values = rows.map((r: any) => extractValue(r.campaign)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskCampaign) : values });
    }

    if (type === 'group') {
      const rows = await queryDistinct(
        `SELECT DISTINCT \`group\` FROM ${TABLE} WHERE media = @media AND campaign = @campaign AND \`group\` IS NOT NULL ORDER BY \`group\``,
        { media, campaign }
      );
      const values = rows.map((r: any) => extractValue(r.group)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskGroup) : values });
    }

    if (type === 'ad') {
      const rows = await queryDistinct(
        `SELECT DISTINCT ad FROM ${TABLE} WHERE media = @media AND campaign = @campaign AND \`group\` = @group AND ad IS NOT NULL ORDER BY ad`,
        { media, campaign, group }
      );
      const values = rows.map((r: any) => extractValue(r.ad)).filter(Boolean);
      return NextResponse.json({ values: IS_PORTFOLIO ? values.map(maskAd) : values });
    }

    return NextResponse.json({ error: 'type 파라미터 필요 (campaign | group | ad)' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
