import { NextRequest, NextResponse } from 'next/server';
import { queryInsights, queryPortfolioMaxDate } from '@/lib/bigquery';
import { calcMetrics } from '@/lib/calculations';
import type { DateRange } from '@/lib/types';
import { IS_PORTFOLIO, maskAd, transformMetrics, clampPortfolioDate, getPortfolioDateRange, portfolioMediaSQL } from '@/lib/portfolio/transform';

export const dynamic = 'force-dynamic';

function normalizeArr(vals: number[]): number[] {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return vals.map(() => 0.5);
  return vals.map(v => (v - min) / (max - min));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    // 포트폴리오 모드: DB 최신 날짜 기준 1년 범위로 클램핑
    const pRange = IS_PORTFOLIO ? getPortfolioDateRange(await queryPortfolioMaxDate()) : { min: '', max: '' };
    const cp = (d: string | null | undefined) => clampPortfolioDate(d, pRange);

    const start  = cp(searchParams.get('start'))  ?? searchParams.get('start')!;
    const end    = cp(searchParams.get('end'))    ?? searchParams.get('end')!;
    const media  = searchParams.get('media') || undefined;
    const type   = searchParams.get('type')   ?? 'combo'; // combo | image | text
    const sortBy = searchParams.get('sortBy') ?? 'score'; // score | cpa | ctr | cvr

    const range: DateRange = { start, end };
    const raw = await queryInsights(range, media, portfolioMediaSQL());

    const extract = (v: any) => {
      if (v == null) return null;
      if (typeof v === 'object' && 'value' in v) return v.value;
      return v;
    };

    const rows = raw.map((r: any) => ({
      image_code:    extract(r.image_code),
      text_code:     extract(r.text_code),
      image_content: extract(r.image_content),
      text_content:  extract(r.text_content),
      metrics: calcMetrics({
        imp:       Number(extract(r.imp)       ?? 0),
        click:     Number(extract(r.click)     ?? 0),
        cost:      Number(extract(r.cost)      ?? 0),
        applicant: Number(extract(r.applicant) ?? 0),
      }),
    }));

    if (!rows.length) return NextResponse.json({ items: [] });

    // 이상치 필터링
    const validRows = rows.filter((r: any) => {
      const m = r.metrics;
      if (m.cpa  > 0    && m.cpa  < 100)    return false; // CPA 100원 미만
      if (m.cvr  > 0.5)                      return false; // CVR 50% 초과
      if (m.ctr  > 0.5)                      return false; // CTR 50% 초과
      if (m.applicant  <= 10)                return false; // 지원자 10명 이하
      if (m.imp        <= 1000)              return false; // 노출 1,000 이하
      if (m.click      <= 100)               return false; // 클릭 100 이하
      if (m.cost       <= 100000)            return false; // 비용 10만원 이하
      return true;
    });

    // type 필터
    let filtered = validRows;
    if (type === 'image') {
      filtered = validRows.filter((r: any) => r.image_code && r.image_code !== '-');
    } else if (type === 'text') {
      filtered = validRows.filter((r: any) => r.text_code && r.text_code !== '-');
    }

    // 스코어 계산
    const cpas = filtered.map((r: any) => r.metrics.cpa);
    const ctrs = filtered.map((r: any) => r.metrics.ctr);
    const cvrs = filtered.map((r: any) => r.metrics.cvr);

    const normCpa = normalizeArr(cpas).map(v => 1 - v);
    const normCtr = normalizeArr(ctrs);
    const normCvr = normalizeArr(cvrs);

    const scored = filtered.map((r: any, i: number) => ({
      ...r,
      score: normCpa[i] * 0.5 + normCtr[i] * 0.3 + normCvr[i] * 0.2,
    }));

    // 정렬
    const sorted = scored.sort((a: any, b: any) => {
      if (sortBy === 'cpa') return a.metrics.cpa - b.metrics.cpa; // 낮을수록 좋음
      if (sortBy === 'ctr') return b.metrics.ctr - a.metrics.ctr;
      if (sortBy === 'cvr') return b.metrics.cvr - a.metrics.cvr;
      return b.score - a.score; // default: score
    });

    const top10 = sorted.slice(0, 10).map((r: any, idx: number) => ({
      rank: idx + 1,
      image_code:    IS_PORTFOLIO ? maskAd(r.image_code)   : (r.image_code    ?? null),
      text_code:     IS_PORTFOLIO ? maskAd(r.text_code)    : (r.text_code     ?? null),
      image_content: IS_PORTFOLIO ? null : (r.image_content ?? null),
      text_content:  IS_PORTFOLIO ? null : (r.text_content  ?? null),
      score: Math.round(r.score * 1000) / 1000,
      metrics: IS_PORTFOLIO ? transformMetrics(r.metrics) : r.metrics,
    }));

    return NextResponse.json({ items: top10 });
  } catch (err: any) {
    console.error('[API /insights]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
