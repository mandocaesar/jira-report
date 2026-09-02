'use client';

// Global context bar (UX Phase 1): squad + sprint chosen once, keyboard-first.
// Accessible listbox pattern: aria-haspopup/expanded, arrow keys, Enter, Escape.

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { Board, Sprint } from '@/types';

interface HealthCheck { id: string; ok: boolean; label: string; hint?: string }
interface HealthResult { ok: boolean; checks: HealthCheck[] }

interface ContextBarProps {
    boardId: number | null;
    sprintId: number | null;
    onBoardChange: (boardId: number | null) => void;
    onSprintChange: (sprintId: number | null) => void;
    /** Called once per board load with the sprint the bar recommends (active, else latest closed) */
    onSprintsLoaded?: (sprints: Sprint[]) => void;
}

function fmtRange(s: Sprint): string {
    if (!s.startDate || !s.endDate) return '';
    const f = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${f(s.startDate)}–${f(s.endDate)}`;
}

// ─── Generic accessible listbox ────────────────────────────────────────────────

interface ListboxOption { id: number; label: string; sub?: string; badge?: string }

function Listbox({ label, value, options, onSelect, widthClass = 'min-w-[220px]' }: {
    label: string;
    value: string;
    options: ListboxOption[];
    onSelect: (id: number) => void;
    widthClass?: string;
}) {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listboxId = useRef(`lb-${Math.random().toString(36).slice(2, 8)}`).current;

    const close = useCallback(() => { setOpen(false); btnRef.current?.focus(); }, []);

    useEffect(() => {
        if (!open) return;
        const onDocDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [open]);

    useEffect(() => {
        if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIdx]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!open) {
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
                setOpen(true);
                setActiveIdx(Math.max(0, options.findIndex(o => o.label === value)));
            }
            return;
        }
        switch (e.key) {
            case 'Escape': e.preventDefault(); close(); break;
            case 'ArrowDown': e.preventDefault(); setActiveIdx(i => Math.min(options.length - 1, i + 1)); break;
            case 'ArrowUp': e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); break;
            case 'Home': e.preventDefault(); setActiveIdx(0); break;
            case 'End': e.preventDefault(); setActiveIdx(options.length - 1); break;
            case 'Enter': case ' ':
                e.preventDefault();
                if (options[activeIdx]) { onSelect(options[activeIdx].id); close(); }
                break;
            case 'Tab': setOpen(false); break;
        }
    };

    return (
        <div ref={rootRef} className={`relative ${widthClass}`} onKeyDown={onKeyDown}>
            <button
                ref={btnRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={label}
                onClick={() => { setOpen(o => !o); setActiveIdx(Math.max(0, options.findIndex(o => o.label === value))); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm text-foreground hover:border-purple-500/50 transition-colors"
            >
                <span className="truncate">{value || `— ${label} —`}</span>
                <svg className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <ul
                    ref={listRef}
                    role="listbox"
                    id={listboxId}
                    aria-label={label}
                    aria-activedescendant={`${listboxId}-${activeIdx}`}
                    className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto bg-background border border-border rounded-lg shadow-xl py-1"
                >
                    {options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>}
                    {options.map((o, i) => (
                        <li
                            key={o.id}
                            id={`${listboxId}-${i}`}
                            role="option"
                            aria-selected={o.label === value}
                            data-active={i === activeIdx}
                            onMouseEnter={() => setActiveIdx(i)}
                            onClick={() => { onSelect(o.id); close(); }}
                            className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${i === activeIdx ? 'bg-purple-500/15 text-foreground' : 'text-foreground/80'}`}
                        >
                            <span className="truncate">{o.label}</span>
                            {o.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">{o.badge}</span>}
                            {o.sub && <span className="ml-auto text-xs text-muted-foreground shrink-0">{o.sub}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── Context bar ───────────────────────────────────────────────────────────────

export default function ContextBar({ boardId, sprintId, onBoardChange, onSprintChange, onSprintsLoaded }: ContextBarProps) {
    const { data: boards } = useFetch<Board[]>('/api/boards');
    const { data: sprints } = useFetch<Sprint[]>(boardId ? `/api/sprints?boardId=${boardId}` : null);
    const healthUrl = boardId ? `/api/context/health?boardId=${boardId}${sprintId ? `&sprintId=${sprintId}` : ''}` : null;
    const { data: health } = useFetch<HealthResult>(healthUrl);
    const [healthOpen, setHealthOpen] = useState(false);

    const sorted = useMemo(() =>
        [...(sprints ?? [])].sort((a, b) => Date.parse(a.startDate || '0') - Date.parse(b.startDate || '0')),
        [sprints]);

    const notifiedFor = useRef<number | null>(null);
    useEffect(() => {
        if (!sprints || boardId === null || notifiedFor.current === boardId) return;
        notifiedFor.current = boardId;
        onSprintsLoaded?.(sorted);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sprints, boardId]);

    const idx = sorted.findIndex(s => s.id === sprintId);
    const step = (dir: -1 | 1) => {
        const next = sorted[idx + dir];
        if (next) onSprintChange(next.id);
    };

    const current = sorted.find(s => s.id === sprintId);
    const boardOptions: ListboxOption[] = (boards ?? []).map(b => ({
        id: b.id,
        label: b.location?.projectKey ? `${b.name} (${b.location.projectKey})` : b.name,
    }));
    const sprintOptions: ListboxOption[] = [...sorted].reverse().map(s => ({
        id: s.id,
        label: s.name,
        sub: fmtRange(s),
        badge: s.state === 'active' ? 'active' : undefined,
    }));

    const bad = health?.checks.filter(c => !c.ok) ?? [];

    return (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/20 border border-border rounded-xl print:hidden">
            <Listbox
                label="Squad"
                value={boardOptions.find(o => o.id === boardId)?.label ?? ''}
                options={boardOptions}
                onSelect={id => onBoardChange(id)}
            />
            <Listbox
                label="Sprint"
                value={current ? `${current.name} · ${fmtRange(current)}` : ''}
                options={sprintOptions}
                onSelect={id => onSprintChange(id)}
                widthClass="min-w-[280px]"
            />
            <div className="flex items-center">
                <button
                    type="button"
                    aria-label="Previous sprint"
                    disabled={idx <= 0}
                    onClick={() => step(-1)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                    type="button"
                    aria-label="Next sprint"
                    disabled={idx === -1 || idx >= sorted.length - 1}
                    onClick={() => step(1)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            {current && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${current.state === 'active' ? 'bg-emerald-500/15 text-emerald-400' : current.state === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-blue-500/15 text-blue-400'}`}>
                    {current.state}
                </span>
            )}
            <div className="flex-1" />
            {health && (
                <div className="relative">
                    <button
                        type="button"
                        aria-expanded={healthOpen}
                        aria-label={health.ok ? 'Data healthy' : `${bad.length} data issues`}
                        onClick={() => setHealthOpen(o => !o)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${health.ok
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                    >
                        {health.ok ? '✓ data healthy' : `⚠ ${bad.length} data issue${bad.length > 1 ? 's' : ''}`}
                    </button>
                    {healthOpen && (
                        <div className="absolute right-0 z-50 mt-1 w-80 bg-background border border-border rounded-lg shadow-xl p-3 space-y-2">
                            {health.checks.map(c => (
                                <div key={c.id} className="text-xs">
                                    <span className={c.ok ? 'text-emerald-400' : 'text-amber-400'}>{c.ok ? '✓' : '⚠'} {c.label}</span>
                                    {!c.ok && c.hint && <p className="text-muted-foreground mt-0.5 ml-4">{c.hint}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
