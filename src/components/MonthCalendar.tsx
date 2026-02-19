import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, addMonths, subMonths, parseISO, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import Link from 'next/link';

type CalendarDay = {
    date: string;
    score: number;
    hasStrong: boolean;
    hasEvaluation: boolean;
    steps: number | null;
    calories: number;
};

type Props = {
    days: CalendarDay[];
    initialMonth?: Date;
    /** true のときセル高さを小さく表示 */
    compact?: boolean;
};

export default function MonthCalendar({ days, initialMonth = new Date(), compact = false }: Props) {
    const [currentMonth, setCurrentMonth] = useState(initialMonth);

    if (!days) {
        return <div className="h-full flex items-center justify-center text-gray-400 text-sm">データ読み込み中...</div>;
    }

    // 日付文字列(YYYY-MM-DD)をキーにしたマップを作成
    const daysMap = new Map<string, CalendarDay>();
    days.forEach(d => daysMap.set(d.date, d));

    // カレンダーグリッド生成
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDate = monthStart;
    const startDayOfWeek = getDay(monthStart); // 0(Sun) - 6(Sat)

    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // スコアによる色分け
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-red-700 bg-red-50 border-red-200';
    };

    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    return (
        <div className="flex flex-col h-full">
            {/* 月ナビ: 中央に月、左右に前後ボタン・今日 */}
            <div className="flex items-center justify-between mb-4 gap-2">
                <button type="button" onClick={prevMonth} className="min-w-[44px] min-h-[44px] p-2 rounded-xl transition-colors hover:bg-[var(--bg-page)] text-[var(--text-secondary)] flex items-center justify-center" aria-label="前月">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex-1 text-center tabular-nums">
                    {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                </h3>
                <div className="flex items-center gap-1 min-w-[44px] justify-end">
                    <button type="button" onClick={() => setCurrentMonth(new Date())} className="min-h-[36px] px-3 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--bg-page)] text-[var(--text-secondary)]">今日</button>
                    <button type="button" onClick={nextMonth} className="min-w-[44px] min-h-[44px] p-2 rounded-xl transition-colors hover:bg-[var(--bg-page)] text-[var(--text-secondary)] flex items-center justify-center" aria-label="翌月">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 text-center mb-2 text-xs font-semibold text-[var(--text-tertiary)]">
                {['日', '月', '火', '水', '木', '金', '土'].map((dw, i) => (
                    <div key={i} className={i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}>{dw}</div>
                ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 flex-1 auto-rows-fr">
                {/* 開始曜日のオフセット（空白） */}
                {[...Array(startDayOfWeek)].map((_, i) => <div key={`empty-${i}`} />)}

                {allDays.map((dateObj) => {
                    const dateStr = format(dateObj, 'yyyy-MM-dd');
                    const dayData = daysMap.get(dateStr);
                    const isTodayDate = isToday(dateObj);

                    if (!dayData) {
                        return (
                            <div key={dateStr} className={`relative p-2 rounded-xl ${compact ? 'min-h-[64px] sm:min-h-[72px]' : 'min-h-[100px]'} flex flex-col justify-between ${isTodayDate ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-muted)]' : ''}`} style={{ backgroundColor: 'var(--bg-page)' }}>
                                <span className={`text-sm ${isTodayDate ? 'font-bold' : ''}`} style={{ color: isTodayDate ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                                    {format(dateObj, 'd')}
                                </span>
                                <span className="self-center text-xs text-[var(--text-tertiary)]">-</span>
                                <div className="h-4" />
                            </div>
                        );
                    }

                    const scoreColor = dayData.hasEvaluation
                        ? getScoreColor(dayData.score)
                        : 'text-[var(--text-tertiary)] border-[var(--border-card)]';
                    const scoreBg = dayData.hasEvaluation ? '' : 'bg-[var(--bg-page)]';

                    return (
                        <Link
                            href={`/day/${dateStr}`}
                            key={dateStr}
                            className={`relative p-2 rounded-xl border ${compact ? 'min-h-[64px] sm:min-h-[72px]' : 'min-h-[88px] sm:min-h-[100px]'} flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 group ${scoreColor} ${scoreBg} ${isTodayDate ? 'ring-2 ring-[var(--accent)] ring-offset-2' : ''}`}
                            style={{ borderColor: 'var(--border-card)', boxShadow: 'var(--shadow-card)' }}
                        >
                            <div className="flex justify-between items-start w-full flex-shrink-0">
                                <span className="text-sm font-semibold tabular-nums">{format(dateObj, 'd')}</span>
                                {dayData.hasStrong && <span className="text-xs opacity-80" title="筋トレ実施">💪</span>}
                            </div>
                            <div className="flex flex-col items-center justify-center flex-1 min-h-0 py-0.5">
                                {dayData.hasEvaluation ? (
                                    <>
                                        <span className="text-2xl sm:text-3xl font-bold tracking-tighter leading-none tabular-nums">{dayData.score}</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-[var(--text-tertiary)]">-</span>
                                )}
                            </div>
                            <div className="w-full text-right flex-shrink-0">
                                {dayData.steps != null && dayData.steps > 0 && (
                                    <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                                        {dayData.steps.toLocaleString()}歩
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
