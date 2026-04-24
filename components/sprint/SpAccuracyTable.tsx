'use client';

import { SpAccuracy } from '@/types';

interface SpAccuracyTableProps {
    spAccuracy: SpAccuracy;
}

function getAccuracyColor(accuracy: number | null): string {
    if (accuracy === null) return 'text-muted-foreground';
    if (accuracy >= 90 && accuracy <= 110) return 'text-green-400';
    if (accuracy >= 75 && accuracy <= 125) return 'text-amber-400';
    return 'text-red-400';
}

function getAccuracyBadge(accuracy: number | null): { label: string; className: string } {
    if (accuracy === null) return { label: 'No data', className: 'bg-muted/50 text-muted-foreground' };
    if (accuracy >= 90 && accuracy <= 110) return { label: 'On Track', className: 'bg-green-500/20 text-green-400' };
    if (accuracy > 110) return { label: 'Over-estimated', className: 'bg-amber-500/20 text-amber-400' };
    return { label: 'Under-estimated', className: 'bg-red-500/20 text-red-400' };
}

export default function SpAccuracyTable({ spAccuracy }: SpAccuracyTableProps) {
    const { expectedHoursPerSP, teamCompletedPoints, teamWorklogHours, teamAvgHoursPerSP, teamAccuracy, members } = spAccuracy;

    if (teamCompletedPoints === 0) return null;

    const teamBadge = getAccuracyBadge(teamAccuracy);

    return (
        <div className="px-2 pb-2">
            <div className="bg-muted/30 rounded-lg border border-border p-3">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3 cursor-help"
                    title={`Compares actual logged hours per story point against the expected ${expectedHoursPerSP}h/SP (1 SP = 1 manday = ${expectedHoursPerSP} hours). Accuracy = expected / actual × 100%.`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    SP Estimation Accuracy
                    <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${teamBadge.className}`}>
                        {teamBadge.label}
                    </span>
                </h3>

                {/* Team Summary Row */}
                <div className="bg-muted/20 rounded-lg border border-border p-2.5 mb-2.5 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground">Expected</span>
                        <span className="text-sm font-bold text-foreground">{expectedHoursPerSP}h / SP</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground">Actual Avg</span>
                        <span className={`text-sm font-bold ${getAccuracyColor(teamAccuracy)}`}>
                            {teamAvgHoursPerSP !== null ? `${teamAvgHoursPerSP}h / SP` : '—'}
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground">Accuracy</span>
                        <span className={`text-sm font-bold ${getAccuracyColor(teamAccuracy)}`}>
                            {teamAccuracy !== null ? `${teamAccuracy}%` : '—'}
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground">Completed</span>
                        <span className="text-sm font-bold text-foreground">{teamCompletedPoints} SP</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground">Total Logged</span>
                        <span className="text-sm font-bold text-foreground">{teamWorklogHours}h</span>
                    </div>
                </div>

                {/* Per-member table */}
                {members.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border">
                                    <th className="text-left py-1.5 pr-2 font-medium">Member</th>
                                    <th className="text-left py-1.5 pr-2 font-medium">Role</th>
                                    <th className="text-right py-1.5 pr-2 font-medium">Done SP</th>
                                    <th className="text-right py-1.5 pr-2 font-medium">Logged</th>
                                    <th className="text-right py-1.5 pr-2 font-medium">Avg h/SP</th>
                                    <th className="text-right py-1.5 font-medium">Accuracy</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((m, i) => (
                                    <tr key={i} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 pr-2 text-foreground font-medium truncate max-w-[140px]">{m.name}</td>
                                        <td className="py-1.5 pr-2">
                                            <span className={`text-[10px] px-1 py-0.5 rounded ${m.role === 'qa' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                                {m.role === 'qa' ? 'QA' : 'ENG'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 pr-2 text-right text-foreground">{m.completedPoints}</td>
                                        <td className="py-1.5 pr-2 text-right text-muted-foreground">{m.worklogHours}h</td>
                                        <td className="py-1.5 pr-2 text-right text-muted-foreground">
                                            {m.avgHoursPerSP !== null ? `${m.avgHoursPerSP}h` : '—'}
                                        </td>
                                        <td className={`py-1.5 text-right font-bold ${getAccuracyColor(m.accuracy)}`}>
                                            {m.accuracy !== null ? `${m.accuracy}%` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-2 text-[10px] text-muted-foreground">
                    Baseline: 1 SP = 1 Manday = {expectedHoursPerSP}h. Accuracy = {expectedHoursPerSP}h ÷ actual avg hours × 100%.
                </div>
            </div>
        </div>
    );
}
