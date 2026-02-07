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

interface WeeklyCaloriesChartProps {
    data: { date: string; calories: number }[];
    goal?: number;
}

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data, goal = 2000 }) => {
    return (
        <div className="w-full h-[300px] bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-800">週間カロリー推移</h3>
                <p className="text-sm text-gray-500">直近7日間の摂取エネルギー</p>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                        top: 5,
                        right: 10,
                        left: -20,
                        bottom: 0,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(value) => {
                            // Show MM/DD
                            const date = new Date(value);
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    {goal && (
                        <ReferenceLine y={goal} stroke="#EF4444" strokeDasharray="3 3" label={{ position: 'top', value: '目標', fill: '#EF4444', fontSize: 12 }} />
                    )}
                    <Bar
                        dataKey="calories"
                        fill="#3B82F6"
                        radius={[4, 4, 0, 0]}
                        barSize={30}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
