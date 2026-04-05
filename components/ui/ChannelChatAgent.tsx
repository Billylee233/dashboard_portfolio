'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/components/ui/ThemeEditor';

interface StepState {
  status: string;
  content: string;
  done: boolean;
}

interface ConversationEntry {
  question: string;
  steps: Record<number, StepState>;
  answer: string;
  error?: string;
  loading: boolean;
  fromHistory?: boolean;
  timestamp: string;
}

const SUGGESTIONS = [
  '최근 CPA가 왜 높아졌어?',
  '이번 달 효율이 갑자기 떨어진 원인이 뭐야?',
  '비용 대비 성과가 가장 낮은 캠페인은?',
  '전환율이 계속 하락하는 이유가 뭐야?',
];

const STEP_LABELS: Record<number, string> = {
  1: '채널 전체 지표',
  2: '캠페인 분석',
  3: '광고그룹 드릴다운',
  4: '소재 / 키워드 분석',
  5: '종합 진단',
};

function nowTime() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 타이핑 도트 애니메이션
function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--color-text-muted)',
            animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            display: 'inline-block',
          }}
        />
      ))}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

// 분석 진행 상태 바
function AnalysisProgress({ steps, loading }: { steps: Record<number, StepState>; loading: boolean }) {
  const total   = 5;
  const done    = Object.values(steps).filter(s => s.done).length;
  const pct     = Math.round((done / total) * 100);
  const current = Object.entries(steps).find(([, s]) => !s.done)?.[0];

  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      {/* 진행 바 */}
      <div style={{
        height: 4, background: 'var(--color-border-subtle)',
        borderRadius: 2, overflow: 'hidden', marginBottom: 6,
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #FEE500, #F5A623)',
          borderRadius: 2,
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* 단계 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        {[1, 2, 3, 4, 5].map(step => {
          const s      = steps[step];
          const isDone = s?.done;
          const isActive = !isDone && s && !s.done;
          return (
            <div key={step} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              opacity: !s ? 0.35 : 1,
              transition: 'opacity 0.3s',
            }}>
              {/* 아이콘 */}
              <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10,
                background: isDone ? '#FEE500' : isActive ? 'var(--color-accent)' : 'var(--color-surface-3)',
                color: isDone ? '#333' : isActive ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.3s',
              }}>
                {isDone ? '✓' : step}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--font-label)',
                  color: isDone ? 'var(--color-text-secondary)' : isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  fontWeight: isDone || isActive ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {STEP_LABELS[step]}
                  {isActive && loading && <TypingDots />}
                </div>
                {isDone && s.content && (
                  <div style={{
                    fontSize: 'var(--font-label)',
                    color: 'var(--color-text-muted)',
                    marginTop: 2,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-line' as const,
                  }}>
                    {s.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChannelChatAgent({ media }: { media: string }) {
  const theme                           = useTheme();
  const [entries, setEntries]           = useState<ConversationEntry[]>([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollRef                       = useRef<HTMLDivElement>(null);
  const historyRef                      = useRef<{ question: string; answer: string }[]>([]);
  const inputRef                        = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!media) return;
    setEntries([]);
    historyRef.current = [];
    setHistoryLoading(true);

    fetch(`/api/agent-history?media=${encodeURIComponent(media)}`)
      .then(r => r.json())
      .then(data => {
        const rows: any[] = data.history ?? [];
        if (!rows.length) return;
        const sorted = [...rows].reverse();
        setEntries(sorted.map(row => ({
          question: row.question,
          steps: {},
          answer: row.answer,
          loading: false,
          fromHistory: true,
          timestamp: new Date(row.created_at?.value ?? row.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        })));
        historyRef.current = sorted.slice(-4).map(r => ({ question: r.question, answer: r.answer }));
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [media]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setInput('');
    setLoading(true);
    inputRef.current?.blur();

    const ts = nowTime();
    let entryIdx = -1;
    setEntries(prev => {
      entryIdx = prev.length;
      return [...prev, { question, steps: {}, answer: '', loading: true, timestamp: ts }];
    });

    let finalAnswer = '';
    const updateEntry = (updater: (e: ConversationEntry) => ConversationEntry) =>
      setEntries(prev => prev.map((e, i) => i === entryIdx ? updater(e) : e));

    try {
      const res = await fetch('/api/channel-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, media, history: historyRef.current }),
      });
      if (!res.body) throw new Error('스트림 없음');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'status') {
              updateEntry(e => ({
                ...e,
                steps: { ...e.steps, [data.step]: { status: data.message, content: '', done: false } },
              }));
            }
            if (data.type === 'content') {
              if (data.step === 5) {
                finalAnswer = data.content;
                updateEntry(e => ({
                  ...e, answer: data.content,
                  steps: { ...e.steps, [5]: { status: e.steps[5]?.status ?? '', content: data.content, done: true } },
                }));
              } else {
                updateEntry(e => ({
                  ...e,
                  steps: { ...e.steps, [data.step]: { ...e.steps[data.step], content: data.content, done: true } },
                }));
              }
            }
            if (data.type === 'error') {
              updateEntry(e => ({ ...e, error: data.message, loading: false }));
              setLoading(false);
            }
            if (data.type === 'done') {
              const answer = data.answer ?? finalAnswer;
              if (answer) historyRef.current = [...historyRef.current.slice(-4), { question, answer }];
              updateEntry(e => ({ ...e, loading: false }));
              setLoading(false);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      updateEntry(e => ({ ...e, error: err.message, loading: false }));
    } finally {
      setLoading(false);
    }
  }

  const cardRadius = `${theme.cardBorderRadius}px`;

  // 카카오 노란색 팔레트
  const KAKAO_YELLOW = '#FEE500';
  const KAKAO_DARK   = '#3A1D1D';
  const AI_BG        = 'var(--color-surface-2)';

  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: cardRadius,
        overflow: 'hidden',
      }}>

        {/* ── 채팅방 헤더 (카카오 스타일) ── */}
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        }}>
          {/* AI 아바타 */}
          <div style={{
            width: 36, height: 36, borderRadius: '30%',
            background: KAKAO_YELLOW,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-body)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              AI Agent for Channel Analytics
            </div>
            <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)' }}>
              {media} · {loading ? '분석 중...' : '온라인'}
            </div>
          </div>
          {/* 멤버 수 표시 */}
          <div style={{ marginLeft: 'auto', fontSize: 'var(--font-label)', color: 'var(--color-text-muted)' }}>
            2
          </div>
        </div>

        {/* ── 채팅 영역 ── */}
        <div
          ref={scrollRef}
          style={{
            minHeight: entries.length === 0 ? 160 : 'auto',
            maxHeight: 600,
            overflowY: 'auto' as const,
            padding: 'var(--space-4) var(--space-4)',
            background: 'color-mix(in srgb, var(--color-bg) 60%, var(--color-surface-1))',
          }}
        >
          {historyLoading ? (
            <div style={{ textAlign: 'center' as const, padding: 'var(--space-6)', color: 'var(--color-text-muted)', fontSize: 'var(--font-small)' }}>
              이전 대화 불러오는 중...
            </div>
          ) : entries.length === 0 ? (
            /* 빈 화면 — 추천 질문 */
            <div>
              {/* 입장 메시지 */}
              <div style={{ textAlign: 'center' as const, marginBottom: 'var(--space-4)' }}>
                <span style={{
                  fontSize: 'var(--font-label)', color: 'var(--color-text-muted)',
                  background: 'var(--color-surface-2)', padding: '3px 12px', borderRadius: 12,
                }}>
                  {media} 채널 AI 분석을 시작합니다
                </span>
              </div>

              {/* AI 추천 질문 말풍선 */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '30%', background: KAKAO_YELLOW,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0, alignSelf: 'flex-end',
                }}>
                  🤖
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                    AI Agent
                  </div>
                  <div style={{
                    background: AI_BG, borderRadius: `0 ${cardRadius} ${cardRadius} ${cardRadius}`,
                    padding: 'var(--space-3) var(--space-4)',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)',
                    lineHeight: 1.6, marginBottom: 'var(--space-2)',
                  }}>
                    안녕하세요! {media} 채널 데이터를 분석해드릴게요.<br />
                    아래 질문을 눌러보거나 직접 입력해주세요.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 'var(--space-1)' }}>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        style={{
                          fontSize: 'var(--font-label)', padding: '5px 12px', borderRadius: 20,
                          border: '1px solid var(--color-border-default)',
                          background: 'var(--color-surface-1)',
                          color: 'var(--color-text-secondary)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = KAKAO_YELLOW;
                          (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${KAKAO_YELLOW} 15%, transparent)`;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-default)';
                          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-1)';
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 이전 대화 구분선 */}
              {entries.some(e => e.fromHistory) && (
                <div style={{ textAlign: 'center' as const, marginBottom: 'var(--space-4)' }}>
                  <span style={{
                    fontSize: 'var(--font-label)', color: 'var(--color-text-muted)',
                    background: 'var(--color-surface-2)', padding: '3px 12px', borderRadius: 12,
                  }}>
                    이전 대화
                  </span>
                </div>
              )}

              {entries.map((entry, idx) => (
                <div key={idx} style={{ marginBottom: 'var(--space-4)' }}>
                  {/* 현재 대화 구분선 */}
                  {!entry.fromHistory && idx > 0 && entries[idx - 1]?.fromHistory && (
                    <div style={{ textAlign: 'center' as const, margin: 'var(--space-3) 0' }}>
                      <span style={{
                        fontSize: 'var(--font-label)', color: 'var(--color-text-muted)',
                        background: 'var(--color-surface-2)', padding: '3px 12px', borderRadius: 12,
                      }}>
                        오늘
                      </span>
                    </div>
                  )}

                  {/* 사용자 말풍선 (오른쪽, 카카오 노란색) */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)', alignItems: 'flex-end', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', alignSelf: 'flex-end', marginBottom: 2 }}>
                      {entry.timestamp}
                    </span>
                    <div style={{
                      maxWidth: '72%',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: `${cardRadius} ${cardRadius} 4px ${cardRadius}`,
                      background: KAKAO_YELLOW,
                      color: KAKAO_DARK,
                      fontSize: 'var(--font-body)',
                      lineHeight: 1.6,
                      fontWeight: 500,
                    }}>
                      {entry.question}
                    </div>
                  </div>

                  {/* AI 말풍선 (왼쪽) */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    {/* 아바타 */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '30%', background: KAKAO_YELLOW,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, flexShrink: 0, alignSelf: 'flex-start', marginTop: 20,
                    }}>
                      🤖
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        AI Agent
                      </div>

                      {/* 분석 진행 중 */}
                      {!entry.fromHistory && Object.keys(entry.steps).length > 0 && (
                        <div style={{
                          background: AI_BG,
                          borderRadius: `0 ${cardRadius} ${cardRadius} ${cardRadius}`,
                          padding: 'var(--space-3) var(--space-4)',
                          border: '1px solid var(--color-border-subtle)',
                          marginBottom: entry.answer ? 'var(--space-2)' : 0,
                          maxWidth: '85%',
                        }}>
                          <AnalysisProgress steps={entry.steps} loading={entry.loading} />
                        </div>
                      )}

                      {/* 로딩 타이핑 */}
                      {entry.loading && !entry.answer && Object.keys(entry.steps).length === 0 && (
                        <div style={{
                          display: 'inline-flex', background: AI_BG,
                          borderRadius: `0 ${cardRadius} ${cardRadius} ${cardRadius}`,
                          padding: 'var(--space-3) var(--space-4)',
                          border: '1px solid var(--color-border-subtle)',
                        }}>
                          <TypingDots />
                        </div>
                      )}

                      {/* 최종 답변 */}
                      {entry.answer && (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                          <div style={{
                            maxWidth: '85%',
                            background: AI_BG,
                            borderRadius: `0 ${cardRadius} ${cardRadius} ${cardRadius}`,
                            padding: 'var(--space-3) var(--space-4)',
                            border: '1px solid var(--color-border-subtle)',
                            fontSize: 'var(--font-body)',
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.75,
                            whiteSpace: 'pre-line' as const,
                          }}>
                            {entry.answer}
                          </div>
                          <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--color-text-muted)', flexShrink: 0, marginBottom: 2 }}>
                            {entry.timestamp}
                          </span>
                        </div>
                      )}

                      {/* 에러 */}
                      {entry.error && (
                        <div style={{
                          background: 'rgba(239,68,68,0.08)',
                          borderRadius: `0 ${cardRadius} ${cardRadius} ${cardRadius}`,
                          padding: 'var(--space-3) var(--space-4)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: 'var(--color-delta-neg)',
                          fontSize: 'var(--font-body)',
                          maxWidth: '85%',
                        }}>
                          오류: {entry.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── 입력창 (카카오 스타일) ── */}
        <div style={{
          padding: 'var(--space-2) var(--space-3)',
          borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          background: 'var(--color-surface-1)',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="메시지 입력"
            disabled={loading}
            style={{
              flex: 1, padding: 'var(--space-2) var(--space-3)',
              borderRadius: 20,
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-body)',
              outline: 'none', transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = KAKAO_YELLOW)}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
          />
          {/* 전송 버튼 */}
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: loading || !input.trim() ? 'var(--color-surface-3)' : KAKAO_YELLOW,
              color: loading || !input.trim() ? 'var(--color-text-muted)' : KAKAO_DARK,
              fontSize: 16,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </section>
  );
}
