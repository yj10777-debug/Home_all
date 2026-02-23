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

    /** スコアによる色分け（ダークテーマ用） */
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-[#19e619]';
        if (score >= 60) return 'text-amber-400';
        return 'text-red-400';
    };

    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    return (
        <div className="flex flex-col h-full">
            {/* 月ナビ: 参考デザイン風（前月/翌月ボタン＋月表示） */}
            <div className="flex items-center justify-between mb-4 gap-2">
                <button type="button" onClick={prevMonth} className="min-w-[36px] min-h-[36px] p-2 rounded-lg transition-colors hover:bg-white/5 text-slate-300 hover:text-white flex items-center justify-center" aria-label="前月">
                    <span className="material-symbols-outlined text-xl">chevron_left</span>
                </button>
                <h3 className="text-base font-bold text-white flex-1 text-center tabular-nums">
                    {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                </h3>
                <div className="flex items-center gap-1 min-w-[36px] justify-end">
                    <button type="button" onClick={() => setCurrentMonth(new Date())} className="min-h-[36px] px-2 text-sm font-medium rounded-lg transition-colors hover:bg-white/5 text-slate-400">今日</button>
                    <button type="button" onClick={nextMonth} className="min-w-[36px] min-h-[36px] p-2 rounded-lg transition-colors hover:bg-white/5 text-slate-300 hover:text-white flex items-center justify-center" aria-label="翌月">
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                    </button>
                </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 text-center mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                {['日', '月', '火', '水', '木', '金', '土'].map((dw, i) => (
                    <div key={i} className="py-1">{dw}</div>
                ))}
            </div>

            {/* 日付グリッド（ダークセル・今日は primary 枠） */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 flex-1 auto-rows-fr">
                {[...Array(startDayOfWeek)].map((_, i) => (
                    <div key={`empty-${i}`} className="bg-[#132513] rounded-lg min-h-[64px] sm:min-h-[72px] opacity-40" />
                ))}

                {allDays.map((dateObj) => {
                    const dateStr = format(dateObj, 'yyyy-MM-dd');
                    const dayData = daysMap.get(dateStr);
                    const isTodayDate = isToday(dateObj);

                    if (!dayData) {
                        return (
                            <div
                                key={dateStr}
                                className={`relative p-2 rounded-lg ${compact ? 'min-h-[64px] sm:min-h-[72px]' : 'min-h-[88px] sm:min-h-[100px]'} flex flex-col justify-between ${isTodayDate ? 'bg-[#244724] ring-1 ring-[#19e619] ring-inset' : 'bg-[#1a331a] hover:bg-[#214021]'} transition-colors`}
                            >
                                <span className={`text-sm tabular-nums ${isTodayDate ? 'font-bold text-[#19e619]' : 'text-slate-400'}`}>
                                    {format(dateObj, 'd')}
                                </span>
                                <span className="self-center text-sm text-slate-600">-</span>
                                <div className="h-4" />
                            </div>
                        );
                    }

                    const scoreColor = dayData.hasEvaluation ? getScoreColor(dayData.score) : 'text-white';

                    return (
                        <Link
                            href={`/day/${dateStr}`}
                            key={dateStr}
                            className={`relative p-2 rounded-lg flex flex-col justify-between transition-all hover:bg-[#214021] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#19e619] focus-visible:ring-offset-2 focus-visible:ring-offset-[#112211] group ${isTodayDate ? 'bg-[#244724] ring-1 ring-[#19e619] ring-inset' : 'bg-[#1a331a] border border-transparent'}`}
                        >
                            <div className="flex justify-between items-start w-full flex-shrink-0">
                                <span className={`text-sm tabular-nums ${isTodayDate ? 'font-bold text-[#19e619]' : 'text-slate-400 group-hover:text-white'}`}>
                                    {format(dateObj, 'd')}
                                </span>
                                {dayData.hasStrong && <span className="text-xs opacity-80" title="筋トレ実施">💪</span>}
                            </div>
                            <div className="flex flex-col items-center justify-center flex-1 min-h-0 py-0.5">
                                {dayData.hasEvaluation ? (
                                    <span className={`text-lg font-black tabular-nums leading-none ${scoreColor}`}>{dayData.score}</span>
                                ) : (
                                    <span className="text-sm text-slate-600">-</span>
                                )}
                            </div>
                            <div className="w-full text-right flex-shrink-0">
                                {dayData.steps != null && dayData.steps > 0 && (
                                    <span className="text-[10px] font-medium text-slate-500">
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
