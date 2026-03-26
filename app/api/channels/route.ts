import { NextRequest, NextResponse } from 'next/server';
import { queryDistinctMedia, queryActiveChannels } from '@/lib/bigquery';
import { IS_PORTFOLIO, maskChannel, filterPortfolioChannels } from '@/lib/portfolio/transform';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const selStart = p.get('selStart');
    const selEnd = p.get('selEnd');
    const cmpStart = p.get('cmpStart');
    const cmpEnd = p.get('cmpEnd');

    const channels = (selStart && selEnd && cmpStart && cmpEnd)
      ? await queryActiveChannels(selStart, selEnd, cmpStart, cmpEnd)
      : await queryDistinctMedia();

    const allowed       = filterPortfolioChannels(channels);
    const finalChannels = IS_PORTFOLIO ? allowed.map(maskChannel) : allowed;
    return NextResponse.json({ channels: finalChannels });
  } catch (err: any) {
    return NextResponse.json({ channels: [], error: err.message }, { status: 500 });
  }
}
