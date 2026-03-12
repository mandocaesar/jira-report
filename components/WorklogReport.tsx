'use client';

import { useState, useEffect } from 'react';
import { WorklogReportData } from '@/types';

interface WorklogReportProps {
    boardId: number;
    sprintId: number;
}

// Function to format "YYYY-MM-DD" to short format like "Mon 12"
function formatDay(dateStr: string) {
    const d = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
}

// Heatmap colors based on hours logged
function getHeatmapColor(hours: number) {
    if (hours === 0) return 'bg-gray-800/30 text-gray-500';
    if (hours < 4) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (hours < 7) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (hours < 9) return 'bg-green-500/20 text-green-400 border-green-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30'; // Over 8 hours
}

export default function WorklogReport({ boardId, sprintId }: WorklogReportProps) {
    const [data, setData] = useState<WorklogReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchWorklogs() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/worklogs?boardId=${boardId}&sprintId=${sprintId}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch worklog data');
                }
                const result = await response.json();
                if (result.success) {
                    setData(result.data);
                } else {
                    throw new Error(result.error);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }

        if (boardId && sprintId) {
            fetchWorklogs();
        }
    }, [boardId, sprintId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 mt-8 space-y-4 text-gray-400 bg-gray-800/20 rounded-xl border border-gray-700/20 animate-pulse">
                <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                <p>Calculating worklogs and daily hours...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 mt-8 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 font-medium">⚠️ Error: {error}</p>
            </div>
        );
    }

    if (!data || data.memberWorklogs.length === 0) {
        return null;
    }

    // Determine weekends for column styling
    const weekendIndices = data.dates.reduce((acc, date, i) => {
        const day = new Date(date).getDay();
        if (day === 0 || day === 6) acc.push(i);
        return acc;
    }, [] as number[]);

    return (
        <div className="mt-2 space-y-6">
            <div className="flex items-center justify-end">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30"></div> &lt; 4h</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30"></div> 4-7h</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30"></div> 7-8h</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30"></div> &gt; 8h</div>
            </div>

            <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-900/50 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700/50">
                        <tr>
                            <th className="px-5 py-4 font-medium min-w-[200px] border-r border-gray-700/30 bg-gray-900/80 sticky left-0 z-10">Team Member</th>
                            {data.dates.map((date, index) => {
                                const isWeekend = weekendIndices.includes(index);
                                return (
                                    <th key={date} className={`px-2 py-4 font-medium text-center min-w-[60px] ${isWeekend ? 'bg-gray-800/50 text-gray-600' : ''}`}>
                                        <div className="flex flex-col items-center gap-1">
                                            <span>{formatDay(date).split(' ')[0]}</span>
                                            <span className={`text-[10px] ${isWeekend ? 'text-gray-600' : 'text-gray-500'}`}>{formatDay(date).split(' ')[1]}</span>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="px-5 py-4 font-bold text-center text-emerald-400 border-l border-gray-700/30 min-w-[80px]">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {data.memberWorklogs.map((member) => (
                            <tr key={member.accountId} className="hover:bg-gray-800/40 transition-colors">
                                <td className="px-5 py-3 border-r border-gray-700/30 bg-gray-800/10 sticky left-0 z-10 backdrop-blur-sm">
                                    <div className="flex items-center gap-3">
                                        {member.avatarUrl ? (
                                            <img
                                                src={member.avatarUrl}
                                                alt={member.displayName}
                                                className="w-8 h-8 rounded-full ring-2 ring-gray-700/50 shrink-0"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full ring-2 ring-gray-700/50 bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                                {member.displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-medium text-gray-200 truncate" title={member.displayName}>
                                                {member.displayName}
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${member.role === 'qa' ? 'text-indigo-400' : 'text-blue-400'
                                                }`}>
                                                {member.role}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                {member.dailyLogs.map((log, index) => {
                                    const isWeekend = weekendIndices.includes(index);
                                    const heatClass = getHeatmapColor(log.hours);

                                    return (
                                        <td key={log.date} className={`px-1 py-3 text-center ${isWeekend ? 'bg-gray-800/20' : ''}`}>
                                            <div className={`w-10 h-8 mx-auto flex items-center justify-center rounded border font-medium text-xs ${heatClass}`}>
                                                {log.hours > 0 ? log.hours.toFixed(1).replace('.0', '') : '-'}
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-5 py-3 text-center border-l border-gray-700/30 font-bold bg-gray-800/20">
                                    <span className={member.totalHours >= 60 ? 'text-emerald-400' : 'text-gray-300'}>
                                        {member.totalHours.toFixed(1).replace('.0', '')}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div >
    );
}
