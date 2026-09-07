'use client';

// Report tab (Phase 2): the A1 slide table, promoted from a buried analytics
// section to a first-class view on the home page.

import { useFetch } from '@/hooks/useFetch';
import EmReportTable, { EmReportResponse } from '@/components/sprint/EmReportTable';

export default function ReportView({ boardId, sprintId }: { boardId: number; sprintId: number }) {
    const { data, loading, error } = useFetch<EmReportResponse>(
        `/api/sprint-performance/em-report?sprintId=${sprintId}&boardId=${boardId}`,
    );

    if (loading) {
        return (
            <div className="space-y-3" role="status" aria-label="Building EM report">
                <div className="animate-pulse bg-muted/40 rounded-lg h-10" />
                <div className="animate-pulse bg-muted/40 rounded-lg h-40" />
                <p className="text-xs text-muted-foreground">Building EM report — analysing sprint scope, worklogs and YTD carry-over…</p>
            </div>
        );
    }
    if (error) return <p className="text-sm text-red-400">{error}</p>;
    if (!data) return null;

    return (
        <div className="space-y-3">
            {data.sprint.state !== 'closed' && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-xs">
                    Sprint is {data.sprint.state} — numbers are not final until the sprint closes.
                </div>
            )}
            <EmReportTable data={data} boardId={boardId} sprintId={sprintId} />
        </div>
    );
}
