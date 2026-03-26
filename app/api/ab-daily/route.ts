import { NextRequest, NextResponse } from 'next/server';
import { queryAdPerformanceDaily, queryDistinctMedia, getBQClient, queryPortfolioMaxDate } from '@/lib/bigquery';
import { calcMetrics } from '@/lib/calculations';
import { IS_PORTFOLIO, buildReverseChannelMap, reverseChannel, maskCampaign, transformMetrics, clampPortfolioDate, getPortfolioDateRange } from '@/lib/portfolio/transform';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let media     = searchParams.get('media')     ?? '';
  let campaign  = searchParams.get('campaign')  ?? '';
  const group   = searchParams.get('group')     ?? undefined;
  const ad      = searchParams.get('ad')        ?? undefined;

  try {
    // 포트폴리오 모드: DB 최신 날짜 기준 1년 범위로 클램핑
    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string) => clampPortfolioDate(d, pRange) ?? d;

    const dateStart = cp(searchParams.get('dateStart') ?? '');
    const dateEnd   = cp(searchParams.get('dateEnd')   ?? '');

    if (!media || !campaign || !dateStart || !dateEnd) {
      return NextResponse.json({ error: 'media, campaign, dateStart, dateEnd 필수' }, { status: 400 });
    }
    if (IS_PORTFOLIO) {
      // media 역변환
      const realChannels = await queryDistinctMedia();
      const chRevMap = buildReverseChannelMap(realChannels);
      media = reverseChannel(media, chRevMap);

      // campaign 역변환: 해당 media의 전체 캠페인 조회 후 역맵 빌드
      const P = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
      const D = process.env.NEXT_PUBLIC_BQ_DATASET!;
      const [campRows] = await getBQClient().query({
        query: `SELECT DISTINCT campaign FROM \`${P}.${D}.all_marketing_data_partitioned\` WHERE media = @media AND campaign IS NOT NULL`,
        params: { media }, useLegacySql: false,
      }) as any;
      const campRevMap = new Map<string, string>(
        (campRows as any[]).map((r: any) => {
          const real = r.campaign?.value ?? r.campaign ?? '';
          return [maskCampaign(real), real] as [string, string];
        })
      );
      campaign = campRevMap.get(campaign) ?? campaign;
    }

    const rows = await queryAdPerformanceDaily(
      { start: dateStart, end: dateEnd },
      media, campaign, group, ad
    );

    const extract = (v: any) => {
      if (v == null) return null;
      if (typeof v === 'object' && 'value' in v) return v.value;
      return v;
    };

    const normalized = rows.map((r: any) => {
      const base = {
        imp:       Number(extract(r.imp)       ?? 0),
        click:     Number(extract(r.click)     ?? 0),
        cost:      Number(extract(r.cost)      ?? 0),
        applicant: Number(extract(r.applicant) ?? 0),
      };
      const metrics = transformMetrics(calcMetrics(base));
      return {
        date:      String(extract(r.date) ?? ''),
        imp:       metrics.imp,
        click:     metrics.click,
        cost:      metrics.cost,
        applicant: metrics.applicant,
      };
    });

    return NextResponse.json({ rows: normalized });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
