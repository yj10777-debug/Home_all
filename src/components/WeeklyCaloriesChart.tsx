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
    return formatDate(parsed, 'M/d');
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const cal = payload[0]?.value ?? 0;
    return (
        <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-100 text-sm">
            <p className="text-gray-500 mb-1">{formatTick(label)}</p>
            <p className="font-bold text-gray-900">{cal.toLocaleString()} kcal</p>
        </div>
    );
};

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data, goal = 2267 }) => {
    return (
        <div className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="mb-2">
                <h3 className="text-lg font-bold text-gray-800">週間カロリー推移</h3>
                <p className="text-sm text-gray-500">直近7日間の摂取エネルギー</p>
            </div>
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{
                            top: 16,
                            right: 8,
                            left: 8,
                            bottom: 4,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatTick}
                            tick={{ fontSize: 12, fill: '#6B7280' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#6B7280' }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                            domain={[0, 'auto']}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                        />
                        {goal && (
                            <ReferenceLine
                                y={goal}
                                stroke="#EF4444"
                                strokeDasharray="3 3"
                                label={{ position: 'insideTopRight', value: '目標', fill: '#EF4444', fontSize: 11 }}
                            />
                        )}
                        <Bar
                            dataKey="calories"
                            fill="#3B82F6"
                            radius={[4, 4, 0, 0]}
                            barSize={28}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
