export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getBQClient, queryCrisisData, queryPortfolioMaxDate } from '@/lib/bigquery';
import { calcMetrics, calcDelta } from '@/lib/calculations';
import { IS_PORTFOLIO, ptable, maskChannel, transformMetrics, clampPortfolioDate, getPortfolioDateRange } from '@/lib/portfolio/transform';

const PROJECT = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;
const T        = `\`${PROJECT}.${DATASET}.all_marketing_data_partitioned\``;

async function bq(sql: string, params: Record<string, any> = {}) {
  const client = getBQClient();
  const [rows] = await client.query({ query: sql, params, useLegacySql: false });
  return rows as any[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  try {
    // 포트폴리오 모드: DB 최신 날짜 기준 1년 범위로 클램핑
    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string | null | undefined) => clampPortfolioDate(d, pRange);

    const requestedEnd = cp(searchParams.get('d1') ?? new Date().toISOString().slice(0, 10)) ?? (pRange.max || new Date().toISOString().slice(0, 10));
    const selStart     = cp(searchParams.get('selStart'));
    const selEnd       = cp(searchParams.get('selEnd') ?? requestedEnd);
    const cmpStart     = cp(searchParams.get('cmpStart'));
    const cmpEnd       = cp(searchParams.get('cmpEnd'));
    // ── BQ 최신 날짜 자동 탐색 ───────────────────────────────────────────────
    const latestRows = await bq(
      `SELECT CAST(MAX(DATE(date)) AS STRING) as latest_date
       FROM ${T}
       WHERE DATE(date) <= @requestedEnd AND IFNULL(imp,0) > 0`,
      { requestedEnd }
    );
    const d1End: string = latestRows[0]?.latest_date ?? requestedEnd;

    // ── periodStart/periodEnd → d1End 클램핑 (핵심 버그 픽스) ─────────────
    // selStart/selEnd가 d1End보다 미래면 d1End로 고정
    const clamp = (d: string | null) => (d && d <= d1End) ? d : d1End;
    const periodEnd   = clamp(selEnd)   ?? d1End;       // selEnd 미래면 d1End 클램핑
    const periodStart = clamp(selStart) ?? periodEnd;   // start도 클램핑
    const prevStart   = cmpStart ?? null;
    const prevEnd     = cmpEnd   ?? null;

    const [trendSel, trendCmp, channelSel, prevPeriod, bubble, crisisRaw] = await Promise.all([
      // trendSel: 단일일이면 종료일-6 ~ 종료일(7일), 기간이면 그대로
      bq((() => {
        const trendSelStart = periodStart === periodEnd
          ? `DATE_SUB(@periodEnd, INTERVAL 6 DAY)` : `@periodStart`;
        return `SELECT DATE(date) as date,
            SUM(IFNULL(imp,0))       as imp,
            SUM(IFNULL(click,0))     as click,
            SUM(IFNULL(cost,0))      as cost,
            SUM(IFNULL(applicant,0)) as applicant,
            SAFE_DIVIDE(SUM(IFNULL(click,0)),     NULLIF(SUM(IFNULL(imp,0)),0))       as ctr,
            SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(click,0)),0))     as cpc,
            SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa,
            SAFE_DIVIDE(SUM(IFNULL(applicant,0)), NULLIF(SUM(IFNULL(click,0)),0))     as cvr
          FROM ${T}
          WHERE DATE(date) BETWEEN ${trendSelStart} AND @periodEnd
            AND IFNULL(imp,0) > 0
          GROUP BY 1 ORDER BY 1`;
      })(), { periodStart, periodEnd }),

      // trendCmp: 비교기간 일별 실적 (포지션 매칭용)
      (() => {
        const isSingle = periodStart === periodEnd;
        const cmpS = isSingle
          ? `DATE_SUB(@periodEnd, INTERVAL 13 DAY)`
          : (prevStart ? `@prevStart` : `DATE_SUB(@periodStart, INTERVAL 1 DAY) - INTERVAL (DATEDIFF(@periodEnd,@periodStart)) DAY`);
        const cmpE = isSingle
          ? `DATE_SUB(@periodEnd, INTERVAL 7 DAY)`
          : (prevEnd ? `@prevEnd` : `DATE_SUB(@periodStart, INTERVAL 1 DAY)`);
        const params: any = { periodStart, periodEnd };
        if (prevStart) params.prevStart = prevStart;
        if (prevEnd)   params.prevEnd   = prevEnd;
        return bq(`SELECT DATE(date) as date,
                SUM(IFNULL(imp,0))       as imp,
                SUM(IFNULL(click,0))     as click,
                SUM(IFNULL(cost,0))      as cost,
                SUM(IFNULL(applicant,0)) as applicant,
                SAFE_DIVIDE(SUM(IFNULL(click,0)),     NULLIF(SUM(IFNULL(imp,0)),0))       as ctr,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(click,0)),0))     as cpc,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa,
                SAFE_DIVIDE(SUM(IFNULL(applicant,0)), NULLIF(SUM(IFNULL(click,0)),0))     as cvr
              FROM ${T}
              WHERE DATE(date) BETWEEN ${cmpS} AND ${cmpE}
                AND IFNULL(imp,0) > 0
              GROUP BY 1 ORDER BY 1`, params);
      })(),

      // 채널별 선택기간 일평균
      bq(`SELECT media,
            SUM(IFNULL(imp,0))       / COUNT(DISTINCT DATE(date)) as imp,
            SUM(IFNULL(click,0))     / COUNT(DISTINCT DATE(date)) as click,
            SUM(IFNULL(cost,0))      / COUNT(DISTINCT DATE(date)) as cost,
            SUM(IFNULL(applicant,0)) / COUNT(DISTINCT DATE(date)) as applicant,
            SAFE_DIVIDE(SUM(IFNULL(click,0)),     NULLIF(SUM(IFNULL(imp,0)),0))       as ctr,
            SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(click,0)),0))     as cpc,
            SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa,
            SAFE_DIVIDE(SUM(IFNULL(applicant,0)), NULLIF(SUM(IFNULL(click,0)),0))     as cvr
          FROM ${T}
          WHERE DATE(date) BETWEEN @periodStart AND @periodEnd
            AND IFNULL(imp,0) > 0
          GROUP BY 1`, { periodStart, periodEnd }),

      // 채널별 비교기간 일평균 (없으면 D-7)
      prevStart && prevEnd
        ? bq(`SELECT media,
                SUM(IFNULL(imp,0))       / COUNT(DISTINCT DATE(date)) as imp,
                SUM(IFNULL(click,0))     / COUNT(DISTINCT DATE(date)) as click,
                SUM(IFNULL(cost,0))      / COUNT(DISTINCT DATE(date)) as cost,
                SUM(IFNULL(applicant,0)) / COUNT(DISTINCT DATE(date)) as applicant,
                SAFE_DIVIDE(SUM(IFNULL(click,0)),     NULLIF(SUM(IFNULL(imp,0)),0))       as ctr,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(click,0)),0))     as cpc,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa,
                SAFE_DIVIDE(SUM(IFNULL(applicant,0)), NULLIF(SUM(IFNULL(click,0)),0))     as cvr
              FROM ${T}
              WHERE DATE(date) BETWEEN @prevStart AND @prevEnd AND IFNULL(imp,0) > 0
              GROUP BY 1`, { prevStart, prevEnd })
        : bq(`SELECT media,
                SUM(IFNULL(imp,0))       as imp,
                SUM(IFNULL(click,0))     as click,
                SUM(IFNULL(cost,0))      as cost,
                SUM(IFNULL(applicant,0)) as applicant,
                SAFE_DIVIDE(SUM(IFNULL(click,0)),     NULLIF(SUM(IFNULL(imp,0)),0))       as ctr,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(click,0)),0))     as cpc,
                SAFE_DIVIDE(SUM(IFNULL(cost,0)),      NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa,
                SAFE_DIVIDE(SUM(IFNULL(applicant,0)), NULLIF(SUM(IFNULL(click,0)),0))     as cvr
              FROM ${T}
              WHERE DATE(date) = DATE_SUB(@d1End, INTERVAL 7 DAY) AND IFNULL(imp,0) > 0
              GROUP BY 1`, { d1End }),

      // 버블: 선택기간 채널별 totals
      bq(`SELECT media,
            SUM(IFNULL(applicant,0)) as applicant,
            SUM(IFNULL(cost,0))      as cost,
            SAFE_DIVIDE(SUM(IFNULL(cost,0)), NULLIF(SUM(IFNULL(applicant,0)),0)) as cpa
          FROM ${T}
          WHERE DATE(date) BETWEEN @periodStart AND @periodEnd
            AND IFNULL(imp,0) > 0
          GROUP BY 1 HAVING applicant > 0`, { periodStart, periodEnd }),

      // Crisis data
      queryCrisisData(d1End),
    ]);

    // ── Crisis 처리 + deduplicate ────────────────────────────────────────────
    const calcCrisis = (curr: any, prev: any) => {
      const { deltaPercent } = calcDelta(calcMetrics(curr), calcMetrics(prev));
      const isAlert = deltaPercent.applicant <= -0.3 || deltaPercent.click <= -0.3
        || deltaPercent.cvr <= -0.3 || deltaPercent.cpa >= 0.3 || deltaPercent.cpc >= 0.3;
      return { applicant: deltaPercent.applicant, cpa: deltaPercent.cpa,
        click: deltaPercent.click, cvr: deltaPercent.cvr, cpc: deltaPercent.cpc, isAlert };
    };
    const seenMedia = new Set<string>();
    const crisisChannels = (crisisRaw as any[])
      .map(r => {
        const d1  = calcCrisis({ imp:r.d1_imp,  click:r.d1_click,  cost:r.d1_cost,  applicant:r.d1_app  },
                               { imp:r.d1p_imp, click:r.d1p_click, cost:r.d1p_cost, applicant:r.d1p_app });
        const r3  = calcCrisis({ imp:r.r3_imp,  click:r.r3_click,  cost:r.r3_cost,  applicant:r.r3_app  },
                               { imp:r.r3p_imp, click:r.r3p_click, cost:r.r3p_cost, applicant:r.r3p_app });
        const r7  = calcCrisis({ imp:r.r7_imp,  click:r.r7_click,  cost:r.r7_cost,  applicant:r.r7_app  },
                               { imp:r.r7p_imp, click:r.r7p_click, cost:r.r7p_cost, applicant:r.r7p_app });
        return {
          media: r.media,
          d1App: r.d1_app ?? 0,
          d1Cpa: r.d1_cost > 0 && r.d1_app > 0 ? r.d1_cost / r.d1_app : 0,
          d1VsPrevWeek: d1, recent3VsPrev3: r3, recent7VsPrev7: r7,
          isCrisis: d1.isAlert && (r3.isAlert || r7.isAlert),
        };
      })
      .filter(r => {
        if (!r.isCrisis || seenMedia.has(r.media)) return false;
        seenMedia.add(r.media);
        return true;
      });

    // A/B 테스트 (포트폴리오 모드에서는 portfolio_ab_tests 테이블 사용)
    let abTests: any[] = [];
    try {
      const AB_TABLE = `\`${PROJECT}.${DATASET}.${ptable('ab_tests')}\``;
      const rawAB = await bq(
        `SELECT test_id, test_name,
           CAST(test_date_start AS STRING) as test_date_start,
           CAST(test_date_end   AS STRING) as test_date_end,
           TO_JSON_STRING(test_rows) as test_rows_str
         FROM ${AB_TABLE}
         WHERE IFNULL(job_type, '') = 'Helper' OR IFNULL(job_type, '') = ''
         ORDER BY created_at DESC LIMIT 20`
      );
      abTests = rawAB.map((r: any) => {
        let channels: string[] = [];
        try {
          const rows = JSON.parse(r.test_rows_str ?? '[]');
          channels = [...new Set<string>(
            (Array.isArray(rows) ? rows : [])
              .filter((tr: any) => tr?.group === 'control' && tr?.media)
              .map((tr: any) => maskChannel(String(tr.media)))
          )];
        } catch {}
        return { test_id: r.test_id, test_name: r.test_name,
          test_date_start: r.test_date_start, test_date_end: r.test_date_end, channels };
      });
    } catch (e: any) { console.error('overview AB test error:', e.message); }

    const newChannels = await bq(`
      WITH
      recent AS (
        SELECT media,
          MIN(DATE(date)) as first_live,
          COUNT(DISTINCT DATE(date)) as days_active,
          SUM(IFNULL(applicant,0)) as total_app,
          SUM(IFNULL(cost,0)) as total_cost
        FROM ${T}
        WHERE DATE(date) BETWEEN DATE_SUB(@d1End, INTERVAL 27 DAY) AND @d1End
          AND IFNULL(imp,0) > 1
        GROUP BY media
      ),
      prior_window AS (
        SELECT DISTINCT media
        FROM ${T}
        WHERE DATE(date) BETWEEN DATE_SUB(@d1End, INTERVAL 41 DAY)
                              AND DATE_SUB(@d1End, INTERVAL 28 DAY)
          AND IFNULL(imp,0) > 1
      )
      SELECT r.media, r.first_live,
        r.days_active,
        r.total_app  / r.days_active as applicant,
        r.total_cost / r.days_active as cost,
        SAFE_DIVIDE(r.total_cost, NULLIF(r.total_app, 0)) as cpa
      FROM recent r
      LEFT JOIN prior_window pw USING(media)
      WHERE pw.media IS NULL
      ORDER BY r.first_live DESC`, { d1End });

    // 최근 7일 액션 레코드 (포트폴리오 모드에서는 portfolio_action_record 사용)
    let recentActions: any[] = [];
    try {
      const AR_TABLE = `\`${PROJECT}.${DATASET}.${ptable('action_record')}\``;
      recentActions = await bq(
        `SELECT id, channel, CAST(date AS STRING) as date, type, description,
                IFNULL(job_type, '') as job_type
         FROM ${AR_TABLE}
         WHERE date >= DATE_SUB(@d1End, INTERVAL 7 DAY)
           AND (IFNULL(job_type, '') = 'Helper' OR IFNULL(job_type, '') = '')
         ORDER BY date DESC, created_at DESC LIMIT 30`,
        { d1End }
      );
    } catch (e: any) { console.error('overview action_record error:', e.message); }

    // ── 포트폴리오 모드: 응답 직전 마스킹 + 수치 변환 ────────────────────────
    const maskMetricRow = (r: any) => {
      if (!IS_PORTFOLIO) return r;
      const m = transformMetrics({ imp: r.imp??0, click: r.click??0, cost: r.cost??0, applicant: r.applicant??0, ctr: r.ctr??0, cvr: r.cvr??0, cpc: r.cpc??0, cpa: r.cpa??0 });
      return { ...r, ...m };
    };

    const finalTrendSel      = IS_PORTFOLIO ? (trendSel as any[]).map(maskMetricRow) : trendSel;
    const finalTrendCmp      = IS_PORTFOLIO ? (trendCmp as any[]).map(maskMetricRow) : trendCmp;
    const finalChannelSel    = IS_PORTFOLIO ? (channelSel as any[]).map(r => ({ ...maskMetricRow(r), media: maskChannel(r.media) })) : channelSel;
    const finalPrevPeriod    = IS_PORTFOLIO ? (prevPeriod as any[]).map(r => ({ ...maskMetricRow(r), media: maskChannel(r.media) })) : prevPeriod;
    const finalBubble        = IS_PORTFOLIO ? (bubble as any[]).map(r => ({ ...maskMetricRow(r), media: maskChannel(r.media) })) : bubble;
    const finalCrisisChannels = IS_PORTFOLIO ? crisisChannels.map(r => ({ ...r, media: maskChannel(r.media) })) : crisisChannels;
    const finalNewChannels   = IS_PORTFOLIO ? (newChannels as any[]).map(r => ({ ...maskMetricRow(r), media: maskChannel(r.media) })) : newChannels;
    const finalRecentActions = IS_PORTFOLIO ? recentActions.map(r => ({ ...r, channel: maskChannel(r.channel) })) : recentActions;

    return NextResponse.json({
      latestDate: d1End,
      periodStart, periodEnd,
      prevStart, prevEnd,
      trendSel:       finalTrendSel,
      trendCmp:       finalTrendCmp,
      channelSel:     finalChannelSel,
      prevPeriod:     finalPrevPeriod,
      bubble:         finalBubble,
      crisisChannels: finalCrisisChannels,
      abTests,
      newChannels:    finalNewChannels,
      recentActions:  finalRecentActions,
    });

  } catch (e: any) {
    console.error('overview API error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
