'use client';

import { useState, useEffect, useCallback } from 'react';

interface JiraConnectionData {
    id: string;
    baseUrl: string;
    email: string;
    apiToken: string;
    autoSyncEnabled: boolean;
    syncSchedule: string;
    connectionStatus: string;
    lastTestedAt: string | null;
}

interface DataSourceData {
    id: string;
    name: string;
    boardId: number;
    jqlQuery: string | null;
    isActive: boolean;
    fetchWorklogs: boolean;
    teamId: string;
    lastSyncAt: string | null;
    lastSyncStatus: string;
    lastSyncMessage: string | null;
    issueCount: number;
    team: { id: string; name: string };
}

interface TeamOption {
    id: string;
    name: string;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    NOT_CONFIGURED: { bg: 'bg-gray-500/10 border-gray-500/30', text: 'text-gray-400', label: 'Not Configured' },
    SAVED: { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', label: 'Saved (Untested)' },
    OK: { bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-400', label: 'Connected' },
    ERROR: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', label: 'Error' },
};

const syncStatusColors: Record<string, { bg: string; text: string }> = {
    NEVER: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
    HEALTHY: { bg: 'bg-green-500/10', text: 'text-green-400' },
    ERROR: { bg: 'bg-red-500/10', text: 'text-red-400' },
    SYNCING: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
};

export default function JiraIntegrationPage() {
    // Connection state
    const [connection, setConnection] = useState<JiraConnectionData | null>(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [email, setEmail] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
    const [syncSchedule, setSyncSchedule] = useState('15min');

    // Data sources state
    const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
    const [teams, setTeams] = useState<TeamOption[]>([]);

    // New data source form
    const [showNewDS, setShowNewDS] = useState(false);
    const [newDSName, setNewDSName] = useState('');
    const [newDSBoardId, setNewDSBoardId] = useState('');
    const [newDSTeamId, setNewDSTeamId] = useState('');
    const [newDSJql, setNewDSJql] = useState('');
    const [newDSFetchWorklogs, setNewDSFetchWorklogs] = useState(true);

    // Edit data source
    const [editingDS, setEditingDS] = useState<string | null>(null);
    const [editDSName, setEditDSName] = useState('');
    const [editDSBoardId, setEditDSBoardId] = useState('');
    const [editDSTeamId, setEditDSTeamId] = useState('');
    const [editDSJql, setEditDSJql] = useState('');

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [connRes, dsRes, teamsRes] = await Promise.all([
                fetch('/api/settings/jira-connection'),
                fetch('/api/settings/data-sources'),
                fetch('/api/settings/teams'),
            ]);

            const connData = await connRes.json();
            const dsData = await dsRes.json();
            const teamsData = await teamsRes.json();

            if (connData.success && connData.data) {
                const c = connData.data;
                setConnection(c);
                setBaseUrl(c.baseUrl);
                setEmail(c.email);
                setApiToken(c.apiToken);
                setAutoSyncEnabled(c.autoSyncEnabled);
                setSyncSchedule(c.syncSchedule);
            }

            if (dsData.success) setDataSources(dsData.data || []);
            if (teamsData.success) setTeams((teamsData.data || []).map((t: TeamOption) => ({ id: t.id, name: t.name })));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleSaveConnection = async () => {
        try {
            setSaving(true);
            setError(null);
            setTestResult(null);
            const res = await fetch('/api/settings/jira-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl, email, apiToken, autoSyncEnabled, syncSchedule }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setConnection(result.data);
            setSuccess('Connection saved');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        try {
            setTesting(true);
            setTestResult(null);
            const res = await fetch('/api/settings/jira-connection/test', { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                setTestResult({ success: true, message: `Connected as ${result.data.user}` });
                setConnection(prev => prev ? { ...prev, connectionStatus: 'OK', lastTestedAt: result.data.testedAt } : prev);
            } else {
                setTestResult({ success: false, message: result.error });
                setConnection(prev => prev ? { ...prev, connectionStatus: 'ERROR' } : prev);
            }
        } catch (err) {
            setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' });
        } finally {
            setTesting(false);
        }
    };

    const handleCreateDS = async () => {
        try {
            setError(null);
            const res = await fetch('/api/settings/data-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newDSName,
                    boardId: parseInt(newDSBoardId),
                    teamId: newDSTeamId,
                    jqlQuery: newDSJql || null,
                    fetchWorklogs: newDSFetchWorklogs,
                }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setDataSources(prev => [...prev, result.data]);
            setShowNewDS(false);
            setNewDSName('');
            setNewDSBoardId('');
            setNewDSTeamId('');
            setNewDSJql('');
            setNewDSFetchWorklogs(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create data source');
        }
    };

    const handleUpdateDS = async (id: string) => {
        try {
            setError(null);
            const res = await fetch('/api/settings/data-sources', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name: editDSName,
                    boardId: parseInt(editDSBoardId),
                    teamId: editDSTeamId,
                    jqlQuery: editDSJql || null,
                }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setDataSources(prev => prev.map(ds => ds.id === id ? result.data : ds));
            setEditingDS(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update data source');
        }
    };

    const handleToggleDS = async (ds: DataSourceData) => {
        try {
            const res = await fetch('/api/settings/data-sources', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: ds.id, isActive: !ds.isActive }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setDataSources(prev => prev.map(d => d.id === ds.id ? result.data : d));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle');
        }
    };

    const handleToggleWorklogs = async (ds: DataSourceData) => {
        try {
            const res = await fetch('/api/settings/data-sources', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: ds.id, fetchWorklogs: !ds.fetchWorklogs }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setDataSources(prev => prev.map(d => d.id === ds.id ? result.data : d));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle worklogs');
        }
    };

    const handleDeleteDS = async (id: string) => {
        if (!confirm('Delete this data source?')) return;
        try {
            const res = await fetch(`/api/settings/data-sources?id=${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setDataSources(prev => prev.filter(ds => ds.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const startEditDS = (ds: DataSourceData) => {
        setEditingDS(ds.id);
        setEditDSName(ds.name);
        setEditDSBoardId(String(ds.boardId));
        setEditDSTeamId(ds.teamId);
        setEditDSJql(ds.jqlQuery || '');
    };

    const connStatus = connection?.connectionStatus || 'NOT_CONFIGURED';
    const statusStyle = statusColors[connStatus] || statusColors.NOT_CONFIGURED;

    return (
        <div className="min-h-screen overflow-x-hidden">
            <header className="border-b border-border bg-background/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-background" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Jira Integration</h1>
                            <p className="text-muted-foreground text-sm">Configure Jira connection, sync settings, and data sources</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-4xl mx-auto space-y-6">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">×</button>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
                        ✓ {success}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Connection Status Badge */}
                        <div className={`p-4 border rounded-xl flex items-center justify-between ${statusStyle.bg}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${connStatus === 'OK' ? 'bg-green-400' : connStatus === 'ERROR' ? 'bg-red-400' : connStatus === 'SAVED' ? 'bg-yellow-400' : 'bg-gray-400'}`} />
                                <span className={`font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
                            </div>
                            {connection?.lastTestedAt && (
                                <span className="text-xs text-muted-foreground">
                                    Last tested: {new Date(connection.lastTestedAt).toLocaleString()}
                                </span>
                            )}
                        </div>

                        {/* Connection Config */}
                        <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border bg-muted/20">
                                <h2 className="text-lg font-semibold text-foreground">Connection</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Base URL</label>
                                    <input
                                        type="url"
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder="https://your-domain.atlassian.net"
                                        className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your-email@company.com"
                                        className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">API Token</label>
                                    <input
                                        type="password"
                                        value={apiToken}
                                        onChange={(e) => setApiToken(e.target.value)}
                                        placeholder="Enter your Jira API token"
                                        className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div className="flex items-center gap-4 pt-2">
                                    <button
                                        onClick={handleSaveConnection}
                                        disabled={saving || !baseUrl || !email}
                                        className="px-5 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-all font-medium"
                                    >
                                        {saving ? 'Saving…' : 'Save Connection'}
                                    </button>
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testing || !connection}
                                        className="px-5 py-2 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 transition-all font-medium"
                                    >
                                        {testing ? 'Testing…' : 'Test Connection'}
                                    </button>
                                </div>
                                {testResult && (
                                    <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                                        {testResult.success ? '✓ ' : '✗ '}{testResult.message}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sync Config */}
                        <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border bg-muted/20">
                                <h2 className="text-lg font-semibold text-foreground">Sync Settings</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-sm font-medium text-foreground">Auto-Sync</span>
                                        <p className="text-xs text-muted-foreground">Automatically sync data from Jira on a schedule</p>
                                    </div>
                                    <button
                                        onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                                        className={`relative w-11 h-6 rounded-full transition-colors ${autoSyncEnabled ? 'bg-green-500' : 'bg-muted'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoSyncEnabled ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                {autoSyncEnabled && (
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-1">Schedule</label>
                                        <select
                                            value={syncSchedule}
                                            onChange={(e) => setSyncSchedule(e.target.value)}
                                            className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                        >
                                            <option value="15min">Every 15 minutes</option>
                                            <option value="daily">Daily</option>
                                        </select>
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Note: Save connection above to persist sync settings.
                                </p>
                            </div>
                        </div>

                        {/* Data Sources */}
                        <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-foreground">Data Sources</h2>
                                <button
                                    onClick={() => setShowNewDS(true)}
                                    className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                                >
                                    + Add Source
                                </button>
                            </div>

                            {/* New data source form */}
                            {showNewDS && (
                                <div className="p-6 border-b border-border bg-muted/10 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            placeholder="Source name"
                                            value={newDSName}
                                            onChange={(e) => setNewDSName(e.target.value)}
                                            className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Board ID"
                                            value={newDSBoardId}
                                            onChange={(e) => setNewDSBoardId(e.target.value)}
                                            className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                        />
                                    </div>
                                    <select
                                        value={newDSTeamId}
                                        onChange={(e) => setNewDSTeamId(e.target.value)}
                                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                    >
                                        <option value="">Select team…</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="JQL query (optional)"
                                        value={newDSJql}
                                        onChange={(e) => setNewDSJql(e.target.value)}
                                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                    <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <input
                                                type="checkbox"
                                                checked={newDSFetchWorklogs}
                                                onChange={(e) => setNewDSFetchWorklogs(e.target.checked)}
                                                className="rounded border-border"
                                            />
                                            Fetch worklogs
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowNewDS(false)}
                                                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleCreateDS}
                                                disabled={!newDSName || !newDSBoardId || !newDSTeamId}
                                                className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Data sources list */}
                            <div className="divide-y divide-border">
                                {dataSources.map((ds) => (
                                    <div key={ds.id} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                                        {editingDS === ds.id ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        value={editDSName}
                                                        onChange={(e) => setEditDSName(e.target.value)}
                                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={editDSBoardId}
                                                        onChange={(e) => setEditDSBoardId(e.target.value)}
                                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                                    />
                                                </div>
                                                <select
                                                    value={editDSTeamId}
                                                    onChange={(e) => setEditDSTeamId(e.target.value)}
                                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                                >
                                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                                <input
                                                    type="text"
                                                    value={editDSJql}
                                                    onChange={(e) => setEditDSJql(e.target.value)}
                                                    placeholder="JQL query (optional)"
                                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                                />
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => setEditingDS(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                                    <button onClick={() => handleUpdateDS(ds.id)} className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-foreground">{ds.name}</span>
                                                        <span className={`px-2 py-0.5 text-xs rounded-full ${(syncStatusColors[ds.lastSyncStatus] || syncStatusColors.NEVER).bg} ${(syncStatusColors[ds.lastSyncStatus] || syncStatusColors.NEVER).text}`}>
                                                            {ds.lastSyncStatus}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                                                        <span>Board #{ds.boardId}</span>
                                                        <span>•</span>
                                                        <span>{ds.team.name}</span>
                                                        {ds.issueCount > 0 && (
                                                            <>
                                                                <span>•</span>
                                                                <span>{ds.issueCount} issues</span>
                                                            </>
                                                        )}
                                                        {ds.jqlQuery && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="truncate max-w-[200px]" title={ds.jqlQuery}>JQL: {ds.jqlQuery}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 ml-4">
                                                    <button
                                                        onClick={() => handleToggleWorklogs(ds)}
                                                        className={`px-2 py-1 text-xs rounded-lg border transition-all ${ds.fetchWorklogs ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-muted/50 border-border text-muted-foreground'}`}
                                                        title={ds.fetchWorklogs ? 'Worklogs enabled' : 'Worklogs disabled'}
                                                    >
                                                        WL
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleDS(ds)}
                                                        className={`relative w-9 h-5 rounded-full transition-colors ${ds.isActive ? 'bg-green-500' : 'bg-muted'}`}
                                                        title={ds.isActive ? 'Active' : 'Inactive'}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${ds.isActive ? 'translate-x-4' : ''}`} />
                                                    </button>
                                                    <button
                                                        onClick={() => startEditDS(ds)}
                                                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                                            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteDS(ds.id)}
                                                        className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                                            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {dataSources.length === 0 && !showNewDS && (
                                    <div className="px-6 py-12 text-center text-muted-foreground">
                                        No data sources configured. Click &quot;+ Add Source&quot; to create one.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
