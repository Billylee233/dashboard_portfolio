import { NextRequest, NextResponse } from 'next/server';
import {
  querySAPeriodSummary,
  querySADailyMetrics,
  querySAWeeklyMetrics,
  querySAMonthlyMetrics,
  querySAKeywordComparison,
  querySAKeywordCampaignGroup,
  querySADistinctMedia,
  querySADistinctCampaigns,
  querySADistinctGroups,
  querySAKeywordSuggestions,
  type SADateRange,
  type SAFilter,
} from '@/lib/saQueries';
import { queryPortfolioMaxDate } from '@/lib/bigquery';
import { calcMetrics, calcDelta } from '@/lib/calculations';
import { calcComparePeriod } from '@/lib/dateUtils';
import {
  IS_PORTFOLIO,
  maskChannel, maskCampaign, maskGroup, maskKeyword,
  transformMetrics,
  buildReverseChannelMap, reverseChannel,
  clampPortfolioDate, getPortfolioDateRange,
} from '@/lib/portfolio/transform';

export const dynamic = 'force-dynamic';

function parseMulti(val: string | null): string[] | undefined {
  if (!val) return undefined;
  const arr = val.split(',').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function parseIntArray(val: string | null): number[] | undefined {
  if (!val) return undefined;
  const arr = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  return arr.length ? arr : undefined;
}

function buildFilter(sp: URLSearchParams): SAFilter {
  return {
    media:    parseMulti(sp.get('media')),
    campaign: parseMulti(sp.get('campaign')),
    group:    parseMulti(sp.get('group')),
    keywords: parseMulti(sp.get('keywords')),
    topN:     parseIntArray(sp.get('topN')),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams;
    const type = sp.get('type') ?? 'main';

    // ── 필터 옵션 조회 ─────────────────────────────────────────────────────────
    if (type === 'options') {
      const subtype  = sp.get('subtype') ?? 'media';
      const mediaRaw = parseMulti(sp.get('media'));
      const campRaw  = parseMulti(sp.get('campaign'));

      if (subtype === 'media') {
        const media = await querySADistinctMedia();
        return NextResponse.json({ media: IS_PORTFOLIO ? media.map(maskChannel) : media });
      }
      if (subtype === 'campaign') {
        // 포트폴리오: 마스킹된 media → 역매핑 후 조회 → 결과 마스킹
        let realMedia = mediaRaw;
        if (IS_PORTFOLIO && mediaRaw?.length) {
          const allReal = await querySADistinctMedia();
          const revMap  = buildReverseChannelMap(allReal);
          realMedia = mediaRaw.map(m => reverseChannel(m, revMap));
        }
        const campaigns = await querySADistinctCampaigns(realMedia);
        return NextResponse.json({ campaigns: IS_PORTFOLIO ? campaigns.map(maskCampaign) : campaigns });
      }
      if (subtype === 'group') {
        // 포트폴리오: 마스킹된 campaign → 역매핑 후 조회 → 결과 마스킹
        let realCamp = campRaw;
        if (IS_PORTFOLIO && campRaw?.length) {
          // campaign 역매핑은 단순 해시라 완전한 역변환 불가 — 전체 캠페인 목록 조회 후 매칭
          const allCampaigns = await querySADistinctCampaigns(undefined);
          const revMap = new Map(allCampaigns.map(c => [maskCampaign(c), c]));
          realCamp = campRaw.map(c => revMap.get(c) ?? c);
        }
        const groups = await querySADistinctGroups(realCamp);
        return NextResponse.json({ groups: IS_PORTFOLIO ? groups.map(maskGroup) : groups });
      }
      if (subtype === 'keyword') {
        const q = sp.get('q') ?? '';
        if (!q) return NextResponse.json({ keywords: [] });
        const keywords = await querySAKeywordSuggestions(q);
        return NextResponse.json({ keywords: IS_PORTFOLIO ? keywords.map(maskKeyword) : keywords });
      }
      return NextResponse.json({ error: 'Unknown subtype' }, { status: 400 });
    }

    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string | null) => clampPortfolioDate(d, pRange);

    const start    = cp(sp.get('start'))    ?? sp.get('start');
    const end      = cp(sp.get('end'))      ?? sp.get('end');
    const cmpStart = cp(sp.get('cmpStart'));
    const cmpEnd   = cp(sp.get('cmpEnd'));
    if (!start || !end) {
      return NextResponse.json({ error: 'start, end are required' }, { status: 400 });
    }

    const selRange: SADateRange = { start, end };
    const rawCmpSA = (cmpStart && cmpEnd)
      ? { start: cmpStart, end: cmpEnd }
      : (() => { const r = calcComparePeriod(selRange); return { start: r.start, end: r.end }; })();
    // 포트폴리오 모드: 자동 계산된 비교기간도 허용 범위로 클램핑
    const cmpRange: SADateRange = IS_PORTFOLIO
      ? { start: cp(rawCmpSA.start) ?? rawCmpSA.start, end: cp(rawCmpSA.end) ?? rawCmpSA.end }
      : rawCmpSA;

    // 포트폴리오 모드: filter의 media/campaign/group 역매핑
    let filter = buildFilter(sp);
    if (IS_PORTFOLIO) {
      if (filter.media?.length) {
        const allReal = await querySADistinctMedia();
        const revMap  = buildReverseChannelMap(allReal);
        filter = { ...filter, media: filter.media.map(m => reverseChannel(m, revMap)) };
      }
      if (filter.campaign?.length) {
        const allCampaigns = await querySADistinctCampaigns(undefined);
        const revMap = new Map(allCampaigns.map(c => [maskCampaign(c), c]));
        filter = { ...filter, campaign: filter.campaign.map(c => revMap.get(c) ?? c) };
      }
      if (filter.group?.length) {
        const allGroups = await querySADistinctGroups(undefined);
        const revMap = new Map(allGroups.map(g => [maskGroup(g), g]));
        filter = { ...filter, group: filter.group.map(g => revMap.get(g) ?? g) };
      }
      if (filter.keywords?.length) {
        // 키워드는 역매핑 불가 — 포트폴리오에서 키워드 필터 사용 시 전체 조회로 fallback
        filter = { ...filter, keywords: undefined };
      }
    }

    // ── type=trend ──────────────────────────────────────────────────────────
    if (type === 'trend') {
      const [dailyRaw, dailyCmpRaw, weeklyRaw, monthlyRaw] = await Promise.all([
        querySADailyMetrics(selRange, filter),
        querySADailyMetrics(cmpRange, filter),
        querySAWeeklyMetrics(selRange, filter),
        querySAMonthlyMetrics(selRange, filter),
      ]);

      const tm = (r: any) => IS_PORTFOLIO ? transformMetrics(calcMetrics(r)) : calcMetrics(r);
      const daily    = dailyRaw.map((r: any)    => ({ date: r.date, ...tm(r) }));
      const dailyCmp = dailyCmpRaw.map((r: any) => ({ date: r.date, ...tm(r) }));
      const weekly   = weeklyRaw.map((r: any)   => ({ week: r.week, week_start: r.week_start, week_end: r.week_end, ...tm(r) }));
      const monthly  = monthlyRaw.map((r: any)  => ({ month: r.month, ...tm(r) }));

      return NextResponse.json({ selRange, cmpRange, daily, dailyCmp, weekly, monthly });
    }

    // ── type=main ───────────────────────────────────────────────────────────
    const [selSummaryRaw, cmpSummaryRaw, keywordCompRaw, kwCampaignRaw] = await Promise.all([
      querySAPeriodSummary(selRange, filter),
      querySAPeriodSummary(cmpRange, filter),
      querySAKeywordComparison(selRange, cmpRange, filter),
      querySAKeywordCampaignGroup(selRange, filter),
    ]);

    const selMetrics = calcMetrics(selSummaryRaw[0] ?? {});
    const cmpMetrics = calcMetrics(cmpSummaryRaw[0] ?? {});
    const { delta, deltaPercent } = calcDelta(selMetrics, cmpMetrics);

    const kwCgMap = new Map<string, { campaign: string; group: string }>();
    for (const r of kwCampaignRaw as any[]) {
      kwCgMap.set(r.keyword, { campaign: r.campaign ?? '', group: r.group ?? '' });
    }

    const keywords = keywordCompRaw.map((r: any) => {
      const sel = calcMetrics({ imp: r.sel_imp, click: r.sel_click, cost: r.sel_cost, applicant: r.sel_applicant });
      const cmp = calcMetrics({ imp: r.cmp_imp, click: r.cmp_click, cost: r.cmp_cost, applicant: r.cmp_applicant });
      const { delta: kDelta, deltaPercent: kDeltaPct } = calcDelta(sel, cmp);
      const cg = kwCgMap.get(r.keyword) ?? { campaign: '', group: '' };
      return {
        keyword:      IS_PORTFOLIO ? maskKeyword(r.keyword)   : r.keyword,
        campaign:     IS_PORTFOLIO ? maskCampaign(cg.campaign) : cg.campaign,
        group:        IS_PORTFOLIO ? maskGroup(cg.group)       : cg.group,
        selected:     IS_PORTFOLIO ? transformMetrics(sel)     : sel,
        compared:     IS_PORTFOLIO ? transformMetrics(cmp)     : cmp,
        delta:        IS_PORTFOLIO ? transformMetrics(kDelta)  : kDelta,
        deltaPercent: kDeltaPct,
      };
    });

    return NextResponse.json({
      selRange,
      cmpRange,
      filter,
      periodSummary: {
        selected:     IS_PORTFOLIO ? transformMetrics(selMetrics) : selMetrics,
        compared:     IS_PORTFOLIO ? transformMetrics(cmpMetrics) : cmpMetrics,
        delta:        IS_PORTFOLIO ? transformMetrics(delta)      : delta,
        deltaPercent,
      },
      keywords,
    });

  } catch (err: any) {
    console.error('[sa-detail] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
