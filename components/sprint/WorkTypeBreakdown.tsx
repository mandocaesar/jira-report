import { WORK_TYPE_COLORS, StatusColorSet } from '@/lib/ui-colors';

interface WorkTypeBreakdownProps {
    workTypeStats: Record<string, number>;
    totalStoryPoints: number;
}

const defaultColor: StatusColorSet = { bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400', bar: 'bg-gray-500' };

export default function WorkTypeBreakdown({ workTypeStats, totalStoryPoints }: WorkTypeBreakdownProps) {
    if (!workTypeStats || Object.keys(workTypeStats).length === 0) return null;

    return (
        <div className="px-2 pb-1">
            <div className="bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border">
                <div className="flex items-center gap-3">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 cursor-help" title="Classification based on the parent epic's work type label (Product, Technical Initiatives, or Incident). Points are from sub-tasks/sub-chores.">Work Type</h3>

                    {/* Stacked horizontal bar */}
                    <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 flex-1">
                        {Object.entries(workTypeStats).map(([type, points]) => {
                            const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                            if (percentage === 0) return null;
                            const colors = WORK_TYPE_COLORS[type] || defaultColor;
                            return (
                                <div
                                    key={type}
                                    className={`${colors.bar} transition-all duration-700 first:rounded-l-full last:rounded-r-full`}
                                    style={{ width: `${percentage}%` }}
                                    title={`${type}: ${points} pts (${percentage.toFixed(0)}%)`}
                                />
                            );
                        })}
                    </div>

                    <span className="text-[9px] text-muted-foreground shrink-0">{totalStoryPoints} pts</span>
                </div>

                {/* Legend pills */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(workTypeStats).map(([type, points]) => {
                        const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                        const colors = WORK_TYPE_COLORS[type] || defaultColor;
                        const dot = <span className={`w-2 h-2 rounded-full ${colors.bar} inline-block`} />;
                        return (
                            <div
                                key={type}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded ${colors.bg} border ${colors.border}`}
                            >
                                {dot}
                                <span className={`text-[11px] font-medium ${colors.text}`}>{type}</span>
                                <span className="text-[11px] font-bold text-foreground ml-1">{points} pts</span>
                                <span className="text-[10px] text-muted-foreground">({percentage.toFixed(0)}%)</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
