'use client';

// Admin → Users: accounts, roles, squad memberships. Admin-only (server-enforced).

import { useState } from 'react';
import { useFetch, invalidateClientCache } from '@/hooks/useFetch';

interface Membership { teamId: string; role: string }
interface UserRow {
    id: string; email: string; name: string; role: string; isActive: boolean;
    createdAt: string; memberships: Membership[];
}
interface UsersResponse { users: UserRow[]; teams: { id: string; name: string }[]; selfId: string }

const GLOBAL_ROLES = ['viewer', 'lead', 'em', 'admin'];
const SQUAD_ROLES = ['viewer', 'lead', 'em'];

export default function UsersPage() {
    const [reload, setReload] = useState(0);
    const { data, loading, error } = useFetch<UsersResponse>('/api/admin/users', { ttl: 0, deps: [reload] });
    const [msg, setMsg] = useState<string | null>(null);
    const [openUser, setOpenUser] = useState<string | null>(null);

    // create form
    const [form, setForm] = useState({ email: '', name: '', password: '', role: 'viewer' });
    const [creating, setCreating] = useState(false);

    const refresh = () => { invalidateClientCache('/api/admin/users'); setReload(k => k + 1); };

    const api = async (url: string, method: string, body: unknown): Promise<boolean> => {
        setMsg(null);
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok || !json.success) { setMsg(json.error || 'Request failed'); return false; }
        refresh();
        return true;
    };

    const createUser = async () => {
        setCreating(true);
        const ok = await api('/api/admin/users', 'POST', form);
        if (ok) { setForm({ email: '', name: '', password: '', role: 'viewer' }); setMsg('User created'); }
        setCreating(false);
    };

    const patch = (id: string, body: unknown) => api(`/api/admin/users/${id}`, 'PATCH', body);

    const setMembership = (u: UserRow, teamId: string, role: string | null) => {
        const rest = u.memberships.filter(m => m.teamId !== teamId);
        const memberships = role ? [...rest, { teamId, role }] : rest;
        patch(u.id, { memberships });
    };

    return (
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Users</h1>
                <p className="text-sm text-muted-foreground mt-1">Accounts, roles and squad memberships. New users start as read-only viewers.</p>
            </div>

            {msg && <div className="p-3 bg-muted/30 border border-border rounded-lg text-sm text-foreground" role="status">{msg}</div>}

            {/* Create */}
            <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Add user</h2>
                <div className="flex flex-wrap gap-2">
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email" type="email" aria-label="Email"
                        className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 min-w-[220px]" />
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="full name" aria-label="Full name"
                        className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 min-w-[180px]" />
                    <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="initial password (min 8)" type="password" aria-label="Initial password"
                        className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 min-w-[180px]" />
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} aria-label="Global role"
                        className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500">
                        {GLOBAL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={createUser} disabled={creating || !form.email || !form.name || form.password.length < 8}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-40">
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>

            {loading && !data && <div className="animate-pulse bg-muted/40 rounded-lg h-40" role="status" aria-label="Loading users" />}
            {error && <p className="text-sm text-red-400">{error}</p>}

            {data && (
                <div className="border border-border rounded-xl divide-y divide-border">
                    {data.users.map(u => (
                        <div key={u.id}>
                            <button
                                onClick={() => setOpenUser(openUser === u.id ? null : u.id)}
                                aria-expanded={openUser === u.id}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted/20 transition-colors"
                            >
                                <span className={`font-medium ${u.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{u.name}</span>
                                <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${u.role === 'admin' ? 'bg-purple-500/15 text-purple-400' : 'bg-muted text-muted-foreground'}`}>{u.role}</span>
                                {u.memberships.length > 0 && (
                                    <span className="text-[11px] text-muted-foreground shrink-0">{u.memberships.length} squad{u.memberships.length > 1 ? 's' : ''}</span>
                                )}
                                {u.id === data.selfId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">you</span>}
                                <span className="ml-auto text-muted-foreground text-xs shrink-0">{openUser === u.id ? '▴' : '▾'}</span>
                            </button>
                            {openUser === u.id && (
                                <div className="px-4 pb-4 space-y-3 text-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <label className="text-xs text-muted-foreground">Global role
                                            <select
                                                value={u.role}
                                                onChange={e => patch(u.id, { role: e.target.value })}
                                                disabled={u.id === data.selfId}
                                                aria-label={`Global role for ${u.name}`}
                                                className="block mt-1 px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500 disabled:opacity-50">
                                                {GLOBAL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </label>
                                        <button
                                            onClick={() => patch(u.id, { isActive: !u.isActive })}
                                            disabled={u.id === data.selfId}
                                            className="mt-4 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40">
                                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                const pw = prompt(`New password for ${u.name} (min 8 chars):`);
                                                if (pw) patch(u.id, { password: pw });
                                            }}
                                            className="mt-4 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                                            Reset password
                                        </button>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Squad memberships</p>
                                        <div className="space-y-1.5">
                                            {data.teams.map(t => {
                                                const m = u.memberships.find(x => x.teamId === t.id);
                                                return (
                                                    <div key={t.id} className="flex items-center gap-3">
                                                        <span className="w-48 truncate text-foreground/80">{t.name}</span>
                                                        <select
                                                            value={m?.role ?? ''}
                                                            onChange={e => setMembership(u, t.id, e.target.value || null)}
                                                            aria-label={`${u.name} role on ${t.name}`}
                                                            className="px-2 py-1 bg-muted/40 border border-border rounded-md text-xs text-foreground focus:outline-none focus:border-purple-500">
                                                            <option value="">— none —</option>
                                                            {SQUAD_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                                        </select>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
