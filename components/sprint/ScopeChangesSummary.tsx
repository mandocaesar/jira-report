interface ScopeChange {
    type: string;
    issueType?: string;
    issueKey?: string;
    summary?: string;
    pointsBefore?: number;
    pointsAfter?: number;
}

interface ScopeChangesSummaryProps {
    scopeChanges: ScopeChange[];
}

export default function ScopeChangesSummary({ scopeChanges }: ScopeChangesSummaryProps) {
    const scopeChangesByType = scopeChanges.reduce((acc, change) => {
        const type = change.issueType || 'Unknown';
        if (!acc[type]) acc[type] = { count: 0, added: 0, pointsChanged: 0 };
        acc[type].count++;
        if (change.type === 'added') acc[type].added++;
        else acc[type].pointsChanged++;
        return acc;
    }, {} as Record<string, { count: number; added: number; pointsChanged: number }>);

    if (Object.keys(scopeChangesByType).length === 0) return null;

    return (
        <div className="px-2 pb-2">
            <div className="bg-muted/30 rounded-lg border border-border overflow-hidden flex flex-col md:flex-row">
                {/* Section Hero KPI */}
                <div className="md:w-1/5 min-w-[150px] bg-muted/30 p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-border cursor-help" title="Total number of scope change events mid-sprint">
                    <h3 className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Scope Changes
                    </h3>
                    <div className="text-4xl font-bold text-orange-400 leading-tight pb-1">
                        {scopeChanges.length}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Total Events</div>
                </div>

                {/* Detailed Breakdown Grid */}
                <div className="md:w-4/5 p-3 flex flex-wrap gap-2.5">
                    {Object.entries(scopeChangesByType).map(([type, stats]) => (
                        <div key={type} className="flex-1 min-w-[140px] max-w-[220px] bg-muted/20 rounded border border-border p-2.5">
                            <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-border">
                                <span className="text-xs font-semibold text-foreground/70">{type}</span>
                                <span className="text-sm font-bold text-foreground bg-muted px-1.5 rounded shrink-0">{stats.count}</span>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-muted-foreground flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500/70 inline-block"></span> Added</span>
                                    <span className={`font-semibold ${stats.added > 0 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                                        {stats.added > 0 ? stats.added : '-'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-muted-foreground flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500/70 inline-block"></span> Pts Changed</span>
                                    <span className={`font-semibold ${stats.pointsChanged > 0 ? 'text-yellow-500' : 'text-muted-foreground/50'}`}>
                                        {stats.pointsChanged > 0 ? stats.pointsChanged : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
