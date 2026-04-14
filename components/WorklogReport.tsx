'use client';

import { useState, useEffect } from 'react';
import { WorklogReportData } from '@/types';
import { getHeatmapColor } from '@/lib/ui-colors';

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
            <div className="flex flex-col items-center justify-center p-12 mt-8 space-y-4 text-muted-foreground bg-muted/20 rounded-xl border border-border animate-pulse">
                <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                <p>Calculating worklogs and daily hours...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 mt-8 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 font-medium flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Error: {error}
                </p>
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

            <div className="bg-muted/30 border border-border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                        <tr>
                            <th className="px-5 py-4 font-medium min-w-[200px] border-r border-border bg-background/80 sticky left-0 z-10">Team Member</th>
                            {data.dates.map((date, index) => {
                                const isWeekend = weekendIndices.includes(index);
                                return (
                                    <th key={date} className={`px-2 py-4 font-medium text-center min-w-[60px] ${isWeekend ? 'bg-muted/30 text-muted-foreground/50' : ''}`}>
                                        <div className="flex flex-col items-center gap-1">
                                            <span>{formatDay(date).split(' ')[0]}</span>
                                            <span className={`text-[10px] ${isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{formatDay(date).split(' ')[1]}</span>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="px-5 py-4 font-bold text-center text-emerald-400 border-l border-border min-w-[80px]">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {data.memberWorklogs.map((member) => (
                            <tr key={member.accountId} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3 border-r border-border bg-background/50 sticky left-0 z-10 backdrop-blur-sm">
                                    <div className="flex items-center gap-3">
                                        {member.avatarUrl ? (
                                            <img
                                                src={member.avatarUrl}
                                                alt={member.displayName}
                                                className="w-8 h-8 rounded-full ring-2 ring-border shrink-0"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full ring-2 ring-border bg-foreground flex items-center justify-center text-background font-bold text-xs shrink-0">
                                                {member.displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-medium text-foreground truncate" title={member.displayName}>
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
                                        <td key={log.date} className={`px-1 py-3 text-center ${isWeekend ? 'bg-muted/10' : ''}`}>
                                            <div className={`w-10 h-8 mx-auto flex items-center justify-center rounded border font-medium text-xs ${heatClass}`}>
                                                {log.hours > 0 ? log.hours.toFixed(1).replace('.0', '') : '-'}
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-5 py-3 text-center border-l border-border font-bold bg-muted/10">
                                    <span className={member.totalHours >= 60 ? 'text-emerald-400' : 'text-foreground/70'}>
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
