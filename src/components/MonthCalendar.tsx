import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMonths, subMonths } from 'date-fns';
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

const GOAL_CALORIES = 2267;

type Props = {
    days: CalendarDay[];
    initialMonth?: Date;
    /** true のときセル高さを小さく表示 */
    compact?: boolean;
    /** 選択中の日付（右パネル連動用） */
    selectedDate?: string | null;
    /** 日付クリック時のコールバック（指定時は選択のみ） */
    onSelectDate?: (date: string | null) => void;
    /** セルにカロリー表示・凡例表示（参考デザイン風） */
    showCaloriesInCell?: boolean;
    /** 月変更時に親へ通知（サマリーカード用） */
    onMonthChange?: (month: Date) => void;
};

export default function MonthCalendar({
    days,
    initialMonth = new Date(),
    compact = false,
    selectedDate = null,
    onSelectDate,
    showCaloriesInCell = false,
    onMonthChange,
}: Props) {
    const [currentMonth, setCurrentMonth] = useState(initialMonth);

    useEffect(() => {
        onMonthChange?.(currentMonth);
    }, [currentMonth, onMonthChange]);

    if (!days) {
        return <div className="h-full flex items-center justify-center text-gray-400 text-sm">データ読み込み中...</div>;
    }

    // 日付文字列(YYYY-MM-DD)をキーにしたマップを作成
    const daysMap = new Map<string, CalendarDay>();
    days.forEach(d => daysMap.set(d.date, d));

    // カレンダーグリッド生成
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDayOfWeek = getDay(monthStart); // 0(Sun) - 6(Sat)

    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    /** スコアによる色分け（テーマの primary を使用） */
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-[var(--primary)]';
        if (score >= 60) return 'text-amber-400';
        return 'text-red-400';
    };

    /** 目標達成：スコア80以上 または カロリーが目標±10%以内 */
    const isGoalMet = (d: CalendarDay) =>
        (d.hasEvaluation && d.score >= 80) ||
        (d.calories > 0 && Math.abs(d.calories - GOAL_CALORIES) / GOAL_CALORIES <= 0.1);

    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    return (
        <div className="flex flex-col h-full">
            {/* 月ナビ: 参考デザイン風（前月/翌月ボタン＋月表示） */}
            <div className="flex items-center justify-between mb-4 gap-2">
                <button type="button" onClick={prevMonth} className="min-w-[36px] min-h-[36px] p-2 rounded-lg transition-colors hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center" aria-label="前月">
                    <span className="material-symbols-outlined text-xl">chevron_left</span>
                </button>
                <h3 className="text-base font-bold text-[var(--text-primary)] flex-1 text-center tabular-nums">
                    {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                </h3>
                <div className="flex items-center gap-1 min-w-[36px] justify-end">
                    <button type="button" onClick={() => setCurrentMonth(new Date())} className="min-h-[36px] px-2 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--bg-card-hover)] text-[var(--text-tertiary)]">今日</button>
                    <button type="button" onClick={nextMonth} className="min-w-[36px] min-h-[36px] p-2 rounded-lg transition-colors hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center" aria-label="翌月">
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                    </button>
                </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 text-center mb-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                {['日', '月', '火', '水', '木', '金', '土'].map((dw, i) => (
                    <div key={i} className="py-1">{dw}</div>
                ))}
            </div>

            {/* 日付グリッド（ダークセル・今日は primary 枠） */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 flex-1 auto-rows-fr">
                {[...Array(startDayOfWeek)].map((_, i) => (
                    <div key={`empty-${i}`} className="bg-[var(--surface-dark)] rounded-lg min-h-[64px] sm:min-h-[72px] opacity-40" />
                ))}

                {allDays.map((dateObj) => {
                    const dateStr = format(dateObj, 'yyyy-MM-dd');
                    const dayData = daysMap.get(dateStr);
                    const isTodayDate = isToday(dateObj);

                    if (!dayData) {
                        return (
                            <div
                                key={dateStr}
                                className={`relative p-2 rounded-lg ${compact ? 'min-h-[64px] sm:min-h-[72px]' : 'min-h-[88px] sm:min-h-[100px]'} flex flex-col justify-between ${isTodayDate ? 'bg-[var(--border-card)] ring-1 ring-[var(--primary)] ring-inset' : 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'} transition-colors`}
                            >
                                <span className={`text-sm tabular-nums ${isTodayDate ? 'font-bold text-[var(--primary)]' : 'text-[var(--text-tertiary)]'}`}>
                                    {format(dateObj, 'd')}
                                </span>
                                <span className="self-center text-sm text-[var(--text-tertiary)] opacity-70">-</span>
                                <div className="h-4" />
                            </div>
                        );
                    }

                    const scoreColor = dayData.hasEvaluation ? getScoreColor(dayData.score) : 'text-[var(--text-primary)]';
                    const selected = selectedDate === dateStr;
                    const goalMet = isGoalMet(dayData);

                    const cellClass = `relative p-2 rounded-lg flex flex-col justify-between transition-all hover:bg-[var(--bg-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] group ${isTodayDate ? 'bg-[var(--border-card)] ring-1 ring-[var(--primary)] ring-inset' : 'bg-[var(--bg-card)] border border-transparent'} ${selected ? 'ring-2 ring-[var(--primary)] bg-[var(--border-card)]' : ''}`;

                    const content = (
                        <>
                            <div className="flex justify-between items-start w-full flex-shrink-0">
                                <span className="flex items-center gap-1 tabular-nums">
                                    <span className={`text-sm ${isTodayDate ? 'font-bold text-[var(--primary)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]'}`}>
                                        {format(dateObj, 'd')}
                                    </span>
                                    {dayData.hasStrong && <span className="text-xs opacity-80" title="筋トレ実施">💪</span>}
                                    {goalMet && <span className="text-xs opacity-80" title="目標達成">💮</span>}
                                </span>
                            </div>
                            {showCaloriesInCell ? (
                                <>
                                    <div className="flex flex-col items-center justify-center flex-1 min-h-0 py-0.5">
                                        <span className="text-[10px] sm:text-xs font-medium text-[var(--text-tertiary)] tabular-nums">
                                            {dayData.calories > 0 ? `${dayData.calories.toLocaleString()} kcal` : '—'}
                                        </span>
                                        {dayData.hasEvaluation && (
                                            <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>{dayData.score}</span>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex flex-col items-center justify-center flex-1 min-h-0 py-0.5">
                                        {dayData.hasEvaluation ? (
                                            <span className={`text-lg font-black tabular-nums leading-none ${scoreColor}`}>{dayData.score}</span>
                                        ) : (
                                            <span className="text-sm text-[var(--text-tertiary)] opacity-70">-</span>
                                        )}
                                    </div>
                                    <div className="w-full text-right flex-shrink-0">
                                        {dayData.steps != null && dayData.steps > 0 && (
                                            <span className="text-[10px] font-medium text-[var(--text-tertiary)]">
                                                {dayData.steps.toLocaleString()}歩
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    );

                    if (onSelectDate) {
                        return (
                            <button
                                type="button"
                                key={dateStr}
                                onClick={() => onSelectDate(dateStr)}
                                className={cellClass}
                            >
                                {content}
                            </button>
                        );
                    }

                    return (
                        <Link href={`/day/${dateStr}`} key={dateStr} className={cellClass}>
                            {content}
                        </Link>
                    );
                })}
            </div>

            {/* 凡例（💪=筋トレ、💮=目標達成） */}
            {showCaloriesInCell && (
                <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-[var(--border-card)] text-[10px] text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1.5">💪 筋トレ</span>
                    <span className="flex items-center gap-1.5">💮 目標達成</span>
                </div>
            )}
        </div>
    );
}
