import { SprintSummary } from '@/types';

interface SprintTimelineProps {
    sprint: SprintSummary['sprint'];
    totalWorkingDays: number;
    holidays?: SprintSummary['holidays'];
}

function getWorkingDaysBetween(from: Date, to: Date) {
    let count = 0;
    const current = new Date(from);
    while (current <= to) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

export default function SprintTimeline({ sprint, totalWorkingDays, holidays }: SprintTimelineProps) {
    const now = new Date();
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const progressPercent = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

    const isSprintActive = now >= startDate && now <= endDate;
    const isSprintFinished = now > endDate;
    const daysElapsed = isSprintFinished
        ? totalWorkingDays
        : isSprintActive
            ? getWorkingDaysBetween(startDate, now)
            : 0;
    const daysRemaining = Math.max(totalWorkingDays - daysElapsed, 0);

    return (
        <div className="col-span-2 md:col-span-3 py-2 px-3 bg-muted/50 rounded-lg border border-border" title="Working days = weekdays in the sprint period, excluding national holidays and non-dev days. Progress bar shows calendar position through the sprint.">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-foreground leading-tight">
                        {totalWorkingDays}
                    </span>
                    <span className="text-xs text-muted-foreground">working days</span>
                </div>
                <div className="flex items-center gap-2">
                    {isSprintActive && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
                        </span>
                    )}
                    {isSprintFinished && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Completed
                        </span>
                    )}
                    {!isSprintActive && !isSprintFinished && (
                        <span className="text-xs px-2 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border font-medium">
                            Not started
                        </span>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden mb-1.5">
                <div
                    className="absolute inset-y-0 left-0 bg-foreground rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                />
                {isSprintActive && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                        style={{ left: `${progressPercent}%` }}
                    />
                )}
            </div>

            {/* Date labels */}
            <div className="flex flex-wrap items-center justify-between gap-1 mt-1.5">
                <span className="text-[11px] text-muted-foreground">{formatDate(sprint.startDate)}</span>
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-blue-400 font-medium">{daysElapsed} elapsed</span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="text-indigo-400 font-medium">{daysRemaining} remaining</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(sprint.endDate)}</span>
            </div>

            {/* Holidays tooltip */}
            {holidays && holidays.length > 0 && (
                <div className="mt-1.5 bg-muted/30 rounded p-1 border border-blue-500/20">
                    <div className="text-[8px] text-blue-300 font-medium mb-0.5 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {holidays.length} holiday{holidays.length > 1 ? 's' : ''} excluded
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                        {holidays.map((h, i) => (
                            <span key={i} className="text-[8px] text-muted-foreground">
                                {h.holiday_name} ({formatDate(h.holiday_date)})
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
