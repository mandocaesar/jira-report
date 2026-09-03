'use client';

// Admin → Audit (Phase 2): every write, attributable, diffable.

import { useState } from 'react';
import { useFetch } from '@/hooks/useFetch';

interface AuditRow {
    id: string;
    userName: string;
    action: string;
    entity: string;
    entityId: string;
    teamId: string | null;
    before: unknown;
    after: unknown;
    at: string;
}

const ENTITIES = ['', 'SprintLeave', 'SprintEmNote', 'Holiday', 'Team'];

function ago(iso: string): string {
    const ms = Date.now() - Date.parse(iso);
    const h = Math.floor(ms / 3600_000);
    if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function AuditPage() {
    const [entity, setEntity] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [openRow, setOpenRow] = useState<string | null>(null);

    const qs = new URLSearchParams();
    if (entity) qs.set('entity', entity);
    if (userFilter.trim()) qs.set('user', userFilter.trim());
    const { data, loading, error } = useFetch<{ rows: AuditRow[] }>(`/api/admin/audit?${qs.toString()}`, { ttl: 5000 });

    return (
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Audit trail</h1>
                <p className="text-sm text-muted-foreground mt-1">Every change, who made it, and what it changed. Reads are never logged.</p>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs text-muted-foreground">
                    Entity
                    <select
                        value={entity}
                        onChange={e => setEntity(e.target.value)}
                        className="block mt-1 px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500"
                    >
                        {ENTITIES.map(e => <option key={e} value={e}>{e || 'All entities'}</option>)}
                    </select>
                </label>
                <label className="text-xs text-muted-foreground">
                    User
                    <input
                        value={userFilter}
                        onChange={e => setUserFilter(e.target.value)}
                        placeholder="filter by name"
                        className="block mt-1 px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500"
                    />
                </label>
            </div>

            {loading && <div className="animate-pulse bg-muted/40 rounded-lg h-32" role="status" aria-label="Loading audit log" />}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {data && data.rows.length === 0 && <p className="text-sm text-muted-foreground">No audit entries match.</p>}

            {data && data.rows.length > 0 && (
                <div className="border border-border rounded-xl divide-y divide-border">
                    {data.rows.map(r => (
                        <div key={r.id}>
                            <button
                                onClick={() => setOpenRow(openRow === r.id ? null : r.id)}
                                aria-expanded={openRow === r.id}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted/20 transition-colors"
                            >
                                <span className="text-xs text-muted-foreground w-16 shrink-0 tabular-nums" title={new Date(r.at).toLocaleString()}>{ago(r.at)}</span>
                                <span className="font-medium text-foreground shrink-0">{r.userName}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 shrink-0">{r.action}</span>
                                <span className="text-xs text-muted-foreground truncate">{r.entity} · {r.entityId}</span>
                                <span className="ml-auto text-muted-foreground text-xs shrink-0">{openRow === r.id ? '▴' : '▾ diff'}</span>
                            </button>
                            {openRow === r.id && (
                                <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <p className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">Before</p>
                                        <pre className="bg-muted/30 border border-border rounded-lg p-2 overflow-x-auto text-foreground/80">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">After</p>
                                        <pre className="bg-muted/30 border border-border rounded-lg p-2 overflow-x-auto text-foreground/80">{JSON.stringify(r.after ?? null, null, 2)}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
