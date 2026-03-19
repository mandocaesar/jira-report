'use client';

import { UserUtilization } from '@/types';
import Image from 'next/image';

interface UserUtilizationCardProps {
    utilization: UserUtilization;
}

export default function UserUtilizationCard({ utilization }: UserUtilizationCardProps) {
    const { user, storyPoints, workingDays, leaveDays, availableDays, utilizationPercent, status, role, title, workTypeStats, isUnrecognized } = utilization;
    const effectiveMandays = utilization.effectiveMandays;
    const workingHoursPerDay = utilization.workingHoursPerDay;
    const teamStandardHours = utilization.teamStandardHours;
    const hasNonStandardHours = workingHoursPerDay != null && teamStandardHours != null && workingHoursPerDay !== teamStandardHours;

    const statusConfig = {
        under: { text: 'text-blue-400', bar: 'bg-blue-500', accent: 'bg-blue-500', label: 'Under-utilized' },
        optimal: { text: 'text-green-400', bar: 'bg-green-500', accent: 'bg-green-500', label: 'On track' },
        over: { text: 'text-amber-400', bar: 'bg-amber-500', accent: 'bg-amber-500', label: 'Over capacity' },
    };

    const cfg = statusConfig[status];
    const displayPercent = Math.min(utilizationPercent, 150);

    const roleBadge = role === 'qa'
        ? 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/20'
        : 'bg-blue-500/15 text-blue-400 ring-blue-500/20';

    const initials = user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className="relative rounded-lg border border-border bg-background overflow-hidden transition-all duration-200 hover:border-muted-foreground/30">
            <div className={`h-px ${cfg.accent}`} />

            <div className="px-3 py-2.5 space-y-2">
                {/* Header: Avatar + Name + Role + Metrics inline */}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md overflow-hidden bg-muted ring-1 ring-border shrink-0">
                        {user.avatarUrl ? (
                            <Image src={user.avatarUrl} alt={user.displayName} width={28} height={28} className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-semibold text-[10px]">
                                {initials}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h3 className="font-semibold text-foreground text-xs leading-tight truncate">
                                {user.displayName}
                            </h3>
                            {isUnrecognized && (
                                <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-amber-500/20 text-amber-400 text-[7px] shrink-0 cursor-help" title="Not in team roster">!</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded ring-1 ${roleBadge}`}>
                                {role}
                            </span>
                            {hasNonStandardHours && (
                                <span className="text-[9px] font-semibold px-1 py-px rounded ring-1 bg-amber-500/15 text-amber-400 ring-amber-500/20" title={`Works ${workingHoursPerDay}h/day (team standard: ${teamStandardHours}h)`}>
                                    {workingHoursPerDay}h/day
                                </span>
                            )}
                            {title && <span className="text-[10px] text-muted-foreground truncate">{title}</span>}
                        </div>
                    </div>
                </div>

                {/* Compact metrics + utilization bar */}
                <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-baseline gap-1">
                        <span className="text-muted-foreground">Pts</span>
                        <span className="text-sm font-bold text-foreground tabular-nums">{storyPoints}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-muted-foreground">Avail</span>
                        <span className="text-sm font-bold text-foreground tabular-nums">{effectiveMandays != null && effectiveMandays !== availableDays ? effectiveMandays.toFixed(1) : availableDays}</span>
                        {leaveDays > 0 ? (
                            <span className="text-red-400 font-medium">(-{leaveDays})</span>
                        ) : (
                            <span className="text-muted-foreground">/{workingDays}</span>
                        )}
                    </div>
                    <div className="ml-auto flex items-baseline gap-1">
                        <span className={`text-xs font-bold tabular-nums ${cfg.text}`}>
                            {utilizationPercent.toFixed(1)}%
                        </span>
                        {status !== 'optimal' && (
                            <span className={`text-[9px] ${cfg.text}`}>
                                {status === 'over' ? '▲' : '▼'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${cfg.bar} rounded-full transition-all duration-500 ease-out`}
                        style={{ width: `${Math.min(displayPercent, 100)}%` }}
                    />
                </div>

                {/* Work Type Tags */}
                {workTypeStats && Object.keys(workTypeStats).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                        {workTypeStats['Product'] > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-400 bg-green-500/10 ring-1 ring-green-500/20 rounded px-1.5 py-px">
                                <span className="w-1 h-1 rounded-full bg-green-400" />
                                Prod <span className="font-bold">{workTypeStats['Product']}</span>
                            </span>
                        )}
                        {workTypeStats['Technical Initiatives'] > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20 rounded px-1.5 py-px">
                                <span className="w-1 h-1 rounded-full bg-blue-400" />
                                Tech <span className="font-bold">{workTypeStats['Technical Initiatives']}</span>
                            </span>
                        )}
                        {workTypeStats['Incident'] > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-red-400 bg-red-500/10 ring-1 ring-red-500/20 rounded px-1.5 py-px">
                                <span className="w-1 h-1 rounded-full bg-red-400" />
                                Bug <span className="font-bold">{workTypeStats['Incident']}</span>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
