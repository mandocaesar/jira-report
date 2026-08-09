'use client';

import { useEffect, useState } from 'react';

// ─── Types (mirror /api/sprint-performance/em-report) ─────────────────────────

interface EmIssueRef {
    key: string;
    summary: string;
    points: number;
}

interface EmHighlight extends EmIssueRef {
    kind: 'adhoc' | 'added';
}

interface EmNote {
    pic: string | null;
    highlights: string | null;
    carryOverReason: string | null;
}

export interface EmReportRow {
    role: 'engineer' | 'qa';
    memberCount: number;
    committedStart: number;
    committedFinal: number;
    deliveredSprint: number;
    deliveredAdhoc: number;
    deliveredTotal: number;
    carryOverPoints: number;
    carryOverIssues: EmIssueRef[];
    productivityScore: number;
    autoHighlights: EmHighlight[];
    ytdAvgCarryOver: number;
    ytdSprintCount: number;
    note: EmNote | null;
}

export interface EmReportResponse {
    sprint: { id: number; name: string; state: string; startDate: string; endDate: string };
    rows: EmReportRow[];
    notesEditable: boolean;
    jiraDomain: string;
}

interface EmReportTableProps {
    data: EmReportResponse;
    boardId: number;
    sprintId: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<EmReportRow['role'], string> = { engineer: 'Eng', qa: 'QA/QE' };

function scoreColor(score: number): string {
    if (score >= 100) return 'text-emerald-400';
    if (score >= 90) return 'text-yellow-400';
    return 'text-red-400';
}

function issueUrl(domain: string, key: string): string {
    return `https://${domain}/browse/${key}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function EmReportTable({ data, boardId, sprintId }: EmReportTableProps) {
    const [drafts, setDrafts] = useState<Record<string, EmNote>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [savedRole, setSavedRole] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        const initial: Record<string, EmNote> = {};
        for (const row of data.rows) {
            initial[row.role] = {
                pic: row.note?.pic ?? '',
                highlights: row.note?.highlights ?? '',
                carryOverReason: row.note?.carryOverReason ?? '',
            };
        }
        setDrafts(initial);
    }, [data]);

    const updateDraft = (role: string, field: keyof EmNote, value: string) => {
        setDrafts(prev => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
        setSavedRole(null);
    };

    const saveNote = async (role: string) => {
        const draft = drafts[role];
        if (!draft) return;
        setSaving(role);
        setSaveError(null);
        try {
            const res = await fetch('/api/sprint-performance/em-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    boardId,
                    sprintId,
                    role,
                    pic: draft.pic || null,
                    highlights: draft.highlights || null,
                    carryOverReason: draft.carryOverReason || null,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
            setSavedRole(role);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="space-y-3">
            {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{saveError}</div>
            )}

            <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                            <th className="p-3">Area</th>
                            <th className="p-3">PIC</th>
                            <th className="p-3 text-right cursor-help" title="Story points committed at sprint start → final scope after mid-sprint additions. 1 SP = 1 manday.">Committed MD</th>
                            <th className="p-3 text-right cursor-help" title="Delivered = Done story points. Sprint = planned work; Ad-hoc = issues with an ad-hoc Jira label.">Delivered MD</th>
                            <th className="p-3 cursor-help" title="Issues not Done at sprint end, with their remaining mandays.">Carry Over</th>
                            <th className="p-3 text-right cursor-help" title="Productivity Score = Total Delivered ÷ Committed-at-start × 100">Productivity</th>
                            <th className="p-3 min-w-[280px]">Highlights &amp; Reasons</th>
                            <th className="p-3 text-right cursor-help" title="Average carry-over mandays per closed sprint this year (up to this sprint).">YTD Avg CO</th>
                            {data.notesEditable && <th className="p-3" />}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map(row => {
                            const draft = drafts[row.role] ?? { pic: '', highlights: '', carryOverReason: '' };
                            return (
                                <tr key={row.role} className="border-b border-border/50 align-top hover:bg-muted/10 transition-colors">
                                    {/* Area */}
                                    <td className="p-3 whitespace-nowrap">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.role === 'qa' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {ROLE_LABELS[row.role]}
                                        </span>
                                        <p className="text-[10px] text-muted-foreground mt-1">{row.memberCount} members</p>
                                    </td>

                                    {/* PIC */}
                                    <td className="p-3">
                                        {data.notesEditable ? (
                                            <input
                                                value={draft.pic ?? ''}
                                                onChange={e => updateDraft(row.role, 'pic', e.target.value)}
                                                placeholder="PIC name"
                                                className="w-28 bg-muted/30 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500"
                                            />
                                        ) : (
                                            <span className="text-foreground">{row.note?.pic || '—'}</span>
                                        )}
                                    </td>

                                    {/* Committed */}
                                    <td className="p-3 text-right whitespace-nowrap">
                                        {row.committedStart !== row.committedFinal ? (
                                            <span className="font-medium text-foreground">
                                                {row.committedStart} <span className="text-muted-foreground">→</span> {row.committedFinal}
                                            </span>
                                        ) : (
                                            <span className="font-medium text-foreground">{row.committedStart}</span>
                                        )}
                                    </td>

                                    {/* Delivered */}
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <p className="font-medium text-foreground">Sprint: {row.deliveredSprint}</p>
                                        <p className="text-xs text-muted-foreground">Ad-hoc: {row.deliveredAdhoc}</p>
                                        <p className="text-xs font-semibold text-foreground border-t border-border mt-1 pt-1">Total: {row.deliveredTotal}</p>
                                    </td>

                                    {/* Carry Over */}
                                    <td className="p-3">
                                        {row.carryOverIssues.length === 0 ? (
                                            <span className="text-emerald-400 font-medium">0</span>
                                        ) : (
                                            <div className="space-y-0.5">
                                                {row.carryOverIssues.map(ci => (
                                                    <p key={ci.key} className="text-xs whitespace-nowrap">
                                                        <a
                                                            href={issueUrl(data.jiraDomain, ci.key)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-blue-400 hover:underline"
                                                        >
                                                            {ci.key}
                                                        </a>{' '}
                                                        <span className="text-muted-foreground">({ci.points} MD)</span>
                                                    </p>
                                                ))}
                                                <p className="text-xs font-semibold text-orange-400 pt-0.5">{row.carryOverPoints} MD total</p>
                                            </div>
                                        )}
                                    </td>

                                    {/* Productivity */}
                                    <td className="p-3 text-right">
                                        <span className={`text-lg font-bold ${scoreColor(row.productivityScore)}`}>
                                            {row.productivityScore.toFixed(2)}%
                                        </span>
                                    </td>

                                    {/* Highlights */}
                                    <td className="p-3">
                                        {row.autoHighlights.length > 0 && (
                                            <div className="mb-2 space-y-0.5">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Extra / Ad-hoc</p>
                                                {row.autoHighlights.map(h => (
                                                    <p key={h.key} className="text-xs">
                                                        <a
                                                            href={issueUrl(data.jiraDomain, h.key)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-blue-400 hover:underline"
                                                        >
                                                            {h.key}
                                                        </a>{' '}
                                                        <span className="text-emerald-400 font-medium">+{h.points} MD</span>{' '}
                                                        <span className={`text-[10px] px-1 rounded ${h.kind === 'adhoc' ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                            {h.kind === 'adhoc' ? 'ad-hoc' : 'added'}
                                                        </span>
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                        {data.notesEditable ? (
                                            <div className="space-y-1.5">
                                                <textarea
                                                    value={draft.highlights ?? ''}
                                                    onChange={e => updateDraft(row.role, 'highlights', e.target.value)}
                                                    placeholder="Manual highlights…"
                                                    rows={2}
                                                    className="w-full bg-muted/30 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 resize-y"
                                                />
                                                <textarea
                                                    value={draft.carryOverReason ?? ''}
                                                    onChange={e => updateDraft(row.role, 'carryOverReason', e.target.value)}
                                                    placeholder="Carry-over reason…"
                                                    rows={1}
                                                    className="w-full bg-muted/30 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 resize-y"
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {row.note?.highlights && <p className="text-xs text-foreground whitespace-pre-wrap">{row.note.highlights}</p>}
                                                {row.note?.carryOverReason && (
                                                    <p className="text-xs text-muted-foreground">Carry over reason: {row.note.carryOverReason}</p>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* YTD */}
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <span className="font-medium text-foreground">{row.ytdAvgCarryOver} MD</span>
                                        <p className="text-[10px] text-muted-foreground">{row.ytdSprintCount} sprints</p>
                                    </td>

                                    {/* Save */}
                                    {data.notesEditable && (
                                        <td className="p-3">
                                            <button
                                                onClick={() => saveNote(row.role)}
                                                disabled={saving === row.role}
                                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-40"
                                            >
                                                {saving === row.role ? 'Saving…' : savedRole === row.role ? 'Saved ✓' : 'Save'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
                Committed = SP at sprint start → final scope. Ad-hoc = Done issues with an ad-hoc Jira label
                (configurable via <code className="bg-muted px-1 rounded">ADHOC_LABELS</code>, default &quot;adhoc, ad-hoc&quot;).
                Productivity = Total Delivered ÷ Committed-at-start. 1 SP = 1 manday.
            </p>
        </div>
    );
}
