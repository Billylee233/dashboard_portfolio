import { NextRequest } from 'next/server';
import { getBQClient } from '@/lib/bigquery';
import { IS_PORTFOLIO, PORTFOLIO_CHANNELS, buildReverseChannelMap } from '@/lib/portfolio/transform';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const MODEL             = 'claude-sonnet-4-6';

const PROJECT  = process.env.NEXT_PUBLIC_BQ_PROJECT_ID!;
const DATASET  = process.env.NEXT_PUBLIC_BQ_DATASET!;
const MAIN_T   = `\`${PROJECT}.${DATASET}.all_marketing_data_partitioned\``;
const SA_T     = '`n8n-credential-483211.all_position_sa.sa_merged_table`';
const HIST_T   = `\`${PROJECT}.${DATASET}.portfolio_agent_history\``;

// ── 채널명 역변환 맵 ──────────────────────────────────────────────────────────
const REVERSE_MAP = buildReverseChannelMap([...PORTFOLIO_CHANNELS]);

function resolveMedia(maskedMedia: string): string {
  if (!IS_PORTFOLIO) return maskedMedia;
  return REVERSE_MAP.get(maskedMedia) ?? maskedMedia;
}

// ── 테이블/SA 판단 ────────────────────────────────────────────────────────────
function getTableConfig(realMedia: string) {
  const isSA = realMedia.startsWith('SA_');
  return {
    isSA,
    table: isSA ? SA_T : MAIN_T,
    // SA 테이블은 헬퍼 = 'H'로 고정 (포트폴리오는 헬퍼 단일)
    jobFilter: isSA ? `AND job_position = 'H'` : '',
  };
}

// ── BQ 실행 ───────────────────────────────────────────────────────────────────
async function runBQ(sql: string): Promise<any[]> {
  const bq = getBQClient();
  const [rows] = await bq.query({ query: sql, useLegacySql: false });
  return rows;
}

// ── 대화 BQ 저장 ──────────────────────────────────────────────────────────────
async function saveHistory(media: string, question: string, answer: string) {
  try {
    const bq = getBQClient();
    await bq.query({
      query: `
        INSERT INTO ${HIST_T} (id, job_position, media, chat_date, question, answer, created_at)
        VALUES (GENERATE_UUID(), 'portfolio', @media, CURRENT_DATE('Asia/Seoul'), @question, @answer, CURRENT_TIMESTAMP())`,
      useLegacySql: false,
      params: { media, question, answer },
    });
  } catch (e) {
    console.error('[saveHistory]', e);
  }
}

// ── Claude API 호출 ───────────────────────────────────────────────────────────
async function callClaude(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 2000,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content[0]?.text ?? '';
}

// ── JSON 안전 파싱 ────────────────────────────────────────────────────────────
function safeJSON(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('JSON 파싱 실패');
  }
}

// ── 전주 동요일 비교기간 계산 ─────────────────────────────────────────────────
function prevPeriod(start: string, end: string) {
  const s    = new Date(start + 'T12:00:00Z');
  const e    = new Date(end   + 'T12:00:00Z');
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const ps   = new Date(s); ps.setUTCDate(ps.getUTCDate() - 7);
  const pe   = new Date(ps); pe.setUTCDate(pe.getUTCDate() + days - 1);
  return { ps: ps.toISOString().slice(0, 10), pe: pe.toISOString().slice(0, 10) };
}

const fmtRows = (rows: any[]) =>
  rows.length === 0 ? '데이터 없음' : JSON.stringify(rows.slice(0, 30), null, 2);

// ── 질문 유형 판단 ────────────────────────────────────────────────────────────
function detectQueryType(question: string): 'lookup' | 'analysis' {
  if (/알려줘|보여줘|뭐야|뭐예요|목록|리스트|몇\s?개|어디야|얼마야|top\s?\d|순위|랭킹|키워드.*줘|줘.*키워드|캠페인.*줘|소재.*줘|off.*키워드|키워드.*off|꺼야\s?할|끄면|pause|일시정지.*목록/i.test(question)) {
    return 'lookup';
  }
  if (/왜|이유|원인|어떻게|분석|진단|문제|개선/.test(question)) return 'analysis';
  return 'analysis';
}

function detectIntent(question: string): 'improve' | 'worsen' | 'neutral' {
  if (/좋아|개선|올랐|상승|높아진 이유|왜 잘|효율 좋|성과 좋|증가|회복/.test(question)) return 'improve';
  if (/나빠|악화|떨어|하락|낮아|왜 안|비효율|문제|이유가 뭐|왜 높|CPA.*높|비용.*올/.test(question)) return 'worsen';
  return 'neutral';
}

// ══════════════════════════════════════════════════════════════════════════════
// 단순 조회 에이전트
// ══════════════════════════════════════════════════════════════════════════════
async function* runLookup(params: {
  question: string; media: string; realMedia: string;
  history: { question: string; answer: string }[];
}) {
  const { question, media, realMedia, history } = params;
  const cfg = getTableConfig(realMedia);

  yield { type: 'status', step: 1, message: '🔍 데이터 조회 중...' };

  const system = `당신은 퍼포먼스 마케팅 분석 전문가입니다.
현재 분석: 채널 ${media} | 최근 21일

[절대 규칙]
- 조회된 데이터에 있는 값만 사용하세요.
- 키워드명, 캠페인명, 소재명은 데이터에서 가져온 실제 값만 사용하세요. 절대 추측하거나 만들어내지 마세요.
- 데이터가 부족하면 "데이터에서 확인된 항목만 제공합니다"라고 명시하세요.`;

  const ctx = [
    ...history.flatMap(h => [
      { role: 'user', content: h.question },
      { role: 'assistant', content: h.answer },
    ]),
    { role: 'user', content: question },
  ];

  const historyContext = history.length > 0
    ? `[이전 대화 컨텍스트]
이전 대화 내용을 참고하여 SQL을 작성하세요.
사용자가 지시어("이 캠페인", "그 날짜" 등)를 사용하면 이전 대화에서 언급된 실제 값을 사용하세요.
이전 대화에서 특정 날짜가 언급되었으면 그 날짜로 필터링하세요.`
    : '';

  const sqlGenRaw = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `사용자 질문에 답하는 BigQuery SQL을 작성하세요.

${cfg.isSA ? `[SA 채널 테이블 구조]
SA 채널은 아래 테이블에서 키워드 단위까지 조회 가능합니다.
- 테이블: ${cfg.table}
- 컬럼: campaign_kr(캠페인명), \`group\`(그룹명), keyword(키워드), date, media, job_position, imp, click, cost, applicant
- 전환 0건 키워드: applicant = 0 AND click > 0 AND cost > 0` :
`[테이블]
- 테이블: ${cfg.table}
- 컬럼: campaign(캠페인), \`group\`(그룹), ad(소재), date, media, imp, click, cost, applicant`}

[SQL 작성 조건]
- WHERE media = '${realMedia}' ${cfg.jobFilter} 필수
- 날짜 조건: 이전 대화에서 특정 날짜 언급 시 그 날짜 사용, 없으면 최근 21일
- WITH base AS(...) CTE 패턴 사용, 파생지표는 외부에서 CASE WHEN으로 계산
- LIMIT 50 이하
- SQL만 반환, 코드블록 없이

${historyContext}

[현재 질문]: ${question}`,
    },
  ]);

  const sql = sqlGenRaw.replace(/```sql|```/g, '').trim();
  if (!sql.toUpperCase().startsWith('SELECT') && !sql.toUpperCase().startsWith('WITH')) {
    yield { type: 'content', step: 1, content: '조회 가능한 질문 형태가 아닙니다.' };
    yield { type: 'done', answer: '조회 가능한 질문 형태가 아닙니다.' };
    return;
  }

  let rows: any[];
  try {
    rows = await runBQ(sql);
  } catch (bqErr: any) {
    throw new Error(`데이터 조회 오류: ${bqErr.message}`);
  }

  // 0건이면 최근 21일로 완화 재시도
  if (rows.length === 0) {
    const retrySqlRaw = await callClaude(system, [
      ...ctx,
      {
        role: 'user',
        content: `이전 SQL 조회 결과가 0건이었습니다. 날짜 조건을 최근 21일로 완화하여 다시 SQL을 작성하세요.

${cfg.isSA ? `[SA 채널 테이블]
- 테이블: ${cfg.table}
- 컬럼: campaign_kr, \`group\`, keyword, date, media, job_position, imp, click, cost, applicant` :
`[테이블]
- 테이블: ${cfg.table}
- 컬럼: campaign, \`group\`, ad, date, media, imp, click, cost, applicant`}

- WHERE media = '${realMedia}' ${cfg.jobFilter} 필수
- date >= DATE_SUB(CURRENT_DATE(), INTERVAL 21 DAY)
- WITH base AS CTE 패턴, LIMIT 50
- SQL만 반환

[질문]: ${question}`,
      },
    ]);
    const retrySql = retrySqlRaw.replace(/```sql|```/g, '').trim();
    if (retrySql.toUpperCase().startsWith('SELECT') || retrySql.toUpperCase().startsWith('WITH')) {
      try {
        const retryRows = await runBQ(retrySql);
        if (retryRows.length > 0) rows = retryRows;
      } catch {}
    }
  }

  yield { type: 'content', step: 1, content: `${rows.length}건 조회 완료` };
  yield { type: 'status', step: 5, message: '💡 결과 정리 중...' };

  const answer = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `아래 조회 결과로 질문에 답하세요.

[질문]: ${question}
[조회 결과]:
${fmtRows(rows)}

[규칙]
- 위 데이터에 있는 값만 사용하세요. 없는 항목은 절대 추가하지 마세요.
- 숫자는 구체적으로 (CPA 12,500원, 지원자 23명 등)
- 마크다운 사용 금지
- 목록은 번호 매겨서 나열`,
    },
  ], 1500);

  yield { type: 'content', step: 5, content: answer.trim() };
  yield { type: 'done', answer: answer.trim() };
}

// ══════════════════════════════════════════════════════════════════════════════
// 원인 분석 에이전트 — 멀티스텝
// ══════════════════════════════════════════════════════════════════════════════
async function* runAnalysis(params: {
  question: string; media: string; realMedia: string;
  history: { question: string; answer: string }[];
}) {
  const { question, media, realMedia, history } = params;
  const cfg    = getTableConfig(realMedia);
  const isSA   = cfg.isSA;
  const intent = detectIntent(question);

  const intentGuide =
    intent === 'improve' ? '사용자가 효율 개선 원인을 묻고 있습니다. 긍정적으로 변화한 지표와 캠페인/그룹/소재를 중심으로 분석하세요.'
    : intent === 'worsen' ? '사용자가 효율 악화 원인을 묻고 있습니다. 부정적으로 변화한 지표와 캠페인/그룹/소재를 중심으로 분석하세요.'
    : '사용자 질문의 맥락에 맞게 중립적으로 분석하세요.';

  const system = `당신은 퍼포먼스 마케팅 분석 전문가입니다.
현재 분석: 채널 ${media} | 최근 21일

[분석 방향] ${intentGuide}
질문 의도와 반대 방향의 분석은 하지 마세요.

[절대 규칙]
- 사용자가 이전 대화에서 정정한 내용은 반드시 반영하세요.
- 캠페인명/그룹명/키워드명/소재명은 실제 데이터에서 확인된 값만 사용하세요. 절대 추측하거나 만들어내지 마세요.
- 데이터로 확인되지 않은 내용은 "추정" 또는 "데이터 확인 필요"로 표기하세요.`;

  const ctx: { role: string; content: string }[] = [
    ...history.flatMap(h => [
      { role: 'user', content: h.question },
      { role: 'assistant', content: h.answer },
    ]),
    { role: 'user', content: question },
  ];

  // ── Step 1 ────────────────────────────────────────────────────────────────
  yield { type: 'status', step: 1, message: '🔍 채널 전체 지표 분석 중...' };

  const s1SQL = `
    WITH base AS (
      SELECT date,
        SUM(imp) as imp, SUM(click) as click, SUM(cost) as cost, SUM(applicant) as app
      FROM ${cfg.table}
      WHERE media = '${realMedia}'
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 21 DAY)
        ${cfg.jobFilter}
      GROUP BY date
    )
    SELECT date, imp, click, cost, app,
      CASE WHEN app=0 THEN NULL ELSE ROUND(cost/app,0) END as cpa,
      CASE WHEN click=0 THEN NULL ELSE ROUND(app/click*100,2) END as cvr,
      CASE WHEN imp=0 THEN NULL ELSE ROUND(click/imp*100,2) END as ctr
    FROM base ORDER BY date`;

  const s1Rows = await runBQ(s1SQL);
  const s1Raw  = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `${media} 채널 최근 21일 일별 성과.\n\n[데이터]\n${fmtRows(s1Rows)}\n\n[질문]: ${question}\n\n${intentGuide}\n\nJSON으로만:\n{"anomaly_detected":true,"anomaly_start":"YYYY-MM-DD","anomaly_end":"YYYY-MM-DD","summary":"핵심 발견 2-3줄","key_issues":["주요 변화"]}`,
    },
  ]);
  const s1 = safeJSON(s1Raw);
  yield { type: 'content', step: 1, content: s1.summary };
  ctx.push({ role: 'assistant', content: `Step1 | ${s1.anomaly_start}~${s1.anomaly_end} | ${s1.summary}` });

  const aStart = s1.anomaly_start || new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const aEnd   = s1.anomaly_end   || new Date().toISOString().slice(0, 10);
  const { ps, pe } = prevPeriod(aStart, aEnd);

  // ── Step 2 ────────────────────────────────────────────────────────────────
  yield { type: 'status', step: 2, message: '📊 캠페인별 성과 분석 중...' };

  const camCol = isSA ? 'campaign_kr' : 'campaign';
  const s2SQL  = `
    WITH a AS (
      SELECT ${camCol} as camp,
        SUM(cost) as cost, SUM(applicant) as app, SUM(click) as click
      FROM ${cfg.table}
      WHERE media = '${realMedia}' ${cfg.jobFilter}
        AND date BETWEEN '${aStart}' AND '${aEnd}'
      GROUP BY ${camCol} HAVING ${camCol} IS NOT NULL
    ),
    p AS (
      SELECT ${camCol} as camp,
        SUM(cost) as cost, SUM(applicant) as app, SUM(click) as click
      FROM ${cfg.table}
      WHERE media = '${realMedia}' ${cfg.jobFilter}
        AND date BETWEEN '${ps}' AND '${pe}'
      GROUP BY ${camCol} HAVING ${camCol} IS NOT NULL
    )
    SELECT a.camp as campaign,
      CASE WHEN a.app=0 THEN NULL ELSE ROUND(a.cost/a.app,0) END as cpa_curr,
      CASE WHEN IFNULL(p.app,0)=0 THEN NULL ELSE ROUND(IFNULL(p.cost,0)/IFNULL(p.app,0),0) END as cpa_prev,
      CASE WHEN a.click=0 THEN NULL ELSE ROUND(a.app/a.click*100,2) END as cvr_curr,
      CASE WHEN IFNULL(p.click,0)=0 THEN NULL ELSE ROUND(IFNULL(p.app,0)/IFNULL(p.click,0)*100,2) END as cvr_prev,
      a.app as app_curr, IFNULL(p.app,0) as app_prev, a.cost as cost_curr
    FROM a LEFT JOIN p USING (camp)
    ORDER BY
      CASE WHEN a.app=0 OR IFNULL(p.app,0)=0 THEN NULL
           ELSE ROUND((ROUND(a.cost/a.app,0)-ROUND(IFNULL(p.cost,0)/IFNULL(p.app,1),0))/NULLIF(ROUND(IFNULL(p.cost,0)/IFNULL(p.app,1),0),0)*100,1)
      END ${intent === 'improve' ? 'ASC' : 'DESC'} NULLS LAST`;

  const s2Rows = await runBQ(s2SQL);
  const s2Directive =
    intent === 'improve' ? '효율이 가장 크게 개선된 캠페인을 특정하고 개선 이유를 분석하세요.'
    : intent === 'worsen' ? '효율이 가장 크게 악화된 캠페인을 특정하고 악화 원인을 분석하세요.'
    : '가장 큰 변화를 보인 캠페인을 특정하고 변화 원인을 분석하세요.';

  const s2Raw  = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `분석기간(${aStart}~${aEnd}) 캠페인별 성과. ${s2Directive}\n\n[데이터]\n${fmtRows(s2Rows)}\n\nJSON으로만:\n{"key_campaigns":["캠페인명"],"summary":"2-3줄","details":[{"campaign":"","change":"","reason":""}]}`,
    },
  ]);
  const s2         = safeJSON(s2Raw);
  const keyCamps: string[] = s2.key_campaigns ?? [];
  yield { type: 'content', step: 2, content: s2.summary };
  ctx.push({ role: 'assistant', content: `Step2 | 핵심: ${keyCamps.join(', ')} | ${s2.summary}` });

  if (keyCamps.length === 0) {
    yield { type: 'status', step: 5, message: '💡 종합 진단 작성 중...' };
    const syn = await callClaude(system, [
      ...ctx,
      { role: 'user', content: `분석 종합. 원래 질문: ${question}\n마크다운 금지. 데이터 확인 불가 항목은 "데이터 확인 필요"로 표기.` },
    ], 3000);
    yield { type: 'content', step: 5, content: syn };
    yield { type: 'done', answer: syn };
    return;
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  yield { type: 'status', step: 3, message: '🎯 광고그룹 드릴다운 중...' };

  const campList = keyCamps.map(c => `'${c.replace(/'/g, "\\'")}'`).join(', ');
  const s3Order  = intent === 'improve' ? 'cpa ASC' : 'cpa DESC';
  const s3SQL    = `
    WITH base AS (
      SELECT ${camCol} as campaign, \`group\`,
        SUM(cost) as cost, SUM(applicant) as app, SUM(click) as click
      FROM ${cfg.table}
      WHERE media = '${realMedia}' ${cfg.jobFilter}
        AND ${camCol} IN (${campList})
        AND date BETWEEN '${aStart}' AND '${aEnd}'
      GROUP BY ${camCol}, \`group\`
    )
    SELECT campaign, \`group\`, cost, app, click,
      CASE WHEN app=0 THEN NULL ELSE ROUND(cost/app,0) END as cpa,
      CASE WHEN click=0 THEN NULL ELSE ROUND(app/click*100,2) END as cvr
    FROM base ORDER BY ${s3Order} NULLS LAST`;

  const s3Rows     = await runBQ(s3SQL);
  const s3Directive =
    intent === 'improve' ? '가장 효율이 좋은 그룹과 개선 이유를 분석하세요.'
    : intent === 'worsen' ? '가장 효율이 나쁜 그룹과 악화 원인을 분석하세요.'
    : '가장 큰 영향을 준 그룹을 분석하세요.';

  const s3Raw  = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `핵심 캠페인(${keyCamps.join(', ')}) 내 그룹 성과. ${s3Directive}\n\n[데이터]\n${fmtRows(s3Rows)}\n\nJSON으로만:\n{"key_groups":["그룹명"],"summary":"2-3줄","details":[{"group":"","campaign":"","reason":""}]}`,
    },
  ]);
  const s3       = safeJSON(s3Raw);
  const keyGroups: string[] = s3.key_groups ?? [];
  yield { type: 'content', step: 3, content: s3.summary };
  ctx.push({ role: 'assistant', content: `Step3 | 핵심: ${keyGroups.join(', ')} | ${s3.summary}` });

  // ── Step 4A or 4B ─────────────────────────────────────────────────────────
  if (isSA) {
    yield { type: 'status', step: 4, message: '🔑 키워드 분석 중... (전환 Top40 + 비효율 Top20)' };

    const kwA = `
      WITH base AS (
        SELECT campaign_kr as campaign, \`group\`, keyword,
          SUM(applicant) as app, SUM(cost) as cost, SUM(click) as click
        FROM ${cfg.table}
        WHERE media = '${realMedia}' ${cfg.jobFilter}
          AND date BETWEEN '${aStart}' AND '${aEnd}'
        GROUP BY campaign_kr, \`group\`, keyword
      )
      SELECT campaign, \`group\`, keyword, app, cost, click,
        CASE WHEN app=0 THEN NULL ELSE ROUND(cost/app,0) END as cpa,
        CASE WHEN click=0 THEN NULL ELSE ROUND(app/click*100,2) END as cvr
      FROM base ORDER BY app DESC LIMIT 40`;

    const kwB = `
      WITH base AS (
        SELECT campaign_kr as campaign, \`group\`, keyword,
          SUM(applicant) as app, SUM(cost) as cost, SUM(click) as click
        FROM ${cfg.table}
        WHERE media = '${realMedia}' ${cfg.jobFilter}
          AND date BETWEEN '${aStart}' AND '${aEnd}'
        GROUP BY campaign_kr, \`group\`, keyword
      )
      SELECT campaign, \`group\`, keyword, app, cost, click,
        CASE WHEN app=0 THEN cost ELSE ROUND(cost/app,0) END as effective_cpa
      FROM base
      WHERE cost > 0
      ORDER BY effective_cpa DESC LIMIT 20`;

    const [rowsA, rowsB] = await Promise.all([runBQ(kwA), runBQ(kwB)]);
    const s4Directive =
      intent === 'improve' ? '전환 성과가 좋은 키워드와 개선 요인을 분석하세요.'
      : '비효율 키워드와 문제 원인을 분석하세요.';

    const s4Raw = await callClaude(system, [
      ...ctx,
      {
        role: 'user',
        content: `키워드 분석 결과. ${s4Directive}

[그룹A - 전환 Top40]
${fmtRows(rowsA)}

[그룹B - 비효율 Top20 (전환0이면 effective_cpa=비용전액)]
${fmtRows(rowsB)}

[절대 규칙] keyword 필드는 위 데이터에 있는 실제 값만 사용하세요.

JSON으로만:
{"summary":"2-3줄","zero_conv_keywords":[{"keyword":"데이터의실제값","cost":숫자,"click":숫자}],"high_cpa_keywords":[{"keyword":"데이터의실제값","cpa":숫자,"cost":숫자}],"key_findings":["발견1","발견2"]}`,
      },
    ]);
    const s4 = safeJSON(s4Raw);
    yield { type: 'content', step: 4, content: s4.summary };
    ctx.push({ role: 'assistant', content: `Step4(키워드) | zero_conv: ${JSON.stringify(s4.zero_conv_keywords)} | high_cpa: ${JSON.stringify(s4.high_cpa_keywords)} | ${s4.summary}` });

  } else if (keyGroups.length > 0) {
    yield { type: 'status', step: 4, message: '🎨 소재별 성과 분석 중...' };

    const grpList = keyGroups.map(g => `'${g.replace(/'/g, "\\'")}'`).join(', ');
    const s4Order = intent === 'improve' ? 'cpa ASC' : 'cpa DESC';
    const s4SQL   = `
      WITH base AS (
        SELECT campaign, \`group\`, ad,
          SUM(cost) as cost, SUM(applicant) as app, SUM(click) as click, SUM(imp) as imp
        FROM ${cfg.table}
        WHERE media = '${realMedia}' ${cfg.jobFilter}
          AND campaign IN (${campList})
          AND \`group\` IN (${grpList})
          AND date BETWEEN '${aStart}' AND '${aEnd}'
        GROUP BY campaign, \`group\`, ad
      )
      SELECT campaign, \`group\`, ad, cost, app, click, imp,
        CASE WHEN app=0 THEN NULL ELSE ROUND(cost/app,0) END as cpa,
        CASE WHEN click=0 THEN NULL ELSE ROUND(app/click*100,2) END as cvr,
        CASE WHEN imp=0 THEN NULL ELSE ROUND(click/imp*100,2) END as ctr
      FROM base ORDER BY ${s4Order} NULLS LAST LIMIT 50`;

    const s4Rows = await runBQ(s4SQL);
    if (s4Rows.length > 0) {
      const s4Directive =
        intent === 'improve' ? '성과가 좋은 소재와 효율 개선 요인을 분석하세요.'
        : '비효율 소재와 문제 원인을 분석하세요.';

      const s4Raw = await callClaude(system, [
        ...ctx,
        {
          role: 'user',
          content: `소재(ad)별 성과. ${s4Directive}

[데이터]
${fmtRows(s4Rows)}

[절대 규칙] ad 필드는 위 데이터에 있는 실제 값만 사용하세요.

JSON으로만:
{"summary":"2-3줄","key_ads":[{"ad":"데이터의실제값","issue":"이유"}],"key_findings":["발견1"]}`,
        },
      ]);
      const s4 = safeJSON(s4Raw);
      yield { type: 'content', step: 4, content: s4.summary };
      ctx.push({ role: 'assistant', content: `Step4(소재) | ${s4.summary}` });
    } else {
      yield { type: 'content', step: 4, content: '소재 단위 데이터 없음 — 그룹 레벨까지 분석 완료.' };
      ctx.push({ role: 'assistant', content: 'Step4: 소재 데이터 없음' });
    }
  }

  // ── Step 5 ────────────────────────────────────────────────────────────────
  yield { type: 'status', step: 5, message: '💡 종합 진단 및 액션 플랜 작성 중...' };

  const syn = await callClaude(system, [
    ...ctx,
    {
      role: 'user',
      content: `지금까지 분석을 종합하여 최종 진단과 구체적 개선방안을 제시하세요.

[원래 질문]: ${question}
[채널]: ${media}
[분석기간]: ${aStart} ~ ${aEnd}
[분석 방향]: ${intentGuide}

[절대 준수]
- 이전 대화에서 사용자가 정정한 내용 반드시 반영
- 캠페인명/그룹명/키워드명/소재명은 실제 데이터 확인된 값만 사용
- 데이터 확인 불가 항목은 "데이터 확인 필요"로 표기
- 즉시 조치 사항의 키워드/소재는 Step4에서 직접 추출한 실제 값만 사용

형식 (마크다운 금지):

진단 요약
[핵심 원인 2-3줄]

원인 분석
[채널→캠페인→그룹→소재/키워드 순 레벨별 발견]

즉시 조치 사항
[캠페인명/그룹명/키워드명 포함, 수치 포함 구체적 액션]

중장기 개선 방향
[구조적 개선 방안]`,
    },
  ], 3000);

  yield { type: 'content', step: 5, content: syn };
  yield { type: 'done', answer: syn };
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { question, media, history = [] } = await req.json();

    if (!question || !media)
      return new Response(JSON.stringify({ error: '필수 파라미터 누락' }), { status: 400 });
    if (!ANTHROPIC_API_KEY)
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY 미설정' }), { status: 500 });

    // 마스킹 채널명 → 실제 채널명 변환
    const realMedia = resolveMedia(media);
    const queryType = detectQueryType(question);
    const encoder   = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        try {
          const generator = queryType === 'lookup'
            ? runLookup({ question, media, realMedia, history })
            : runAnalysis({ question, media, realMedia, history });

          for await (const chunk of generator) {
            send(chunk);
            if ((chunk as any).type === 'done' && (chunk as any).answer) {
              saveHistory(media, question, (chunk as any).answer);
            }
          }
        } catch (err: any) {
          send({ type: 'error', message: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
