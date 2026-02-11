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
} from 'recharts';
import { format as formatDate, parseISO, isValid } from 'date-fns';

interface WeeklyCaloriesChartProps {
    data: { date: string; calories: number }[];
    goal?: number;
}

const formatTick = (value: string) => {
    if (!value) return '';
    const parsed = parseISO(value);
    if (!isValid(parsed)) return value;
    return formatDate(parsed, 'M/d (EEE)');
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const cal = payload[0]?.value ?? 0;
    const parsed = parseISO(label);
    const dateLabel = isValid(parsed) ? formatDate(parsed, 'yyyy/M/d (EEE)') : label;
    return (
        <div className="bg-white px-4 py-3 rounded-xl shadow-lg border border-gray-100 text-sm">
            <p className="text-gray-500 mb-1 text-xs">{dateLabel}</p>
            <p className="font-bold text-gray-900 text-lg">{cal.toLocaleString()} <span className="text-xs font-normal text-gray-400">kcal</span></p>
        </div>
    );
};

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data, goal = 2267 }) => {
    return (
        <div className="w-full p-6 h-full flex flex-col">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">週間カロリー推移</h3>
                    <p className="text-xs text-gray-400 mt-0.5">直近7日間の摂取エネルギー</p>
                </div>
                {data.length > 0 && (
                    <div className="text-right">
                        <p className="text-xs text-gray-400">7日間平均</p>
                        <p className="text-lg font-bold text-gray-900">
                            {Math.round(data.reduce((s, d) => s + d.calories, 0) / data.length).toLocaleString()}
                            <span className="text-xs font-normal text-gray-400 ml-1">kcal</span>
                        </p>
                    </div>
                )}
            </div>
            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{
                            top: 16,
                            right: 16,
                            left: 8,
                            bottom: 8,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatTick}
                            tick={{ fontSize: 12, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#9CA3AF' }}
                            axisLine={false}
                            tickLine={false}
                            width={45}
                            domain={[0, 'auto']}
                            tickFormatter={(v) => v.toLocaleString()}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: 'rgba(59,130,246,0.04)' }}
                        />
                        {goal && (
                            <ReferenceLine
                                y={goal}
                                stroke="#EF4444"
                                strokeDasharray="6 4"
                                strokeWidth={1.5}
                                label={{
                                    position: 'insideTopRight',
                                    value: `目標 ${goal.toLocaleString()}`,
                                    fill: '#EF4444',
                                    fontSize: 11,
                                }}
                            />
                        )}
                        <Bar
                            dataKey="calories"
                            fill="#10B981"
                            radius={[6, 6, 0, 0]}
                            barSize={36}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
