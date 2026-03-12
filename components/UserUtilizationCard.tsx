'use client';

import { UserUtilization } from '@/types';
import Image from 'next/image';

interface UserUtilizationCardProps {
    utilization: UserUtilization;
}

export default function UserUtilizationCard({ utilization }: UserUtilizationCardProps) {
    const { user, storyPoints, workingDays, leaveDays, availableDays, utilizationPercent, status, role, title, workTypeStats, isUnrecognized } = utilization;

    const statusColors = {
        under: {
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
            text: 'text-blue-400',
            bar: 'bg-blue-500',
        },
        optimal: {
            bg: 'bg-green-500/10',
            border: 'border-green-500/30',
            text: 'text-green-400',
            bar: 'bg-green-500',
        },
        over: {
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
            text: 'text-red-400',
            bar: 'bg-red-500',
        },
    };

    const colors = statusColors[status];
    const displayPercent = Math.min(utilizationPercent, 150); // Cap display at 150%

    // Role badge color
    const roleColor = role === 'qa' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border ${colors.border}
                  ${colors.bg} backdrop-blur-sm
                  hover:brightness-110 transition-all duration-300 group`}
        >
            {/* Background gradient effect */}
            <div className="absolute inset-0 bg-muted/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <div className="relative p-4">
                {/* User Info */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border">
                            {user.avatarUrl ? (
                                <Image
                                    src={user.avatarUrl}
                                    alt={user.displayName}
                                    width={40}
                                    height={40}
                                    className="object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-foreground flex items-center justify-center text-background font-bold text-sm">
                                    {user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        {/* Status indicator */}
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${colors.bar} rounded-full border-2 border-background`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground text-sm truncate flex items-center gap-1.5">
                            {user.displayName}
                            {isUnrecognized && (
                                <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] cursor-help" title="Not in team roster — sync team data to fix">
                                    !
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${roleColor} uppercase font-bold tracking-wider`}>
                                {role}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">{title}</span>
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="flex justify-between items-center mb-3 bg-muted/30 rounded-lg p-2">
                    <div className="text-center flex-1 border-r border-border/30">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Story Points</p>
                        <p className="text-lg font-bold text-foreground leading-none">{storyPoints}</p>
                    </div>
                    <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Available Days</p>
                        <div className="flex items-baseline justify-center gap-1 leading-none">
                            <p className="text-lg font-bold text-foreground">{availableDays}</p>
                            {leaveDays > 0 && (
                                <span className="text-[10px] text-red-400">(-{leaveDays})</span>
                            )}
                            {leaveDays === 0 && (
                                <span className="text-[10px] text-muted-foreground">/ {workingDays}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Utilization Bar */}
                <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">Utilization</span>
                        <span className={`text-xs font-bold ${colors.text}`}>
                            {utilizationPercent.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${colors.bar} rounded-full transition-all duration-500 ease-out`}
                            style={{ width: `${Math.min(displayPercent, 100)}%` }}
                        ></div>
                    </div>
                    {utilizationPercent > 100 && (
                        <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Over capacity
                        </p>
                    )}
                </div>

                {/* Work Type Breakdown */}
                {workTypeStats && Object.keys(workTypeStats).length > 0 && (
                    <div className="pt-2 border-t border-border">
                        <div className="flex flex-wrap gap-1.5">
                            {workTypeStats['Product'] > 0 && (
                                <div className="flex items-center gap-1 bg-green-500/10 px-1.5 py-0.5 rounded text-[9px] border border-green-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                                    <span className="text-green-300">Product</span>
                                    <span className="font-bold text-green-200 bg-green-500/20 px-1.5 rounded text-[10px]">{workTypeStats['Product']}</span>
                                </div>
                            )}
                            {workTypeStats['Technical Initiatives'] > 0 && (
                                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded text-xs border border-blue-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                                    <span className="text-blue-300">Tech</span>
                                    <span className="font-bold text-blue-200 bg-blue-500/20 px-1 rounded text-[9px]">{workTypeStats['Technical Initiatives']}</span>
                                </div>
                            )}
                            {workTypeStats['Incident'] > 0 && (
                                <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px] border border-red-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>
                                    <span className="text-red-300">Incident</span>
                                    <span className="font-bold text-red-200 bg-red-500/20 px-1 rounded text-[9px]">{workTypeStats['Incident']}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
