import { NextRequest, NextResponse } from 'next/server';
import { querySeasonalityData, queryRecentTrend } from '@/lib/bigquery';
import { isHoliday, addDays, formatDate } from '@/lib/dateUtils';
import type { WeekForecast, DayForecast } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** 향후 8주 예측 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const weekBudgetRaw = searchParams.get('weekBudget');
    const weekBudgetOverride: Record<string, number> = weekBudgetRaw
      ? JSON.parse(weekBudgetRaw)
      : {};

    const [seasonalRaw, trendRaw] = await Promise.all([
      querySeasonalityData(),
      queryRecentTrend(),
    ]);

    if (!trendRaw.length) {
      return NextResponse.json({ weeks: [] });
    }

    const recent14 = trendRaw.slice(-14);
    const avgApplicant = recent14.reduce((s: number, r: any) => s + Number(r.applicant || 0), 0) / recent14.length;
    const avgCost      = recent14.reduce((s: number, r: any) => s + Number(r.cost || 0), 0) / recent14.length;

    const seasonMap: Record<string, { sum: number; count: number }> = {};
    for (const row of seasonalRaw as any[]) {
      const key = `${row.month}_${row.dow}`;
      if (!seasonMap[key]) seasonMap[key] = { sum: 0, count: 0 };
      seasonMap[key].sum   += Number(row.avg_applicant || 0);
      seasonMap[key].count += 1;
    }

    const allAvgs = Object.values(seasonMap).map(v => v.sum / v.count);
    const globalAvg = allAvgs.reduce((s, v) => s + v, 0) / (allAvgs.length || 1);

    function getSeasonIndex(dateStr: string): number {
      const d = new Date(dateStr);
      const month = d.getMonth() + 1;
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const key = `${month}_${dow}`;
      const entry = seasonMap[key];
      if (!entry || globalAvg === 0) return 1.0;
      return (entry.sum / entry.count) / globalAvg;
    }

    function predictDay(dateStr: string, costOverride?: number): DayForecast {
      const holiday = isHoliday(dateStr);
      const seasonIdx = holiday ? 0.3 : getSeasonIndex(dateStr);
      const base = avgApplicant * seasonIdx;

      let costFactor = 1.0;
      if (costOverride !== undefined && avgCost > 0) {
        costFactor = Math.log(costOverride / 1000 + 1) / Math.log(avgCost / 1000 + 1);
        costFactor = Math.max(0, Math.min(3, costFactor));
      }

      const predicted = Math.max(0, base * costFactor);
      const sigma = predicted * 0.2;
      const d = new Date(dateStr);
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

      return {
        date: dateStr,
        dayOfWeek: dayNames[d.getDay()],
        applicant: Math.round(predicted * 10) / 10,
        applicantLow:  Math.max(0, Math.round((predicted - sigma) * 10) / 10),
        applicantHigh: Math.round((predicted + sigma) * 10) / 10,
        cpa: predicted > 0 && avgCost > 0 ? Math.round(avgCost / predicted) : 0,
        isHoliday: holiday,
      };
    }

    const todayDate = new Date();
    const dayOfWeek = todayDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = formatDate(new Date(todayDate.getTime() + daysToMonday * 86400000));

    const weeks: WeekForecast[] = [];

    for (let w = 0; w < 8; w++) {
      const weekStart = addDays(thisMonday, w * 7);
      const weekEnd   = addDays(weekStart, 6);
      const weekLabel = `W${getISOWeek(parseDate(weekStart))} (${weekStart.slice(5)})`;

      const weekBudget = weekBudgetOverride[weekLabel] ?? undefined;
      const dailyCostOverride = weekBudget ? weekBudget / 7 : undefined;

      const days: DayForecast[] = [];
      for (let d = 0; d < 7; d++) {
        const dayStr = addDays(weekStart, d);
        days.push(predictDay(dayStr, dailyCostOverride));
      }

      const totalApp = days.reduce((s, d) => s + d.applicant, 0);
      const sigma    = totalApp * 0.2;

      weeks.push({
        weekLabel,
        startDate: weekStart,
        endDate: weekEnd,
        applicant:     Math.round(totalApp * 10) / 10,
        applicantLow:  Math.max(0, Math.round((totalApp - sigma) * 10) / 10),
        applicantHigh: Math.round((totalApp + sigma) * 10) / 10,
        cpa: totalApp > 0 && avgCost > 0 ? Math.round((avgCost * 7) / totalApp) : 0,
        cvr: avgApplicant > 0 ? 0.03 : 0,
        days,
      });
    }

    return NextResponse.json({
      weeks,
      basedOn: {
        recentDays: recent14.length,
        avgApplicant: Math.round(avgApplicant * 10) / 10,
        avgCost: Math.round(avgCost),
      },
    });
  } catch (err: any) {
    console.error('[API /forecast]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getISOWeek(d: Date): number {
  const dayOfYear = (d: Date) => {
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000);
  };
  return Math.ceil(dayOfYear(d) / 7);
}
