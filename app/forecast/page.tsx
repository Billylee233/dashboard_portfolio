'use client';

import { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ExportToSheetsButton } from '@/components/ui/ExportButton';
import { fmt } from '@/lib/calculations';
import { useTheme } from '@/components/ui/ThemeEditor';
import type { WeekForecast } from '@/lib/types';

export default function ForecastPage() {
  const theme = useTheme();
  const [weeks, setWeeks] = useState<WeekForecast[]>([]);
  const [basedOn, setBasedOn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [weekBudgets, setWeekBudgets] = useState<Record<string, number>>({});
  const [budgetDirty, setBudgetDirty] = useState(false);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (Object.keys(weekBudgets).length > 0) {
        params.set('weekBudget', JSON.stringify(weekBudgets));
      }
      const res = await fetch(`/api/forecast?${params}`);
      const json = await res.json();
      setWeeks(json.weeks ?? []);
      setBasedOn(json.basedOn);
      setBudgetDirty(false);
    } finally {
      setLoading(false);
    }
  }, [weekBudgets]);

  useEffect(() => { fetchForecast(); }, []);

  const applyBudgets = () => fetchForecast();

  const toggleWeek = (label: string) =>
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));

  const handleBudgetChange = (label: string, value: string) => {
    setWeekBudgets(prev => ({ ...prev, [label]: Number(value) }));
    setBudgetDirty(true);
  };

  // 차트 데이터 (주차별)
  const chartData = weeks.map(w => ({
    label: w.weekLabel.split(' ')[0],
    applicant: w.applicant,
    low: w.applicantLow,
    high: w.applicantHigh,
  }));

  const exportRows = weeks.flatMap(w => [
    [w.weekLabel, '', w.applicant, w.applicantLow, w.applicantHigh, w.cpa, ''],
    ...w.days.map(d => [
      w.weekLabel, `${d.date} (${d.dayOfWeek})`,
      d.applicant, d.applicantLow, d.applicantHigh, d.cpa,
      d.isHoliday ? '공휴일' : '',
    ]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-text-primary" style={{ fontSize: "var(--font-page-title)" }}>📈 Forecast</h1>
          <p className="mt-1" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
            향후 8주 지원자 전망 — 25년 계절성 × 최근 14일 추세
          </p>
        </div>
        <ExportToSheetsButton
          title="Forecast_8weeks"
          headers={['주차','날짜','예상 지원자','하한','상한','예상 CPA','비고']}
          rows={exportRows}
        />
      </div>

      {/* 데이터 기준 정보 */}
      {basedOn && (
        <div className="bg-surface-2/50 border border-subtle rounded-xl p-3 flex flex-wrap gap-4" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
          <span>📅 예측 기반</span>
          <span>최근 <span className="text-text-secondary font-semibold">{basedOn.recentDays}일</span> 데이터</span>
          <span>일 평균 지원자: <span className="text-text-secondary font-semibold">{basedOn.avgApplicant}명</span></span>
          <span>일 평균 비용: <span className="text-text-secondary font-semibold">{fmt.cost(basedOn.avgCost)}</span></span>
          <span className="text-text-muted">신뢰구간 ±20%</span>
        </div>
      )}

      {/* 추이 차트 */}
      <div className="card">
        <div className="card-title">📊 주차별 예상 지원자 추이</div>
        {loading ? (
          <div className="skeleton" style={{ height: 224 }} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
              <defs>
                <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={theme.colorChartBar} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={theme.colorChartBar} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: theme.fontSizeChartAxis }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, fontSize: theme.fontSizeChartAxis }}
                formatter={(v: any) => [`${fmt.number(v)}명`]}
              />
              <Area type="monotone" dataKey="high"       stroke="transparent" fill="#0ea5e9" fillOpacity={0.1} />
              <Area type="monotone" dataKey="applicant"  stroke={theme.colorChartBar} strokeWidth={2.5} fill="url(#appGrad)" />
              <Area type="monotone" dataKey="low"        stroke="transparent" fill="#020817" fillOpacity={1} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 주차별 테이블 */}
      <div className="card">
        <div className="section-header">
          <span className="card-title mb-0">📋 주차별 상세 전망</span>
          {budgetDirty && (
            <button
              onClick={applyBudgets}
              className="px-4 py-1.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent-hover transition-all" style={{ fontSize: 'var(--font-body)' }}
            >
              예산 적용하여 재계산
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 48 }} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left w-8"></th>
                  <th className="text-left">주차</th>
                  <th className="text-right">예상 지원자</th>
                  <th className="text-right">신뢰구간</th>
                  <th className="text-right">예상 CPA</th>
                  <th className="text-right">주 예산 입력</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(week => {
                  const isOpen = expanded[week.weekLabel];
                  const hasHoliday = week.days.some(d => d.isHoliday);

                  return [
                    // 주차 행
                    <tr
                      key={week.weekLabel}
                      className="border-t border-def bg-surface-2/20 cursor-pointer hover:bg-surface-2/40"
                      onClick={() => toggleWeek(week.weekLabel)}
                    >
                      <td style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>{isOpen ? '▼' : '▶'}</td>
                      <td className="font-semibold" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-primary)' }}>
                        {week.weekLabel}
                        {hasHoliday && <span style={{ marginLeft: 8, fontSize: 'var(--font-small)', color: 'var(--color-chart-line)' }}>공휴일 포함</span>}
                      </td>
                      <td className="text-right font-bold" style={{ color: "var(--color-accent)" }}>
                        {fmt.number(week.applicant)}명
                      </td>
                      <td className="text-right" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                        {fmt.number(week.applicantLow)} ~ {fmt.number(week.applicantHigh)}
                      </td>
                      <td className="text-right text-text-secondary">{fmt.cost(week.cpa)}</td>
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            placeholder="주 예산"
                            value={weekBudgets[week.weekLabel] ?? ''}
                            onChange={e => handleBudgetChange(week.weekLabel, e.target.value)}
                            step={100000}
                            className="w-28 bg-surface-2 border border-def rounded-lg px-2 py-1 text-text-secondary focus:border-accent focus:outline-none text-right" style={{ fontSize: 'var(--font-body)' }}
                          />
                        </div>
                      </td>
                    </tr>,

                    // 요일별 행 (펼쳐진 경우)
                    ...(isOpen ? week.days.map(day => (
                      <tr
                        key={day.date}
                        className={`border-b border-subtle/30 ${day.isHoliday ? 'bg-amber-500/5' : ''}`}
                      >
                        <td></td>
                        <td className="pl-6 py-1.5" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                          <span style={{ fontSize: 'var(--font-body)' }}>{day.date}</span>
                          <span className="ml-2 text-text-muted">({day.dayOfWeek})</span>
                          {day.isHoliday && <span style={{ marginLeft: 8, fontSize: 'var(--font-small)', color: 'var(--color-chart-line)' }}>공휴일</span>}
                        </td>
                        <td className="text-right" style={{ fontSize: 'var(--font-body)', color: day.isHoliday ? 'var(--color-chart-line)' : 'var(--color-text-secondary)' }}>
                          {fmt.number(day.applicant)}명
                        </td>
                        <td className="text-right" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                          {fmt.number(day.applicantLow)} ~ {fmt.number(day.applicantHigh)}
                        </td>
                        <td className="text-right" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>{fmt.cost(day.cpa)}</td>
                        <td></td>
                      </tr>
                    )) : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="" style={{ fontSize: 'var(--font-small)', color: 'var(--color-text-muted)' }}>
        * 예측은 2025년 요일×월 계절성 지수와 최근 14일 추세를 조합한 통계 모델입니다.
          날씨, 외부 이벤트 등 미반영 요소로 인해 실제 성과와 차이가 발생할 수 있습니다.
      </p>
    </div>
  );
}
