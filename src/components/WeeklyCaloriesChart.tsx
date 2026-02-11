'use client';

import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Cell,
} from 'recharts';
import { format as formatDate, parseISO, isValid } from 'date-fns';

interface WeeklyCaloriesChartProps {
    data: { date: string; calories: number }[];
    goal?: number;
    /** バーがクリックされた時のコールバック */
    onBarClick?: (date: string) => void;
}

const formatTick = (value: string) => {
    if (!value) return '';
    const parsed = parseISO(value);
    if (!isValid(parsed)) return value;
    return formatDate(parsed, 'M/d(EEE)');
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const cal = payload[0]?.value ?? 0;
    const parsed = parseISO(label);
    const dateLabel = isValid(parsed) ? formatDate(parsed, 'yyyy/M/d(EEE)') : label;
    return (
        <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-100 text-xs">
            <p className="text-gray-500 mb-0.5">{dateLabel}</p>
            <p className="font-bold text-gray-900 text-sm">{cal.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">kcal</span></p>
        </div>
    );
};

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data, goal = 2267, onBarClick }) => {
    const handleClick = (entry: any) => {
        if (onBarClick && entry?.date) {
            onBarClick(entry.date);
        }
    };

    return (
        <div className="w-full p-4 h-full flex flex-col">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">週間カロリー推移</h3>
                    <p className="text-[10px] text-gray-400">クリックで日別詳細を表示</p>
                </div>
                {data.length > 0 && (
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400">7日間平均</p>
                        <p className="text-sm font-bold text-gray-900">
                            {Math.round(data.reduce((s, d) => s + d.calories, 0) / data.length).toLocaleString()}
                            <span className="text-[10px] font-normal text-gray-400 ml-0.5">kcal</span>
                        </p>
                    </div>
                )}
            </div>
            <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
                        onClick={(state: any) => {
                            if (state?.activePayload?.[0]?.payload) {
                                handleClick(state.activePayload[0].payload);
                            }
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="date" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={40} domain={[0, 'auto']} tickFormatter={(v) => v.toLocaleString()} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                        {goal && (
                            <ReferenceLine y={goal} stroke="#EF4444" strokeDasharray="6 4" strokeWidth={1.5}
                                label={{ position: 'insideTopRight', value: `目標 ${goal.toLocaleString()}`, fill: '#EF4444', fontSize: 10 }} />
                        )}
                        <Bar dataKey="calories" radius={[4, 4, 0, 0]} barSize={32} style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
                            {data.map((entry, index) => (
                                <Cell key={index} fill={entry.calories > goal ? '#F59E0B' : '#10B981'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
