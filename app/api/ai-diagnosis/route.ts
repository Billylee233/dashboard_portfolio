import { NextRequest, NextResponse } from 'next/server';
import { queryAIDiagnosisInput, getAIDiagnosis, saveAIDiagnosis, queryCrisisData } from '@/lib/bigquery';
import { calcMetrics, calcDelta, isCrisisCondition } from '@/lib/calculations';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

// ── 위기 판단 공통 함수 ────────────────────────────────────────────────────────
function calcCrisisFlag(curr: any, prev: any): boolean {
  const cM = calcMetrics(curr);
  const pM = calcMetrics(prev);
  const { deltaPercent } = calcDelta(cM, pM);
  return (
    isCrisisCondition(deltaPercent.applicant, false) ||
    isCrisisCondition(deltaPercent.click,     false) ||
    isCrisisCondition(deltaPercent.cvr,       false) ||
    isCrisisCondition(deltaPercent.cpa,       true)  ||
    isCrisisCondition(deltaPercent.cpc,       true)
  );
}

function checkIsCrisis(r: any): boolean {
  const d1 = calcCrisisFlag(
    { imp: r.d1_imp, click: r.d1_click, cost: r.d1_cost, applicant: r.d1_app },
    { imp: r.d1p_imp, click: r.d1p_click, cost: r.d1p_cost, applicant: r.d1p_app }
  );
  const r3 = calcCrisisFlag(
    { imp: r.r3_imp, click: r.r3_click, cost: r.r3_cost, applicant: r.r3_app },
    { imp: r.r3p_imp, click: r.r3p_click, cost: r.r3p_cost, applicant: r.r3p_app }
  );
  const r7 = calcCrisisFlag(
    { imp: r.r7_imp, click: r.r7_click, cost: r.r7_cost, applicant: r.r7_app },
    { imp: r.r7p_imp, click: r.r7p_click, cost: r.r7p_cost, applicant: r.r7p_app }
  );
  return d1 && (r3 || r7);
}

// ── GET: 캐시 조회 + 위기 상태 불일치 시 stale 반환 ──────────────────────────
export async function GET(req: NextRequest) {
  const media = req.nextUrl.searchParams.get('media')!;
  const diagnosis = await getAIDiagnosis(media);

  try {
    const crisisRows = await queryCrisisData();
    const row = crisisRows.find((r: any) => r.media === media);
    if (row) {
      const currentlyCrisis = checkIsCrisis(row);
      const cachedCrisis = diagnosis?.status === '주의';
      // 캐시와 현재 위기 상태가 다르면 stale
      if (diagnosis && cachedCrisis !== currentlyCrisis) {
        return NextResponse.json({ diagnosis: null, stale: true });
      }
    }
  } catch (_) {
    // crisis 체크 실패 시 기존 캐시 반환
  }

  return NextResponse.json({ diagnosis });
}

// ── POST: 진단 실행 ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { media } = await req.json();
    if (!media) return NextResponse.json({ error: 'media required' }, { status: 400 });

    // 1. 위기 여부 판단
    const crisisRows = await queryCrisisData();
    const row = crisisRows.find((r: any) => r.media === media);

    if (!row) {
      return NextResponse.json({ skipped: true, message: '데이터 없음' });
    }

    const isCrisis = checkIsCrisis(row);

    if (!isCrisis) {
      const result = {
        media,
        status: '우수',
        summary: `${media} 채널은 현재 정상 범위입니다. 주요 지표 변화가 임계값(30%) 이내입니다.`,
        cause: null,
        action: null,
      };
      await saveAIDiagnosis(result);
      return NextResponse.json({ diagnosis: result, aiUsed: false });
    }

    // 2. 진단 데이터 준비
    const diagData = await queryAIDiagnosisInput(media);

    // 데이터 없으면 Gemini 호출 불가 → 위기 확인됐으므로 주의로 저장
    if (!diagData || diagData.length === 0) {
      const result = {
        media,
        status: '주의',
        summary: `${media} 채널에서 위기 지표가 감지됐습니다. 상세 데이터를 확인하세요.`,
        cause: null,
        action: null,
      };
      await saveAIDiagnosis(result);
      return NextResponse.json({ diagnosis: result, aiUsed: false });
    }

    const dataStr = diagData
      .map((r: any) =>
        `${r.date}: 지원자=${r.applicant ?? 0}, CPA=${r.cpa ?? 0}, CVR=${r.cvr ?? 0}, 클릭=${r.click ?? 0}, 비용=${r.cost ?? 0}`
      )
      .join('\n');

    const prompt = `당신은 퍼포먼스 마케팅 전문가입니다. 아래 채널의 최근 14일 일자별 실적을 분석해주세요.

채널명: ${media}
분석 기간: 최근 14일

[일자별 실적]
${dataStr}

다음 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{"status":"주의","summary":"1줄 핵심 진단 (50자 이내)","cause":"원인 분석 (2~3줄, 마크다운 불릿 사용)","action":"대응 방안 (2~3줄, 마크다운 불릿 사용)"}

status는 반드시 "주의"로만 응답하세요. 원인은 데이터에서 보이는 패턴 기반으로 작성하세요.`;

    // 3. Gemini 호출 (모델 순서대로 폴백)
    console.log('[AI-diagnosis] GEMINI_API_KEY 길이:', GEMINI_API_KEY?.length ?? 'undefined');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다');
    }
    let geminiResult: any = null;
    let lastError = '';

    for (const model of GEMINI_MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
            }),
          }
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          lastError = `${model} error ${res.status}: ${errBody.slice(0, 150)}`;
          continue; // 다음 모델 시도
        }

        const json = await res.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const clean = rawText.replace(/```json|```/g, '').trim();
        geminiResult = JSON.parse(clean);
        break; // 성공
      } catch (e: any) {
        lastError = `${model} parse error: ${e.message}`;
        continue;
      }
    }

    // 4. Gemini 완전 실패 시 자체 분석 결과로 폴백
    if (!geminiResult) {
      console.error('[AI-diagnosis] Gemini 모든 모델 실패:', lastError);
      const result = {
        media,
        status: '주의',
        summary: `${media} 채널에서 위기 지표가 감지됐습니다. (AI 분석 일시 불가)`,
        cause: `- D-1 지표에서 임계값(30%) 초과 변화 감지\n- 최근 3일 또는 7일 추세도 이상 신호\n- 상세 분석: Hierarchy Daily Performance 확인 필요`,
        action: `- 즉시 캠페인 입찰가 및 예산 점검\n- 소재 성과 이상 여부 확인\n- 필요 시 AI 진단하기 재시도`,
      };
      await saveAIDiagnosis(result);
      return NextResponse.json({ diagnosis: result, aiUsed: false, geminiError: lastError });
    }

    const result = {
      media,
      status: geminiResult.status || '주의',
      summary: geminiResult.summary || '위기 지표 감지',
      cause: geminiResult.cause || null,
      action: geminiResult.action || null,
    };

    await saveAIDiagnosis(result);
    return NextResponse.json({ diagnosis: result, aiUsed: true });

  } catch (err: any) {
    console.error('[API /ai-diagnosis]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
