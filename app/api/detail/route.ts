import { NextRequest, NextResponse } from 'next/server';
import {
  queryDailyMetrics,
  queryCampaignMetrics,
  queryGroupMetrics,
  queryAdMetrics,
  queryHierarchyDailyMetrics,
  queryDistinctMedia,
  queryPortfolioMaxDate,
} from '@/lib/bigquery';
import { calcMetrics, calcDelta, calcTrend } from '@/lib/calculations';
import { calcComparePeriod } from '@/lib/dateUtils';
import type { DateRange } from '@/lib/types';
import { IS_PORTFOLIO, maskChannel, maskCampaign, maskGroup, maskAd, transformMetrics, buildReverseChannelMap, reverseChannel, clampPortfolioDate, getPortfolioDateRange } from '@/lib/portfolio/transform';

export const dynamic = 'force-dynamic';

/** imp가 0인 row 제거 */
function filterZeroImp(rows: any[]): any[] {
  return rows.filter(r => (r.imp ?? 0) > 0);
}

/** daily rows → 기간 합계 집계 */
function aggregatePeriod(rows: any[]) {
  const totals = rows.reduce(
    (acc, r) => ({
      imp:       acc.imp       + (r.imp       ?? 0),
      click:     acc.click     + (r.click     ?? 0),
      cost:      acc.cost      + (r.cost      ?? 0),
      applicant: acc.applicant + (r.applicant ?? 0),
    }),
    { imp: 0, click: 0, cost: 0, applicant: 0 }
  );
  return calcMetrics(totals);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    let media      = searchParams.get('media')!;
    // 포트폴리오 모드: DB 최신 날짜 기준 1년 범위로 클램핑
    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string | null | undefined) => clampPortfolioDate(d, pRange);

    const start    = cp(searchParams.get('start'))    ?? searchParams.get('start')!;
    const end      = cp(searchParams.get('end'))      ?? searchParams.get('end')!;
    const cmpStart = cp(searchParams.get('cmpStart'));
    const cmpEnd   = cp(searchParams.get('cmpEnd'));

    // 포트폴리오 모드: 마스킹된 채널명 → 실제 채널명으로 역변환
    let revMap = new Map<string, string>();
    if (IS_PORTFOLIO) {
      const realChannels = await queryDistinctMedia();
      revMap = buildReverseChannelMap(realChannels);
      media = reverseChannel(media, revMap);
    }

    const selected: DateRange = { start, end };
    const rawCmp = cmpStart && cmpEnd
      ? { start: cmpStart, end: cmpEnd }
      : calcComparePeriod(selected);
    // 포트폴리오 모드: 자동 계산된 비교기간도 허용 범위로 클램핑
    const compared: DateRange = IS_PORTFOLIO
      ? { start: cp(rawCmp.start) ?? rawCmp.start, end: cp(rawCmp.end) ?? rawCmp.end }
      : rawCmp;

    const [
      dailyRaw,
      compareDailyRaw,
      campaignSel,
      campaignCmp,
      groupSel,
      groupCmp,
      adSel,
      adCmp,
      hierarchyRaw,
      hierarchyCmpRaw,
    ] = await Promise.all([
      queryDailyMetrics(selected, media),
      queryDailyMetrics(compared, media),
      queryCampaignMetrics(selected, media),
      queryCampaignMetrics(compared, media),
      queryGroupMetrics(selected, media),
      queryGroupMetrics(compared, media),
      queryAdMetrics(selected, media),
      queryAdMetrics(compared, media),
      queryHierarchyDailyMetrics(selected, media),
      queryHierarchyDailyMetrics(compared, media),
    ]);

    // 선택기간 daily (imp > 0만)
    const daily = filterZeroImp(dailyRaw).map((r: any) => ({
      date: r.date,
      ...calcMetrics(r),
    }));

    // 비교기간 daily (imp > 0만)
    const compareDailyFiltered = filterZeroImp(compareDailyRaw).map((r: any) => ({
      date: r.date,
      ...calcMetrics(r),
    }));

    // Period Summary KPI = 선택 기간 집계
    const periodSummary = aggregatePeriod(daily);
    const compareSummary = aggregatePeriod(compareDailyFiltered);
    const { deltaPercent: periodDeltaPercent } = calcDelta(periodSummary, compareSummary);

    // Trend = 선택 기간 일자별 (TrendChart 용 - 모든 지표 포함)
    const trend = daily;
    const compareTrend = compareDailyFiltered;

    // 최신 날짜
    const latestDate = daily.length > 0 ? daily[daily.length - 1].date : null;

    // Bubble scatter data (선택기간 imp > 0만) + 추세 포함
    const campaignCmpMap = new Map(filterZeroImp(campaignCmp).map((r: any) => [r.campaign, r]));
    const groupCmpMap = new Map(filterZeroImp(groupCmp).map((r: any) => [`${r.campaign}__${r.group}`, r]));
    const adCmpMap = new Map(filterZeroImp(adCmp).map((r: any) => [r.ad, r]));

    const campaignBubbles = filterZeroImp(campaignSel).map((r: any) => {
      const selM = calcMetrics(r);
      const cmpR = campaignCmpMap.get(r.campaign);
      const cmpM = cmpR ? calcMetrics(cmpR) : null;
      const { trend, pct } = cmpM ? calcTrend(selM.cpa, cmpM.cpa, selM.applicant, cmpM.applicant) : { trend: 'stable', pct: 0 };
      return { id: r.campaign, label: r.campaign, ...selM, selImp: r.imp, cmpImp: cmpR?.imp ?? 0, trend, trendPct: pct };
    });
    const groupBubbles = filterZeroImp(groupSel).map((r: any) => {
      const selM = calcMetrics(r);
      const key = `${r.campaign}__${r.group}`;
      const cmpR = groupCmpMap.get(key);
      const cmpM = cmpR ? calcMetrics(cmpR) : null;
      const { trend, pct } = cmpM ? calcTrend(selM.cpa, cmpM.cpa, selM.applicant, cmpM.applicant) : { trend: 'stable', pct: 0 };
      return { id: key, label: r.group, campaign: r.campaign, ...selM, selImp: r.imp, cmpImp: cmpR?.imp ?? 0, trend, trendPct: pct };
    });
    const adBubbles = filterZeroImp(adSel).map((r: any) => {
      const selM = calcMetrics(r);
      const cmpR = adCmpMap.get(r.ad);
      const cmpM = cmpR ? calcMetrics(cmpR) : null;
      const { trend, pct } = cmpM ? calcTrend(selM.cpa, cmpM.cpa, selM.applicant, cmpM.applicant) : { trend: 'stable', pct: 0 };
      return { id: r.ad, label: r.ad, campaign: r.campaign, group: r.group, ...selM, selImp: r.imp, cmpImp: cmpR?.imp ?? 0, trend, trendPct: pct };
    });

    // Hierarchy daily (imp > 0 필터)
    const hierarchy = filterZeroImp(hierarchyRaw);
    const hierarchyCmp = filterZeroImp(hierarchyCmpRaw);

    // 캠페인/그룹/소재별 집계 (comparison 모드용)
    const buildComparisonData = (
      selRows: any[],
      cmpRows: any[],
      keyFn: (r: any) => string,
      extraFn: (r: any) => object,
    ) => {
      const selMap = new Map<string, any[]>();
      const cmpMap = new Map<string, any[]>();

      for (const r of filterZeroImp(selRows)) {
        const k = keyFn(r);
        if (!selMap.has(k)) selMap.set(k, []);
        selMap.get(k)!.push(r);
      }
      for (const r of filterZeroImp(cmpRows)) {
        const k = keyFn(r);
        if (!cmpMap.has(k)) cmpMap.set(k, []);
        cmpMap.get(k)!.push(r);
      }

      const keys = new Set([...selMap.keys(), ...cmpMap.keys()]);
      return [...keys].map(k => {
        const selM = aggregatePeriod(selMap.get(k) ?? []);
        const cmpM = aggregatePeriod(cmpMap.get(k) ?? []);
        const { delta, deltaPercent } = calcDelta(selM, cmpM);
        const sample = (selMap.get(k) ?? cmpMap.get(k) ?? [])[0] ?? {};
        return {
          key: k,
          ...extraFn(sample),
          selected: selM,
          compared: cmpM,
          delta,
          deltaPercent,
        };
      }).sort((a, b) => (b.selected.applicant ?? 0) - (a.selected.applicant ?? 0));
    };

    const campaignComparison = buildComparisonData(
      campaignSel, campaignCmp,
      r => r.campaign,
      r => ({ campaign: r.campaign }),
    );
    const groupComparison = buildComparisonData(
      groupSel, groupCmp,
      r => `${r.campaign}__${r.group}`,
      r => ({ campaign: r.campaign, group: r.group }),
    );
    const adComparison = buildComparisonData(
      adSel, adCmp,
      r => r.ad,
      r => ({ campaign: r.campaign, group: r.group, ad: r.ad }),
    );

    // ── 포트폴리오 모드: 마스킹 + 수치 변환 ─────────────────────────────────
    const tm = (m: any) => IS_PORTFOLIO ? transformMetrics(m) : m;
    const mc = (s: string|null|undefined) => IS_PORTFOLIO ? maskCampaign(s) : (s ?? '');
    const mg = (s: string|null|undefined) => IS_PORTFOLIO ? maskGroup(s)    : (s ?? '');
    const ma = (s: string|null|undefined) => IS_PORTFOLIO ? maskAd(s)       : (s ?? '');

    const maskHierarchy = (rows: any[]) => IS_PORTFOLIO
      ? rows.map(r => ({ ...r, campaign: mc(r.campaign), group: mg(r.group), ad: ma(r.ad) }))
      : rows;
    const maskBubbles = (arr: any[], type: 'campaign'|'group'|'ad') => IS_PORTFOLIO
      ? arr.map(r => ({
          ...r, ...tm(r),
          id:       type === 'campaign' ? mc(r.id) : type === 'group' ? `${mc(r.campaign)}__${mg(r.label)}` : ma(r.id),
          label:    type === 'campaign' ? mc(r.label) : type === 'group' ? mg(r.label) : ma(r.label),
          campaign: mc(r.campaign),
          ...(r.group !== undefined ? { group: mg(r.group) } : {}),
        }))
      : arr;
    const maskComparison = (arr: any[], type: 'campaign'|'group'|'ad') => IS_PORTFOLIO
      ? arr.map(r => ({
          ...r,
          key:      type === 'campaign' ? mc(r.key) : type === 'group' ? `${mc(r.campaign)}__${mg(r.group)}` : ma(r.key),
          campaign: mc(r.campaign),
          ...(r.group !== undefined ? { group: mg(r.group) } : {}),
          ...(r.ad    !== undefined ? { ad:    ma(r.ad)    } : {}),
          selected: tm(r.selected),
          compared: tm(r.compared),
          delta:    tm(r.delta),
        }))
      : arr;

    return NextResponse.json({
      media:             IS_PORTFOLIO ? maskChannel(media) : media,
      latestDate,
      periodSummary:     tm(periodSummary),
      periodDeltaPercent,
      trend:             IS_PORTFOLIO ? trend.map((r: any) => ({ date: r.date, ...tm(r) })) : trend,
      compareTrend:      IS_PORTFOLIO ? compareTrend.map((r: any) => ({ date: r.date, ...tm(r) })) : compareTrend,
      daily:             IS_PORTFOLIO ? daily.map((r: any) => ({ date: r.date, ...tm(r) })) : daily,
      bubbles: {
        campaign: maskBubbles(campaignBubbles, 'campaign'),
        group:    maskBubbles(groupBubbles,    'group'),
        ad:       maskBubbles(adBubbles,       'ad'),
      },
      hierarchy:    maskHierarchy(hierarchy),
      hierarchyCmp: maskHierarchy(hierarchyCmp),
      comparison: {
        campaign: maskComparison(campaignComparison, 'campaign'),
        group:    maskComparison(groupComparison,    'group'),
        ad:       maskComparison(adComparison,       'ad'),
      },
      selectedRange: selected,
      compareRange:  compared,
    });
  } catch (err: any) {
    console.error('[API /detail]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
