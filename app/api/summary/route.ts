export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  queryDailyMetrics,
  queryChannelMetrics,
  queryCrisisData,
  queryApplicantTrend,
} from '@/lib/bigquery';
import { calcMetrics, calcDelta, calcTrend } from '@/lib/calculations';
import { calcComparePeriod } from '@/lib/dateUtils';
import type { DateRange } from '@/lib/types';
import { IS_PORTFOLIO, maskChannel, transformMetrics } from '@/lib/portfolio/transform';

export const revalidate = 3600;

/** raw row → 모든 computed 지표 포함 trend point */
function toTrendPoint(r: any) {
  const imp       = r.imp       ?? 0;
  const click     = r.click     ?? 0;
  const cost      = r.cost      ?? 0;
  const applicant = r.applicant ?? 0;
  const ctr = imp   > 0 ? click     / imp   : 0;
  const cpc = click > 0 ? cost      / click : 0;
  const cpa = applicant > 0 ? cost  / applicant : 0;
  const cvr = click > 0 ? applicant / click : 0;
  return { date: r.date, imp, click, cost, applicant, ctr, cpc, cpa, cvr };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const start    = searchParams.get('start')!;
    const end      = searchParams.get('end')!;
    const cmpStart = searchParams.get('cmpStart');
    const cmpEnd   = searchParams.get('cmpEnd');

    const selected: DateRange = { start, end };
    const compared: DateRange = cmpStart && cmpEnd
      ? { start: cmpStart, end: cmpEnd }
      : calcComparePeriod(selected);

    const [dailyRaw, channelSel, channelCmp, crisisRaw, trendRaw, compareTrendRaw] = await Promise.all([
      queryDailyMetrics(selected),
      queryChannelMetrics(selected),
      queryChannelMetrics(compared),
      queryCrisisData(selected.end),
      queryApplicantTrend(selected),
      queryApplicantTrend(compared),
    ]);

    // Period Summary (선택 기간 합계) — D-1 고정값 대신
    const periodTotal = calcMetrics(
      dailyRaw.reduce(
        (acc: any, r: any) => ({
          imp:       acc.imp       + (r.imp       ?? 0),
          click:     acc.click     + (r.click     ?? 0),
          cost:      acc.cost      + (r.cost      ?? 0),
          applicant: acc.applicant + (r.applicant ?? 0),
        }),
        { imp: 0, click: 0, cost: 0, applicant: 0 }
      )
    );
    // 비교기간 합계 + 델타%
    const compareTotalRaw = compareTrendRaw.reduce(
      (acc: any, r: any) => ({
        imp: acc.imp + (r.imp ?? 0), click: acc.click + (r.click ?? 0),
        cost: acc.cost + (r.cost ?? 0), applicant: acc.applicant + (r.applicant ?? 0),
      }), { imp: 0, click: 0, cost: 0, applicant: 0 }
    );
    const compareTotal = calcMetrics(compareTotalRaw);
    const { deltaPercent: periodDeltaPercent } = calcDelta(periodTotal, compareTotal);

    // Daily metrics
    const daily = dailyRaw.map((r: any) => ({
      date: r.date,
      ...calcMetrics(r),
    }));

    // Trend — 선택 기간 전 컬럼
    const trend = trendRaw.map(toTrendPoint);

    // Compare Trend — 비교 기간 전 컬럼
    const compareTrend = compareTrendRaw.map(toTrendPoint);

    // Channel metrics with comparison
    const channelMap = new Map(channelCmp.map((r: any) => [r.media, calcMetrics(r)]));
    const channels = channelSel.map((r: any) => {
      const selMetrics = calcMetrics(r);
      const cmpMetrics = channelMap.get(r.media) ?? calcMetrics({});
      const { delta, deltaPercent } = calcDelta(selMetrics, cmpMetrics);
      const { trend: trendDir, pct: trendPct } = calcTrend(selMetrics.cpa, cmpMetrics.cpa, selMetrics.applicant, cmpMetrics.applicant);
      return { media: r.media, selected: selMetrics, compared: cmpMetrics, delta, deltaPercent, trend: trendDir, trendPct };
    });

    // Crisis data
    const crisisChannels = crisisRaw.map((r: any) => {
      const calcCrisis = (curr: any, prev: any) => {
        const cMetrics = calcMetrics(curr);
        const pMetrics = calcMetrics(prev);
        const { deltaPercent } = calcDelta(cMetrics, pMetrics);
        const appCrisis   = deltaPercent.applicant <= -0.3;
        const clickCrisis = deltaPercent.click     <= -0.3;
        const cvrCrisis   = deltaPercent.cvr       <= -0.3;
        const cpaCrisis   = deltaPercent.cpa       >= 0.3;
        const cpcCrisis   = deltaPercent.cpc       >= 0.3;
        return { applicant: deltaPercent.applicant, click: deltaPercent.click, cvr: deltaPercent.cvr, cpa: deltaPercent.cpa, cpc: deltaPercent.cpc, isAlert: appCrisis || clickCrisis || cvrCrisis || cpaCrisis || cpcCrisis };
      };
      const d1Comp = calcCrisis({ imp: r.d1_imp, click: r.d1_click, cost: r.d1_cost, applicant: r.d1_app }, { imp: r.d1p_imp, click: r.d1p_click, cost: r.d1p_cost, applicant: r.d1p_app });
      const r3Comp = calcCrisis({ imp: r.r3_imp, click: r.r3_click, cost: r.r3_cost, applicant: r.r3_app }, { imp: r.r3p_imp, click: r.r3p_click, cost: r.r3p_cost, applicant: r.r3p_app });
      const r7Comp = calcCrisis({ imp: r.r7_imp, click: r.r7_click, cost: r.r7_cost, applicant: r.r7_app }, { imp: r.r7p_imp, click: r.r7p_click, cost: r.r7p_cost, applicant: r.r7p_app });
      const isCrisis = d1Comp.isAlert && (r3Comp.isAlert || r7Comp.isAlert);
      return { media: r.media, d1VsPrevWeek: d1Comp, recent3VsPrev3: r3Comp, recent7VsPrev7: r7Comp, isCrisis };
    });

    // ── 포트폴리오 모드: 마스킹 + 수치 변환 ─────────────────────────────────
    const tm = (m: any) => IS_PORTFOLIO ? transformMetrics(m) : m;

    const finalPeriodTotal  = tm(periodTotal);
    const finalDaily        = IS_PORTFOLIO ? daily.map((r: any) => ({ date: r.date, ...tm(r) })) : daily;
    const finalTrend        = IS_PORTFOLIO ? trend.map((r: any) => ({ date: r.date, ...tm(r) })) : trend;
    const finalCompareTrend = IS_PORTFOLIO ? compareTrend.map((r: any) => ({ date: r.date, ...tm(r) })) : compareTrend;
    const finalChannels     = IS_PORTFOLIO
      ? channels.map((c: any) => ({
          ...c,
          media:    maskChannel(c.media),
          selected: tm(c.selected),
          compared: tm(c.compared),
          delta:    tm(c.delta),
        }))
      : channels;
    const finalCrisis = IS_PORTFOLIO
      ? crisisChannels.map((c: any) => ({ ...c, media: maskChannel(c.media) }))
      : crisisChannels;

    return NextResponse.json({
      periodTotal:       finalPeriodTotal,
      periodDeltaPercent,
      daily:             finalDaily,
      trend:             finalTrend,
      compareTrend:      finalCompareTrend,
      channels:          finalChannels,
      crisis:            finalCrisis,
      selectedRange:     selected,
      compareRange:      compared,
    });
  } catch (err: any) {
    console.error('[API /summary]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
