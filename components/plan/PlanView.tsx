'use client';

// Plan tab (Phase 2): capacity for the selected sprint with inline leave
// editing — type the day count in the row, Save writes SprintLeave and the
// engine numbers refresh. Replaces the old modal-driven leave entry.

import { useEffect, useState } from 'react';
import { useFetch, invalidateClientCache } from '@/hooks/useFetch';

interface PlanMember {
    accountId: string;
    name: string;
    role: 'engineer' | 'qa';
    excluded: boolean;
    leaveDays: number;
    allocationFactor: number;
    theoreticalMandays: number;
}

interface PlanResponse {
    sprint: { id: number; name: string; state: string };
    teamId: string;
    sprintWorkingDays: number;
    holidayCount: number;
    nonDevCount: number;
    teamTheoreticalMandays: number;
    members: PlanMember[];
    canEdit: boolean;
}

export default function PlanView({ boardId, sprintId }: { boardId: number; sprintId: number }) {
    const [reloadKey, setReloadKey] = useState(0);
    const { data, loading, error } = useFetch<PlanResponse>(
        `/api/plan?boardId=${boardId}&sprintId=${sprintId}`, { ttl: 0, deps: [reloadKey] },
    );
    const [draft, setDraft] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!data) return;
        const d: Record<string, number> = {};
        for (const m of data.members) d[m.accountId] = m.leaveDays;
        setDraft(d);
    }, [data]);

    if (loading && !data) return <div className="animate-pulse bg-muted/40 rounded-lg h-48" role="status" aria-label="Loading plan" />;
    if (error) return <p className="text-sm text-red-400">{error}</p>;
    if (!data) return null;

    const dirty = data.members.some(m => (draft[m.accountId] ?? m.leaveDays) !== m.leaveDays);

    const save = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch('/api/leave', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sprintId, boardId, leaveData: draft }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
            invalidateClientCache('/api/plan');
            invalidateClientCache(`/api/sprint/${sprintId}`);
            setReloadKey(k => k + 1);
            setSaveMsg('Saved — capacity updated');
            setTimeout(() => setSaveMsg(null), 4000);
        } catch (e) {
            setSaveMsg(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
                <div className="p-3 bg-muted/20 border border-border rounded-lg">
                    <p className="text-xs text-muted-foreground">Working days</p>
                    <p className="text-lg font-bold text-foreground">{data.sprintWorkingDays}</p>
                    <p className="text-[11px] text-muted-foreground">−{data.holidayCount} holidays · −{data.nonDevCount} non-dev</p>
                </div>
                <div className="p-3 bg-muted/20 border border-border rounded-lg">
                    <p className="text-xs text-muted-foreground">Theoretical mandays</p>
                    <p className="text-lg font-bold text-foreground">{data.teamTheoreticalMandays} MD</p>
                    <p className="text-[11px] text-muted-foreground">{data.members.filter(m => !m.excluded).length} active members</p>
                </div>
            </div>

            <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                            <th className="p-3">Member</th>
                            <th className="p-3">Role</th>
                            <th className="p-3 text-right">Leave days</th>
                            <th className="p-3 text-right">Allocation</th>
                            <th className="p-3 text-right">Theoretical MD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.members.map(m => (
                            <tr key={m.accountId} className={`border-b border-border/50 ${m.excluded ? 'opacity-50' : ''}`}>
                                <td className="p-3 font-medium text-foreground">
                                    {m.name}
                                    {m.excluded && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">excluded</span>}
                                </td>
                                <td className="p-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.role === 'qa' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-blue-500/15 text-blue-400'}`}>{m.role}</span>
                                </td>
                                <td className="p-3 text-right">
                                    {data.canEdit && !m.excluded ? (
                                        <input
                                            type="number"
                                            min={0}
                                            max={data.sprintWorkingDays}
                                            value={draft[m.accountId] ?? m.leaveDays}
                                            onChange={e => setDraft(d => ({ ...d, [m.accountId]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                            aria-label={`Leave days for ${m.name}`}
                                            className="w-16 text-right px-2 py-1 bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:border-purple-500 tabular-nums"
                                        />
                                    ) : (
                                        <span className="tabular-nums">{m.leaveDays}</span>
                                    )}
                                </td>
                                <td className="p-3 text-right tabular-nums text-muted-foreground">{Math.round(m.allocationFactor * 100)}%</td>
                                <td className="p-3 text-right tabular-nums font-semibold">{m.theoreticalMandays}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center gap-3">
                {data.canEdit ? (
                    <button
                        onClick={save}
                        disabled={!dirty || saving}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : 'Save leave'}
                    </button>
                ) : (
                    <p className="text-xs text-muted-foreground">Read-only — leave editing needs the EM or Lead role on this squad.</p>
                )}
                {saveMsg && <span className="text-xs text-muted-foreground" role="status">{saveMsg}</span>}
            </div>
        </div>
    );
}
