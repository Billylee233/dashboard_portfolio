import { NextRequest, NextResponse } from 'next/server';
import { queryAdPerformance, queryPortfolioMaxDate, getBQClient } from '@/lib/bigquery';
import { IS_PORTFOLIO, clampPortfolioDate, getPortfolioDateRange } from '@/lib/portfolio/transform';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET = process.env.NEXT_PUBLIC_BQ_DATASET!;
const TABLE   = `${PROJECT}.${DATASET}.all_marketing_data_partitioned`;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const media    = searchParams.get('media')!;
    const campaign = searchParams.get('campaign')!;
    const group    = searchParams.get('group')!;
    const ad       = searchParams.get('ad')!;
    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string | null | undefined) => clampPortfolioDate(d, pRange);

    const start    = cp(searchParams.get('start')) ?? searchParams.get('start')!;
    const end      = cp(searchParams.get('end'))   ?? searchParams.get('end')!;

    const data = await queryAdPerformance({ start, end }, media, campaign, group, ad);
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 캐스케이드 드롭다운 옵션 조회
export async function POST(req: NextRequest) {
  try {
    const { media } = await req.json();
    const bq = getBQClient();

    const sql = `
      SELECT DISTINCT
        campaign,
        \`group\`,
        ad
      FROM \`${TABLE}\`
      WHERE media = @media
        AND campaign IS NOT NULL
        AND \`group\` IS NOT NULL
        AND ad IS NOT NULL
      ORDER BY campaign, \`group\`, ad
    `;
    const [rows] = await bq.query({ query: sql, params: { media } });

    const campaigns = [...new Set(rows.map((r: any) => r.campaign))] as string[];
    const groups: Record<string, string[]> = {};
    const ads: Record<string, string[]> = {};

    for (const row of rows as any[]) {
      if (!groups[row.campaign]) groups[row.campaign] = [];
      if (!groups[row.campaign].includes(row.group)) {
        groups[row.campaign].push(row.group);
      }
      const key = `${row.campaign}__${row.group}`;
      if (!ads[key]) ads[key] = [];
      if (!ads[key].includes(row.ad)) ads[key].push(row.ad);
    }

    return NextResponse.json({ campaigns, groups, ads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
