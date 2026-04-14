import React from 'react';

interface RoleStats {
    count: number;
    mandays: number;
    storyPoints: number;
    leaveDays: number;
    workTypeStats?: Record<string, number>;
    effectiveMandays?: number;
}

interface RoleBreakdownCardProps {
    roleName: string;
    stats: RoleStats | null;
    accentColor: 'blue' | 'indigo';
}

const colorMap = {
    blue: {
        heading: 'text-blue-400',
        dot: 'bg-blue-400',
        util: 'text-blue-300',
    },
    indigo: {
        heading: 'text-indigo-400',
        dot: 'bg-indigo-400',
        util: 'text-indigo-300',
    },
};

const RoleBreakdownCard = React.memo(function RoleBreakdownCard({ roleName, stats, accentColor }: RoleBreakdownCardProps) {
    const colors = colorMap[accentColor];
    const count = stats?.count || 0;
    const mandays = stats?.mandays || 0;
    const effectiveMandays = stats?.effectiveMandays;
    const displayMandays = effectiveMandays != null && effectiveMandays !== mandays
        ? effectiveMandays.toFixed(1)
        : mandays;
    const storyPoints = stats?.storyPoints || 0;
    const leaveDays = stats?.leaveDays || 0;
    const denom = effectiveMandays ?? mandays;
    const utilPercent = denom > 0 ? (storyPoints / denom * 100).toFixed(0) : '0';
    const workTypeStats = stats?.workTypeStats;

    return (
        <div className="bg-muted/50 rounded-lg px-3 py-2 border border-border" title={`${roleName} breakdown`}>
            <div className="flex items-center gap-4">
                <h3 className={`text-sm font-bold ${colors.heading} flex items-center gap-1.5 shrink-0`}>
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                    {roleName} ({count})
                </h3>
                <div className="flex items-center gap-5">
                    <div>
                        <span className="text-[11px] text-muted-foreground">Mandays </span>
                        <span className="text-base font-bold text-foreground">{displayMandays}</span>
                        {leaveDays > 0 && (
                            <span className="text-[10px] text-red-500 ml-1 font-medium">-{leaveDays}</span>
                        )}
                    </div>
                    <div>
                        <span className="text-[11px] text-muted-foreground">Points </span>
                        <span className="text-base font-bold text-foreground">{storyPoints}</span>
                    </div>
                    <div>
                        <span className="text-[11px] text-muted-foreground">Util </span>
                        <span className={`text-base font-bold ${colors.util}`}>{utilPercent}%</span>
                    </div>
                </div>
                {workTypeStats && (
                    <div className="flex gap-2 ml-auto">
                        {(workTypeStats['Product'] || 0) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {workTypeStats['Product']}
                            </span>
                        )}
                        {(workTypeStats['Technical Initiatives'] || 0) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                {workTypeStats['Technical Initiatives']}
                            </span>
                        )}
                        {(workTypeStats['Incident'] || 0) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                {workTypeStats['Incident']}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default RoleBreakdownCard;
