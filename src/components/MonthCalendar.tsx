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
};

export default function MonthCalendar({ days, initialMonth = new Date() }: Props) {
    const [currentMonth, setCurrentMonth] = useState(initialMonth);

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
            {/* ヘッダー: 月切り替え */}
            <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-xl font-bold text-gray-800">
                    {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                </h3>
                <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">今日</button>
                    <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 text-center mb-2 text-sm font-semibold text-gray-400">
                {['日', '月', '火', '水', '木', '金', '土'].map((dw, i) => (
                    <div key={i} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>{dw}</div>
                ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr">
                {/* 開始曜日のオフセット（空白） */}
                {[...Array(startDayOfWeek)].map((_, i) => <div key={`empty-${i}`} />)}

                {allDays.map((dateObj) => {
                    const dateStr = format(dateObj, 'yyyy-MM-dd');
                    const dayData = daysMap.get(dateStr);
                    const isTodayDate = isToday(dateObj);

                    if (!dayData) {
                        // データなしの日
                        return (
                            <div key={dateStr} className={`relative p-2 rounded-xl border border-transparent bg-gray-50/50 min-h-[100px] flex flex-col justify-between ${isTodayDate ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : ''}`}>
                                <span className={`text-sm ${isTodayDate ? 'font-bold text-indigo-600' : 'text-gray-400'}`}>
                                    {format(dateObj, 'd')}
                                </span>
                                <span className="self-center text-xs text-gray-300">-</span>
                                <div className="h-4" />
                            </div>
                        );
                    }

                    // データありの日
                    const scoreColor = dayData.hasEvaluation
                        ? getScoreColor(dayData.score)
                        : 'text-gray-400 bg-gray-50 border-gray-200';

                    return (
                        <Link
                            href={`/day/${dateStr}`}
                            key={dateStr}
                            className={`relative p-2 rounded-xl border min-h-[100px] flex flex-col justify-between hover:shadow-lg transition-all transform hover:-translate-y-0.5 group ${scoreColor} ${isTodayDate ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                        >
                            {/* 上部: 日付とマーク */}
                            <div className="flex justify-between items-start w-full">
                                <span className={`text-sm font-semibold tracking-tight`}>
                                    {format(dateObj, 'd')}
                                </span>
                                {dayData.hasStrong && <span className="text-sm" title="筋トレ実施">💪</span>}
                            </div>

                            {/* 中央: スコア */}
                            <div className="flex flex-col items-center justify-center -mt-1">
                                {dayData.hasEvaluation ? (
                                    <>
                                        <span className="text-3xl font-bold tracking-tighter leading-none">{dayData.score}</span>
                                        <span className="text-[10px] opacity-70 font-medium tracking-wider">POINT</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-400 font-medium opacity-50">-</span>
                                )}
                            </div>

                            {/* 下部: 歩数 */}
                            <div className="w-full text-right">
                                {dayData.steps != null && dayData.steps > 0 && (
                                    <div className="inline-flex items-center gap-1 text-xs font-semibold opacity-90" title={`${dayData.steps.toLocaleString()}歩`}>
                                        <span className="text-[10px]">👣</span>
                                        {dayData.steps.toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
