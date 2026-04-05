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
}

const SUGGESTIONS = [
  '최근 CPA가 왜 높아졌어?',
  '이번 달 효율이 갑자기 떨어진 원인이 뭐야?',
  '비용 대비 성과가 가장 낮은 캠페인은?',
  '전환율이 계속 하락하는 이유가 뭐야?',
];

export function ChannelChatAgent({ media }: { media: string }) {
  const theme                       = useTheme();
  const [entries, setEntries]       = useState<ConversationEntry[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollContainerRef          = useRef<HTMLDivElement>(null);
  const historyRef                  = useRef<{ question: string; answer: string }[]>([]);

  // 채널 변경 시 히스토리 로드
  useEffect(() => {
    if (!media) return;
    setEntries([]);
    historyRef.current = [];
    setHistoryLoading(true);

    fetch(`/api/agent-history?media=${encodeURIComponent(media)}`)
      .then(r => r.json())
      .then(data => {
        const rows: any[] = data.history ?? [];
        if (rows.length === 0) return;
        const sorted = [...rows].reverse();
        setEntries(sorted.map(row => ({
          question: row.question,
          steps: {},
          answer: row.answer,
          loading: false,
          fromHistory: true,
        })));
        historyRef.current = sorted.slice(-4).map(r => ({ question: r.question, answer: r.answer }));
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [media]);

  useEffect(() => {
    if (entries.length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [entries]);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setInput('');
    setLoading(true);

    let entryIdx = -1;
    setEntries(prev => {
      entryIdx = prev.length;
      return [...prev, { question, steps: {}, answer: '', loading: true }];
    });

    let finalAnswer = '';
    const updateEntry = (updater: (e: ConversationEntry) => ConversationEntry) => {
      setEntries(prev => prev.map((e, i) => (i === entryIdx ? updater(e) : e)));
    };

    try {
      const res = await fetch('/api/channel-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, media, history: historyRef.current }),
      });

      if (!res.body) throw new Error('스트림 없음');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

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
                  ...e,
                  answer: data.content,
                  steps: {
                    ...e.steps,
                    [5]: { status: e.steps[5]?.status ?? '💡 종합 진단 작성 중...', content: data.content, done: true },
                  },
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
              if (answer) {
                historyRef.current = [...historyRef.current.slice(-4), { question, answer }];
              }
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

  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: cardRadius,
        overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }}>
          <span style={{ fontSize: 'var(--font-body)' }}>🤖</span>
          <span style={{
            fontSize: 'var(--font-section-title)', fontWeight: 600,
            color: 'var(--color-text-primary)', letterSpacing: 'var(--tracking-wide)',
          }}>
            AI Agent for Channel Analytics
          </span>
          <span style={{
            fontSize: 'var(--font-label)', fontWeight: 700,
            color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
            padding: '2px 8px', borderRadius: 4,
            border: '1px solid var(--color-border-subtle)', marginLeft: 'var(--space-2)',
          }}>
            {media}
          </span>
        </div>

        {/* 대화 영역 */}
        <div ref={scrollContainerRef} style={{
          minHeight: 120,
          maxHeight: entries.length === 0 ? 'auto' : 520,
          overflowY: 'auto' as const,
          padding: 'var(--space-4) var(--space-5)',
        }}>
          {historyLoading ? (
            <p style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>이전 대화 불러오는 중...</p>
          ) : entries.length === 0 ? (
            <div>
              <p style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                {media} 채널 데이터를 자유롭게 질문하세요
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 'var(--space-2)' }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} style={{
                    fontSize: 'var(--font-label)', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--color-border-default)', background: 'transparent',
                    color: 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-default)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entries.map((entry, idx) => (
              <div key={idx} style={{ marginBottom: 'var(--space-6)' }}>
                {entry.fromHistory && idx === 0 && (
                  <div style={{ textAlign: 'center' as const, marginBottom: 'var(--space-4)', fontSize: 'var(--font-label)', color: 'var(--color-text-muted)' }}>
                    ── 이전 대화 ──
                  </div>
                )}
                {!entry.fromHistory && idx > 0 && entries[idx - 1]?.fromHistory && (
                  <div style={{ textAlign: 'center' as const, marginBottom: 'var(--space-4)', fontSize: 'var(--font-label)', color: 'var(--color-text-muted)' }}>
                    ── 현재 대화 ──
                  </div>
                )}

                {/* 질문 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
                  <div style={{
                    maxWidth: '78%', padding: 'var(--space-3) var(--space-4)',
                    borderRadius: `${cardRadius} ${cardRadius} 4px ${cardRadius}`,
                    background: entry.fromHistory ? 'color-mix(in srgb, var(--color-accent) 60%, transparent)' : 'var(--color-accent)',
                    color: '#fff', fontSize: 'var(--font-body)', lineHeight: 1.6,
                  }}>
                    {entry.question}
                  </div>
                </div>

                {/* 분석 단계 */}
                {!entry.fromHistory && Object.keys(entry.steps).length > 0 && (
                  <div style={{
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
                    borderRadius: 8, padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)',
                  }}>
                    <p style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', letterSpacing: 'var(--tracking-wide)' }}>
                      ANALYSIS STEPS
                    </p>
                    {Object.entries(entry.steps)
                      .filter(([step]) => Number(step) < 5)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([step, s]) => (
                        <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                          <span style={{ fontSize: 'var(--font-label)', minWidth: 16, color: s.done ? 'var(--color-delta-pos)' : 'var(--color-text-muted)' }}>
                            {s.done ? '✓' : '···'}
                          </span>
                          <div>
                            <div style={{ fontSize: 'var(--font-label)', color: s.done ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                              {s.status}
                            </div>
                            {s.done && s.content && (
                              <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginTop: 2, paddingLeft: 'var(--space-2)', borderLeft: '2px solid var(--color-border-default)', whiteSpace: 'pre-line' as const }}>
                                {s.content}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    {entry.loading && (
                      <div style={{ fontSize: 'var(--font-label)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>···</div>
                    )}
                  </div>
                )}

                {/* 최종 답변 */}
                {entry.answer && (
                  <div style={{
                    padding: 'var(--space-4)', borderRadius: 8,
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
                    fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)',
                    lineHeight: 1.75, whiteSpace: 'pre-line' as const,
                  }}>
                    {entry.answer}
                  </div>
                )}

                {/* 에러 */}
                {entry.error && (
                  <div style={{
                    padding: 'var(--space-3) var(--space-4)', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    color: 'var(--color-delta-neg)', fontSize: 'var(--font-body)',
                  }}>
                    오류: {entry.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 입력창 */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex', gap: 'var(--space-2)',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder={`${media} 채널에 대해 질문하세요...`}
            disabled={loading}
            style={{
              flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 6,
              border: '1px solid var(--color-border-default)', background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)', fontSize: 'var(--font-body)',
              outline: 'none', transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none',
              background: loading || !input.trim() ? 'var(--color-surface-3)' : 'var(--color-accent)',
              color: loading || !input.trim() ? 'var(--color-text-muted)' : '#fff',
              fontSize: 'var(--font-label)', fontWeight: 600,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
            }}
          >
            {loading ? '분석 중...' : '전송'}
          </button>
        </div>
      </div>
    </section>
  );
}
