import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { SprintSummary, SprintReportData, WorklogReportData } from '@/types';
import { computeRoleStats } from '@/lib/utilization-calculator';

// ── Types ────────────────────────────────────────────────────────────────

interface EpicBreakdownData {
    epicKey: string;
    epicName: string;
    totalPoints: number;
    completedPoints: number;
    completionPercent: number;
    stories: Array<{
        key: string;
        summary: string;
        totalPoints: number;
        completedPoints: number;
        issues: Array<{
            key: string;
            summary: string;
            issueType: string;
            storyPoints: number;
            assignee: string | null;
            status: string;
            statusCategory: string;
        }>;
    }>;
}

export interface MemberSprintPerformance {
    accountId: string;
    name: string;
    role: string;
    title: string;
    storyPoints: number;
    availableDays: number;
    utilizationPercent: number;
    completionRate: number;
    cycleTimeAvg: number | null;
    leadTimeAvg: number | null;
    throughput: number;
    deliveredSubTasks: number;
    totalSubTasks: number;
    deliveredSubChores: number;
    totalSubChores: number;
    deliveredOther: number;
    totalOther: number;
}

export interface SprintReportPDFProps {
    summary: SprintSummary;
    report: SprintReportData | null;
    epicBreakdowns: EpicBreakdownData[];
    teamName?: string;
    aiSummary?: string | null;
    worklogData?: WorklogReportData | null;
    teamPerformanceData?: MemberSprintPerformance[];
}

// ── Color Tokens ─────────────────────────────────────────────────────────

const C = {
    primary: '#4338ca',      // indigo-700
    primaryLight: '#818cf8', // indigo-400
    accent: '#7c3aed',      // violet-600
    success: '#16a34a',      // green-600
    successBg: '#f0fdf4',   // green-50
    infoBg: '#eff6ff',       // blue-50
    warning: '#ea580c',      // orange-600
    warningBg: '#fff7ed',    // orange-50
    danger: '#e11d48',       // rose-600
    dangerBg: '#fff1f2',     // rose-50

    // Heatmap Colors
    heatNone: '#f3f4f6',     // gray-100 (0h)
    heatLow: '#fee2e2',      // red-100 (<4h)
    heatLowText: '#ef4444',
    heatMed: '#fef08a',      // yellow-200 (4-7h)
    heatMedText: '#eab308',
    heatGood: '#bbf7d0',     // green-200 (7-8h)
    heatGoodText: '#22c55e',
    heatHigh: '#bfdbfe',     // blue-200 (>8h)
    heatHighText: '#3b82f6',
    info: '#2563eb',         // blue-600
    grayDark: '#1f2937',    // gray-800
    gray: '#4b5563',        // gray-600
    grayMed: '#6b7280',     // gray-500
    grayLight: '#9ca3af',   // gray-400
    grayBorder: '#e5e7eb',  // gray-200
    grayBg: '#f9fafb',      // gray-50
    grayRow: '#f3f4f6',     // gray-100
    white: '#ffffff',
};

// ── Helpers ──────────────────────────────────────────────────────────────

function completionColor(pct: number) {
    if (pct >= 90) return C.success;
    if (pct >= 70) return C.info;
    if (pct >= 50) return C.warning;
    return C.danger;
}

function completionBg(pct: number) {
    if (pct >= 90) return C.successBg;
    if (pct >= 70) return C.infoBg;
    if (pct >= 50) return C.warningBg;
    return C.dangerBg;
}

function statusColor(cat: string) {
    if (cat === 'Done') return C.success;
    if (cat === 'In Progress') return C.info;
    return C.grayMed;
}

function statusBg(cat: string) {
    if (cat === 'Done') return C.successBg;
    if (cat === 'In Progress') return C.infoBg;
    return C.grayBg;
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function fmtShortDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    page: {
        paddingTop: 48,
        paddingBottom: 56,
        paddingHorizontal: 40,
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: C.grayDark,
        backgroundColor: C.white,
    },

    // ─ Footer ─
    footer: {
        position: 'absolute',
        bottom: 24,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: C.grayBorder,
        paddingTop: 8,
    },
    footerText: { fontSize: 7, color: C.grayLight },

    // ─ Cover ─
    coverContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverBadge: {
        backgroundColor: C.primary,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 4,
        marginBottom: 20,
    },
    coverBadgeText: { color: C.white, fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 2, textTransform: 'uppercase' as const },
    coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.grayDark, textAlign: 'center', marginBottom: 6 },
    coverDates: { fontSize: 12, color: C.grayMed, textAlign: 'center', marginBottom: 4 },
    coverTeam: { fontSize: 11, color: C.gray, textAlign: 'center', marginBottom: 40 },
    coverGenerated: { fontSize: 8, color: C.grayLight, textAlign: 'center' },
    coverDivider: { width: 60, height: 3, backgroundColor: C.primary, borderRadius: 2, marginBottom: 24 },

    // ─ Section header ─
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 4,
    },
    sectionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    sectionTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.grayDark },

    // ─ KPI row ─
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    kpiCard: {
        flex: 1,
        padding: 14,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: C.grayBorder,
        alignItems: 'center',
    },
    kpiValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
    kpiLabel: { fontSize: 8, color: C.grayMed, textTransform: 'uppercase' as const, letterSpacing: 0.5 },

    // ─ Tables ─
    table: { borderWidth: 1, borderColor: C.grayBorder, borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
    thRow: { flexDirection: 'row', backgroundColor: C.grayBg, borderBottomWidth: 1, borderBottomColor: C.grayBorder },
    th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.grayMed, paddingVertical: 6, paddingHorizontal: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.grayBorder },
    trAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.grayBorder, backgroundColor: C.grayRow },
    td: { fontSize: 8, paddingVertical: 6, paddingHorizontal: 6, color: C.grayDark },
    tdBold: { fontSize: 8, paddingVertical: 6, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', color: C.grayDark },

    // ─ Inline badge ─
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, fontSize: 7, fontFamily: 'Helvetica-Bold' },

    // ─ Progress bar ─
    progressTrack: { height: 6, backgroundColor: C.grayBorder, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },

    // ─ Capacity (small table) ─
    capacityRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    capacityCard: { flex: 1, borderWidth: 1, borderColor: C.grayBorder, borderRadius: 6, overflow: 'hidden' },
    capacityHeader: { paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.grayBorder },
    capacityHeaderText: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
    capacityBody: { padding: 10 },
    capacityMetric: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    capacityLabel: { fontSize: 8, color: C.grayMed },
    capacityValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
});

// ── Sub-components ───────────────────────────────────────────────────────

function Footer() {
    return (
        <View style={s.footer} fixed>
            <Text style={s.footerText}>Generated by Jira Sprint Report Tool</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
    );
}

function SectionHeader({ title, color }: { title: string; color: string }) {
    return (
        <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: color }]} />
            <Text style={s.sectionTitle}>{title}</Text>
        </View>
    );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
    return (
        <Text style={[s.badge, { color, backgroundColor: bg }]}>{label}</Text>
    );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
    return (
        <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.min(percent, 100)}%`, backgroundColor: color }]} />
        </View>
    );
}

function AIMarkdownParser({ content }: { content: string }) {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    return (
        <View style={{ marginTop: 8 }}>
            {lines.map((line, idx) => {
                const isHeading = line.startsWith('**') && line.endsWith('**') && line.split('**').length === 3;

                if (isHeading) {
                    return (
                        <Text key={idx} style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#6d28d9', marginTop: idx > 0 ? 12 : 0, marginBottom: 6 }}>
                            {line.slice(2, -2)}
                        </Text>
                    );
                }

                let isBullet = false;
                let textLine = line;
                // handle lists
                if (textLine.startsWith('- ') || textLine.startsWith('* ')) {
                    isBullet = true;
                    textLine = textLine.substring(2);
                }

                // Split by bold (**bold text**)
                const parts = textLine.split(/(\*\*.*?\*\*)/g);

                return (
                    <View key={idx} style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: isBullet ? 10 : 0 }}>
                        {isBullet && <Text style={{ width: 10, fontSize: 10, color: '#8b5cf6' }}>•</Text>}
                        <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.5, color: '#374151' }}>
                            {parts.map((part, i) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                    return <Text key={i} style={{ fontFamily: 'Helvetica-Bold', color: '#111827' }}>{part.slice(2, -2)}</Text>;
                                }
                                return <Text key={i}>{part}</Text>;
                            })}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeatmapStyles(hours: number) {
    if (hours === 0) return { bg: C.heatNone, color: C.grayMed };
    if (hours < 4) return { bg: C.heatLow, color: C.heatLowText };
    if (hours < 7) return { bg: C.heatMed, color: C.heatMedText };
    if (hours <= 8) return { bg: C.heatGood, color: C.heatGoodText };
    return { bg: C.heatHigh, color: C.heatHighText }; // > 8
}

// ── Main Document ────────────────────────────────────────────────────────

export default function SprintReportPDF({ summary, report, epicBreakdowns, teamName, aiSummary, worklogData, teamPerformanceData }: SprintReportPDFProps) {
    const { sprint, totalStoryPoints, totalWorkingDays, averageUtilization, userUtilizations, holidays } = summary;
    const engineerStats = summary.engineerStats ?? computeRoleStats(userUtilizations, 'engineer');
    const qaStats = summary.qaStats ?? computeRoleStats(userUtilizations, 'qa');
    const engineers = userUtilizations.filter(u => u.role !== 'qa');
    const qas = userUtilizations.filter(u => u.role === 'qa');

    const scopeChanges = report?.scopeChanges || [];
    const hasScopeChanges = scopeChanges.length > 0;
    const scopeChangesByType = scopeChanges.reduce((acc, sc) => {
        if (!acc[sc.issueType]) acc[sc.issueType] = { count: 0, added: 0, pointsChanged: 0 };
        acc[sc.issueType].count += 1;
        if (sc.type === 'added') acc[sc.issueType].added += 1;
        else if (sc.type === 'points_changed') acc[sc.issueType].pointsChanged += 1;
        return acc;
    }, {} as Record<string, { count: number; added: number; pointsChanged: number; }>);

    return (
        <Document
            title={`Sprint Report — ${sprint.name}`}
            author="Jira Sprint Report"
            subject={`Sprint report for ${sprint.name}`}
        >
            {/* ────────── COVER PAGE ────────── */}
            <Page size="A4" style={s.page}>
                <View style={s.coverContainer}>
                    <View style={s.coverBadge}>
                        <Text style={s.coverBadgeText}>Sprint Report</Text>
                    </View>
                    <Text style={s.coverTitle}>{sprint.name}</Text>
                    <View style={s.coverDivider} />
                    <Text style={s.coverDates}>{fmtDate(sprint.startDate)} — {fmtDate(sprint.endDate)}</Text>
                    {teamName && <Text style={s.coverTeam}>{teamName}</Text>}
                    <Text style={s.coverGenerated}>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                </View>
                <Footer />
            </Page>

            {/* ────────── AI SUMMARY (Part 1) ────────── */}
            {aiSummary && (
                <Page size="A4" style={s.page} wrap>
                    {/* Render AI summary first, without a section header as requested */}
                    <View style={{ marginBottom: 16 }}>
                        <AIMarkdownParser content={aiSummary} />
                    </View>
                    <Footer />
                </Page>
            )}

            {/* ────────── EXECUTIVE SUMMARY DASHBOARD (Part 2) ────────── */}
            <Page size="A4" style={s.page} wrap>
                <SectionHeader title="Executive Summary" color={C.primary} />

                {/* KPI cards */}
                <View style={s.kpiRow}>
                    <View style={[s.kpiCard, { backgroundColor: C.infoBg }]}>
                        <Text style={[s.kpiValue, { color: C.info }]}>{totalStoryPoints}</Text>
                        <Text style={s.kpiLabel}>Total Story Points</Text>
                    </View>
                    {report && (
                        <>
                            <View style={[s.kpiCard, { backgroundColor: C.successBg }]}>
                                <Text style={[s.kpiValue, { color: C.success }]}>{report.completedPoints}</Text>
                                <Text style={s.kpiLabel}>Completed Points</Text>
                            </View>
                            <View style={[s.kpiCard, { backgroundColor: completionBg(report.completionPercent) }]}>
                                <Text style={[s.kpiValue, { color: completionColor(report.completionPercent) }]}>{report.completionPercent.toFixed(1)}%</Text>
                                <Text style={s.kpiLabel}>Completion Rate</Text>
                            </View>
                        </>
                    )}
                    <View style={[s.kpiCard, { backgroundColor: '#faf5ff' }]}>
                        <Text style={[s.kpiValue, { color: C.accent }]}>{totalWorkingDays}</Text>
                        <Text style={s.kpiLabel}>Working Days</Text>
                    </View>
                </View>

                {/* Scope Changes Summary */}
                {hasScopeChanges && (
                    <>
                        <SectionHeader title="Scope Changes Summary" color={C.warning} />
                        <View style={{ flexDirection: 'row', backgroundColor: '#fff7ed', borderRadius: 4, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: '#fed7aa' }}>
                            <View style={{ width: '25%', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#fdba74', paddingRight: 8 }}>
                                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ea580c', marginBottom: 4, textTransform: 'uppercase' }}>Scope Changes</Text>
                                <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#f97316' }}>{scopeChanges.length}</Text>
                                <Text style={{ fontSize: 6, color: C.gray, marginTop: 4, textTransform: 'uppercase' }}>Total Events</Text>
                            </View>
                            <View style={{ width: '75%', paddingLeft: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {Object.entries(scopeChangesByType).map(([type, stats]) => (
                                    <View key={type} style={{ width: '47%', backgroundColor: '#fff', padding: 6, borderRadius: 3, borderWidth: 1, borderColor: '#fed7aa' }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ffedd5', paddingBottom: 4, marginBottom: 4 }}>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{type}</Text>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ea580c' }}>{stats.count}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                                            <Text style={{ fontSize: 7, color: C.gray }}>Added</Text>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: stats.added > 0 ? C.danger : C.grayLight }}>{stats.added > 0 ? stats.added : '-'}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ fontSize: 7, color: C.gray }}>Pts Changed</Text>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: stats.pointsChanged > 0 ? C.warning : C.grayLight }}>{stats.pointsChanged > 0 ? stats.pointsChanged : '-'}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </>
                )}

                {/* Capacity breakdown — Engineers vs QA */}
                <SectionHeader title="Capacity Overview" color={C.accent} />
                <View style={s.capacityRow}>
                    {/* Engineer card */}
                    <View style={s.capacityCard}>
                        <View style={[s.capacityHeader, { backgroundColor: C.infoBg }]}>
                            <Text style={[s.capacityHeaderText, { color: C.info }]}>Engineers ({engineerStats.count})</Text>
                        </View>
                        <View style={s.capacityBody}>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Man-days</Text><Text style={s.capacityValue}>{engineerStats.mandays}</Text></View>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Story Points</Text><Text style={s.capacityValue}>{engineerStats.storyPoints}</Text></View>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Leave Days</Text><Text style={s.capacityValue}>{engineerStats.leaveDays}</Text></View>
                        </View>
                    </View>
                    {/* QA card */}
                    <View style={s.capacityCard}>
                        <View style={[s.capacityHeader, { backgroundColor: '#fdf2f8' }]}>
                            <Text style={[s.capacityHeaderText, { color: '#db2777' }]}>QA ({qaStats.count})</Text>
                        </View>
                        <View style={s.capacityBody}>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Man-days</Text><Text style={s.capacityValue}>{qaStats.mandays}</Text></View>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Story Points</Text><Text style={s.capacityValue}>{qaStats.storyPoints}</Text></View>
                            <View style={s.capacityMetric}><Text style={s.capacityLabel}>Leave Days</Text><Text style={s.capacityValue}>{qaStats.leaveDays}</Text></View>
                        </View>
                    </View>
                </View>

                {/* Holidays */}
                {holidays && holidays.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayMed, marginBottom: 4 }}>
                            PUBLIC HOLIDAYS IN SPRINT
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                            {holidays.map((h, i) => (
                                <View key={i} style={{ flexDirection: 'row', backgroundColor: '#faf5ff', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#e9d5ff' }}>
                                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, marginRight: 4 }}>{fmtShortDate(h.holiday_date)}</Text>
                                    <Text style={{ fontSize: 7, color: C.gray }}>{h.holiday_name}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Status Breakdown Table */}
                {report && report.statusGroups.length > 0 && (
                    <>
                        <SectionHeader title="Status Breakdown" color={C.info} />
                        <View style={s.table}>
                            <View style={s.thRow}>
                                <Text style={[s.th, { width: '35%' }]}>Status</Text>
                                <Text style={[s.th, { width: '20%', textAlign: 'center' }]}>Points</Text>
                                <Text style={[s.th, { width: '15%', textAlign: 'center' }]}>Tasks</Text>
                                <Text style={[s.th, { width: '30%' }]}>Distribution</Text>
                            </View>
                            {report.statusGroups.map((sg, i) => {
                                const pct = report.totalPoints > 0 ? (sg.points / report.totalPoints) * 100 : 0;
                                return (
                                    <View key={sg.statusCategory} style={i % 2 === 0 ? s.tr : s.trAlt}>
                                        <View style={{ width: '35%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
                                            <Badge label={sg.statusCategory} color={statusColor(sg.statusCategory)} bg={statusBg(sg.statusCategory)} />
                                        </View>
                                        <Text style={[s.tdBold, { width: '20%', textAlign: 'center' }]}>{sg.points}</Text>
                                        <Text style={[s.td, { width: '15%', textAlign: 'center' }]}>{sg.count}</Text>
                                        <View style={{ width: '30%', paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <View style={{ flex: 1 }}>
                                                    <ProgressBar percent={pct} color={statusColor(sg.statusCategory)} />
                                                </View>
                                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gray, width: 24, textAlign: 'right' }}>{pct.toFixed(0)}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                )}
                <Footer />
            </Page>

            {/* ────────── TEAM PERFORMANCE ────────── */}
            <Page size="A4" style={s.page}>
                <SectionHeader title="Team Performance" color={C.success} />

                {report && report.memberBreakdowns.length > 0 && (
                    <View style={s.table}>
                        <View style={s.thRow}>
                            <Text style={[s.th, { width: '28%' }]}>Member</Text>
                            <Text style={[s.th, { width: '10%', textAlign: 'center' }]}>Role</Text>
                            <Text style={[s.th, { width: '12%', textAlign: 'center' }]}>Total</Text>
                            <Text style={[s.th, { width: '12%', textAlign: 'center' }]}>Done</Text>
                            <Text style={[s.th, { width: '18%', textAlign: 'center' }]}>Completion</Text>
                            <Text style={[s.th, { width: '20%' }]}>Status</Text>
                        </View>
                        {report.memberBreakdowns.map((m, i) => (
                            <View key={m.user.accountId} style={i % 2 === 0 ? s.tr : s.trAlt}>
                                <Text style={[s.tdBold, { width: '28%' }]}>{m.user.displayName}</Text>
                                <View style={{ width: '10%', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' }}>
                                    <Badge label={m.role.toUpperCase()} color={m.role === 'qa' ? '#db2777' : C.info} bg={m.role === 'qa' ? '#fdf2f8' : C.infoBg} />
                                </View>
                                <Text style={[s.tdBold, { width: '12%', textAlign: 'center' }]}>{m.totalPoints}</Text>
                                <Text style={[s.td, { width: '12%', textAlign: 'center', color: C.success }]}>{m.completedPoints}</Text>
                                <View style={{ width: '18%', paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(m.completionPercent), textAlign: 'center', marginBottom: 2 }}>
                                        {m.completionPercent.toFixed(0)}%
                                    </Text>
                                    <ProgressBar percent={m.completionPercent} color={completionColor(m.completionPercent)} />
                                </View>
                                <View style={{ width: '20%', paddingHorizontal: 6, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                                    {m.statusGroups.map(sg => (
                                        <Badge key={sg.statusCategory} label={`${sg.statusCategory}: ${sg.points}`} color={statusColor(sg.statusCategory)} bg={statusBg(sg.statusCategory)} />
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Utilization overview */}
                <SectionHeader title="Utilization Breakdown" color={C.accent} />
                <View style={s.table}>
                    <View style={s.thRow}>
                        <Text style={[s.th, { width: '25%' }]}>Member</Text>
                        <Text style={[s.th, { width: '12%', textAlign: 'center' }]}>Role</Text>
                        <Text style={[s.th, { width: '13%', textAlign: 'center' }]}>SP</Text>
                        <Text style={[s.th, { width: '13%', textAlign: 'center' }]}>Available</Text>
                        <Text style={[s.th, { width: '13%', textAlign: 'center' }]}>Leave</Text>
                        <Text style={[s.th, { width: '24%', textAlign: 'center' }]}>Utilization</Text>
                    </View>
                    {userUtilizations.map((u, i) => (
                        <View key={u.user.accountId} style={i % 2 === 0 ? s.tr : s.trAlt}>
                            <Text style={[s.tdBold, { width: '25%' }]}>{u.user.displayName}</Text>
                            <View style={{ width: '12%', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' }}>
                                <Badge label={u.role.toUpperCase()} color={u.role === 'qa' ? '#db2777' : C.info} bg={u.role === 'qa' ? '#fdf2f8' : C.infoBg} />
                            </View>
                            <Text style={[s.tdBold, { width: '13%', textAlign: 'center' }]}>{u.storyPoints}</Text>
                            <Text style={[s.td, { width: '13%', textAlign: 'center' }]}>{u.availableDays}d</Text>
                            <Text style={[s.td, { width: '13%', textAlign: 'center', color: u.leaveDays > 0 ? C.warning : C.grayMed }]}>{u.leaveDays}d</Text>
                            <View style={{ width: '24%', paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ flex: 1 }}><ProgressBar percent={u.utilizationPercent} color={completionColor(u.utilizationPercent)} /></View>
                                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: completionColor(u.utilizationPercent), width: 26, textAlign: 'right' }}>
                                        {u.utilizationPercent.toFixed(0)}%
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
                <Footer />
            </Page>

            {/* ────────── TEAM SPRINT PERFORMANCE ────────── */}
            {teamPerformanceData && teamPerformanceData.length > 0 && (
                <Page size="A4" orientation="landscape" style={s.page} wrap>
                    <SectionHeader title="Team Sprint Performance" color="#0369a1" />

                    {/* Engineers table */}
                    {teamPerformanceData.filter(m => m.role !== 'qa').length > 0 && (
                        <View style={{ marginBottom: 18 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.info, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Engineers
                            </Text>
                            <View style={s.table}>
                                <View style={s.thRow}>
                                    <Text style={[s.th, { width: 130 }]}>Member</Text>
                                    <Text style={[s.th, { width: 75, textAlign: 'center' }]}>SP / Avail</Text>
                                    <Text style={[s.th, { width: 80, textAlign: 'center' }]}>Utilization</Text>
                                    <Text style={[s.th, { width: 80, textAlign: 'center' }]}>Completion</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Cycle Time</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Lead Time</Text>
                                    <Text style={[s.th, { width: 55, textAlign: 'center' }]}>Throughput</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Sub-Tasks</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Sub-Chores</Text>
                                    <Text style={[s.th, { width: 62, textAlign: 'center' }]}>Other</Text>
                                </View>
                                {teamPerformanceData.filter(m => m.role !== 'qa').map((m, i) => (
                                    <View key={m.accountId} style={i % 2 === 0 ? s.tr : s.trAlt}>
                                        <View style={{ width: 130, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.name}</Text>
                                            <Text style={{ fontSize: 6, color: C.grayMed, marginTop: 1 }}>{m.title}</Text>
                                        </View>
                                        <View style={{ width: 75, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.storyPoints}</Text>
                                            <Text style={{ fontSize: 7, color: C.grayMed }}>{m.availableDays}d avail</Text>
                                        </View>
                                        <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(m.utilizationPercent), textAlign: 'center', marginBottom: 2 }}>
                                                {m.utilizationPercent.toFixed(1)}%
                                            </Text>
                                            <ProgressBar percent={m.utilizationPercent} color={completionColor(m.utilizationPercent)} />
                                        </View>
                                        <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(m.completionRate), textAlign: 'center', marginBottom: 2 }}>
                                                {m.completionRate}%
                                            </Text>
                                            <ProgressBar percent={m.completionRate} color={completionColor(m.completionRate)} />
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            {m.cycleTimeAvg !== null ? (
                                                <>
                                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.cycleTimeAvg <= 2 ? C.success : m.cycleTimeAvg <= 5 ? C.info : m.cycleTimeAvg <= 10 ? C.warning : C.danger }}>
                                                        {m.cycleTimeAvg}d
                                                    </Text>
                                                    <Text style={{ fontSize: 6, color: C.grayMed }}>avg/issue</Text>
                                                </>
                                            ) : (
                                                <Text style={{ fontSize: 9, color: C.grayLight }}>—</Text>
                                            )}
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            {m.leadTimeAvg !== null ? (
                                                <>
                                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.leadTimeAvg <= 2 ? C.success : m.leadTimeAvg <= 5 ? C.info : m.leadTimeAvg <= 10 ? C.warning : C.danger }}>
                                                        {m.leadTimeAvg}d
                                                    </Text>
                                                    <Text style={{ fontSize: 6, color: C.grayMed }}>avg/issue</Text>
                                                </>
                                            ) : (
                                                <Text style={{ fontSize: 9, color: C.grayLight }}>—</Text>
                                            )}
                                        </View>
                                        <View style={{ width: 55, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.throughput}</Text>
                                            <Text style={{ fontSize: 6, color: C.grayMed }}>issues</Text>
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalSubTasks > 0 ? completionColor((m.deliveredSubTasks / m.totalSubTasks) * 100) : C.grayMed }}>
                                                {m.deliveredSubTasks}/{m.totalSubTasks}
                                            </Text>
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalSubChores > 0 ? completionColor((m.deliveredSubChores / m.totalSubChores) * 100) : C.grayMed }}>
                                                {m.deliveredSubChores}/{m.totalSubChores}
                                            </Text>
                                        </View>
                                        <View style={{ width: 62, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalOther > 0 ? completionColor((m.deliveredOther / m.totalOther) * 100) : C.grayMed }}>
                                                {m.deliveredOther}/{m.totalOther}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* QA table */}
                    {teamPerformanceData.filter(m => m.role === 'qa').length > 0 && (
                        <View>
                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#db2777', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                QA
                            </Text>
                            <View style={s.table}>
                                <View style={s.thRow}>
                                    <Text style={[s.th, { width: 130 }]}>Member</Text>
                                    <Text style={[s.th, { width: 75, textAlign: 'center' }]}>SP / Avail</Text>
                                    <Text style={[s.th, { width: 80, textAlign: 'center' }]}>Utilization</Text>
                                    <Text style={[s.th, { width: 80, textAlign: 'center' }]}>Completion</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Cycle Time</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Lead Time</Text>
                                    <Text style={[s.th, { width: 55, textAlign: 'center' }]}>Throughput</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Sub-Tasks</Text>
                                    <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Sub-Chores</Text>
                                    <Text style={[s.th, { width: 62, textAlign: 'center' }]}>Other</Text>
                                </View>
                                {teamPerformanceData.filter(m => m.role === 'qa').map((m, i) => (
                                    <View key={m.accountId} style={i % 2 === 0 ? s.tr : s.trAlt}>
                                        <View style={{ width: 130, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.name}</Text>
                                            <Text style={{ fontSize: 6, color: C.grayMed, marginTop: 1 }}>{m.title}</Text>
                                        </View>
                                        <View style={{ width: 75, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.storyPoints}</Text>
                                            <Text style={{ fontSize: 7, color: C.grayMed }}>{m.availableDays}d avail</Text>
                                        </View>
                                        <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(m.utilizationPercent), textAlign: 'center', marginBottom: 2 }}>
                                                {m.utilizationPercent.toFixed(1)}%
                                            </Text>
                                            <ProgressBar percent={m.utilizationPercent} color={completionColor(m.utilizationPercent)} />
                                        </View>
                                        <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(m.completionRate), textAlign: 'center', marginBottom: 2 }}>
                                                {m.completionRate}%
                                            </Text>
                                            <ProgressBar percent={m.completionRate} color={completionColor(m.completionRate)} />
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            {m.cycleTimeAvg !== null ? (
                                                <>
                                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.cycleTimeAvg <= 2 ? C.success : m.cycleTimeAvg <= 5 ? C.info : m.cycleTimeAvg <= 10 ? C.warning : C.danger }}>
                                                        {m.cycleTimeAvg}d
                                                    </Text>
                                                    <Text style={{ fontSize: 6, color: C.grayMed }}>avg/issue</Text>
                                                </>
                                            ) : (
                                                <Text style={{ fontSize: 9, color: C.grayLight }}>—</Text>
                                            )}
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            {m.leadTimeAvg !== null ? (
                                                <>
                                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.leadTimeAvg <= 2 ? C.success : m.leadTimeAvg <= 5 ? C.info : m.leadTimeAvg <= 10 ? C.warning : C.danger }}>
                                                        {m.leadTimeAvg}d
                                                    </Text>
                                                    <Text style={{ fontSize: 6, color: C.grayMed }}>avg/issue</Text>
                                                </>
                                            ) : (
                                                <Text style={{ fontSize: 9, color: C.grayLight }}>—</Text>
                                            )}
                                        </View>
                                        <View style={{ width: 55, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{m.throughput}</Text>
                                            <Text style={{ fontSize: 6, color: C.grayMed }}>issues</Text>
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalSubTasks > 0 ? completionColor((m.deliveredSubTasks / m.totalSubTasks) * 100) : C.grayMed }}>
                                                {m.deliveredSubTasks}/{m.totalSubTasks}
                                            </Text>
                                        </View>
                                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalSubChores > 0 ? completionColor((m.deliveredSubChores / m.totalSubChores) * 100) : C.grayMed }}>
                                                {m.deliveredSubChores}/{m.totalSubChores}
                                            </Text>
                                        </View>
                                        <View style={{ width: 62, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: m.totalOther > 0 ? completionColor((m.deliveredOther / m.totalOther) * 100) : C.grayMed }}>
                                                {m.deliveredOther}/{m.totalOther}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Color legend */}
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, justifyContent: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.successBg, borderRadius: 2, borderWidth: 1, borderColor: '#86efac' }} />
                            <Text style={{ fontSize: 7, color: C.grayDark }}>≥ 90%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.infoBg, borderRadius: 2, borderWidth: 1, borderColor: '#93c5fd' }} />
                            <Text style={{ fontSize: 7, color: C.grayDark }}>≥ 70%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.warningBg, borderRadius: 2, borderWidth: 1, borderColor: '#fdba74' }} />
                            <Text style={{ fontSize: 7, color: C.grayDark }}>≥ 50%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.dangerBg, borderRadius: 2, borderWidth: 1, borderColor: '#fda4af' }} />
                            <Text style={{ fontSize: 7, color: C.grayDark }}>&lt; 50%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={{ fontSize: 7, color: C.grayMed }}>Cycle/Lead: ≤2d green · ≤5d blue · ≤10d amber · &gt;10d red</Text>
                        </View>
                    </View>

                    <Footer />
                </Page>
            )}

            {/* ────────── SCOPE CHANGES ────────── */}
            {report && report.scopeChanges && report.scopeChanges.length > 0 && (
                <Page size="A4" style={s.page} wrap>
                    <SectionHeader title="Scope Changes During Sprint" color="#ea580c" />
                    <View style={s.table}>
                        <View style={s.thRow}>
                            <Text style={[s.th, { width: 60 }]}>Issue</Text>
                            <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Type</Text>
                            <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Date</Text>
                            <Text style={[s.th, { width: 335 }]}>Details</Text>
                        </View>
                        {Object.entries(report.scopeChanges.reduce((acc, change) => {
                            const groupKey = change.parentKey || change.issueKey;
                            const groupSummary = change.parentKey ? (change.parentSummary || 'Parent Issue') : change.summary;
                            if (!acc[groupKey]) acc[groupKey] = { summary: groupSummary, changes: [] };
                            acc[groupKey].changes.push(change);
                            return acc;
                        }, {} as Record<string, { summary: string, changes: typeof report.scopeChanges }>)).map(([groupKey, group], groupIdx) => (
                            <React.Fragment key={groupKey}>
                                <View style={[s.tr, { backgroundColor: '#fff7ed', borderBottomColor: '#ffedd5' }]} wrap={false}>
                                    <View style={{ width: '100%', flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ea580c', marginRight: 6 }}>{groupKey}</Text>
                                        <Text style={{ fontSize: 8, color: C.grayMed, flex: 1, marginRight: 6 }}>{group.summary}</Text>
                                        <Badge label={`${group.changes.length} events`} color="#ea580c" bg="#ffedd5" />
                                    </View>
                                </View>
                                {group.changes.map((sc, i) => (
                                    <View key={i} style={s.tr} wrap={false}>
                                        <Text style={[s.tdBold, { width: 60, color: C.info, paddingLeft: 12 }]}>{sc.issueKey}</Text>
                                        <View style={{ width: 60, alignItems: 'center', paddingVertical: 6 }}>
                                            <Badge label={sc.type === 'added' ? 'Added' : 'Points'} color={sc.type === 'added' ? C.danger : C.warning} bg={sc.type === 'added' ? C.dangerBg : C.warningBg} />
                                        </View>
                                        <Text style={[s.td, { width: 60, textAlign: 'center' }]}>{fmtShortDate(sc.changeDate)}</Text>
                                        <View style={{ width: 335, paddingVertical: 6, paddingHorizontal: 6 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                                <Text style={{ fontSize: 8, color: C.grayDark, fontFamily: 'Helvetica-Bold' }}>{sc.description}</Text>
                                                <Badge label={sc.issueType} color={C.grayMed} bg={C.grayBg} />
                                            </View>
                                            <Text style={{ fontSize: 7, color: C.grayMed }}>{sc.summary}</Text>
                                            {sc.assignee && <Text style={{ fontSize: 7, color: C.grayLight, marginTop: 1 }}>Assignee: {sc.assignee}</Text>}
                                        </View>
                                    </View>
                                ))}
                            </React.Fragment>
                        ))}
                    </View>
                    <Footer />
                </Page>
            )}

            {/* ────────── EPIC DELIVERY BREAKDOWN ────────── */}
            {epicBreakdowns.length > 0 && (
                <Page size="A4" style={s.page} wrap>
                    <SectionHeader title="Epic Delivery Breakdown" color="#7c3aed" />

                    {epicBreakdowns.filter(e => e.totalPoints > 0).map((epic) => (
                        <View key={epic.epicKey} style={{ marginBottom: 14 }}>
                            {/* Epic header - stacked layout to prevent overflow */}
                            <View style={{ backgroundColor: '#f5f3ff', padding: 8, borderRadius: 4, marginBottom: 4, borderWidth: 1, borderColor: '#e9d5ff' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.accent, backgroundColor: '#ede9fe', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2 }}>{epic.epicKey}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ fontSize: 8, color: C.grayMed }}>{epic.completedPoints}/{epic.totalPoints} pts</Text>
                                        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: completionColor(epic.completionPercent) }}>{epic.completionPercent.toFixed(0)}%</Text>
                                    </View>
                                </View>
                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{epic.epicName}</Text>
                            </View>

                            {/* Stories table — all columns use explicit point widths (total ≈ 515pt for A4 minus padding) */}
                            <View style={[s.table, { marginBottom: 0 }]}>
                                <View style={s.thRow}>
                                    <Text style={[s.th, { width: 60 }]}>Key</Text>
                                    <Text style={[s.th, { width: 295 }]}>Story</Text>
                                    <Text style={[s.th, { width: 45, textAlign: 'center' }]}>Total</Text>
                                    <Text style={[s.th, { width: 45, textAlign: 'center' }]}>Done</Text>
                                    <Text style={[s.th, { width: 70, textAlign: 'center' }]}>Progress</Text>
                                </View>
                                {epic.stories.map((story, si) => {
                                    const storyPct = story.totalPoints > 0 ? (story.completedPoints / story.totalPoints) * 100 : 0;
                                    return (
                                        <View key={story.key} style={si % 2 === 0 ? s.tr : s.trAlt}>
                                            <Text style={{ width: 60, fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.info, paddingVertical: 5, paddingHorizontal: 6 }}>
                                                {story.key === 'Standalone' ? '—' : story.key}
                                            </Text>
                                            <View style={{ width: 295, paddingVertical: 4, paddingHorizontal: 6 }}>
                                                <Text style={{ fontSize: 7, color: C.grayDark, lineHeight: 1.3 }}>{story.summary}</Text>
                                            </View>
                                            <Text style={{ width: 45, fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingVertical: 5, color: C.grayDark }}>{story.totalPoints}</Text>
                                            <Text style={{ width: 45, fontSize: 8, textAlign: 'center', paddingVertical: 5, color: C.success }}>{story.completedPoints}</Text>
                                            <View style={{ width: 70, paddingHorizontal: 6, paddingVertical: 5, justifyContent: 'center' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                    <View style={{ flex: 1 }}><ProgressBar percent={storyPct} color={completionColor(storyPct)} /></View>
                                                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: completionColor(storyPct) }}>{storyPct.toFixed(0)}%</Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ))}
                    <Footer />
                </Page>
            )}

            {/* ────────── DAILY WORKLOG TRACKING ────────── */}
            {worklogData && worklogData.memberWorklogs.length > 0 && (
                <Page size="A4" orientation="landscape" style={s.page} wrap>
                    <SectionHeader title="Daily Worklog Tracking (Hours)" color="#0ea5e9" />

                    {/* Legend */}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, justifyContent: 'flex-end', paddingRight: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.heatLow, borderRadius: 2 }}></View>
                            <Text style={{ fontSize: 7, color: C.grayDark }}>&lt; 4h</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.heatMed, borderRadius: 2 }}></View>
                            <Text style={{ fontSize: 7, color: C.grayDark }}>4-7h</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.heatGood, borderRadius: 2 }}></View>
                            <Text style={{ fontSize: 7, color: C.grayDark }}>7-8h</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, backgroundColor: C.heatHigh, borderRadius: 2 }}></View>
                            <Text style={{ fontSize: 7, color: C.grayDark }}>&gt; 8h</Text>
                        </View>
                    </View>

                    <View style={s.table}>
                        {/* Table Header */}
                        <View style={s.thRow}>
                            <Text style={[s.th, { width: 120 }]}>Team Member</Text>
                            {worklogData.dates.map((date, index) => {
                                const d = new Date(date);
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                return (
                                    <View key={date} style={[s.th, { flex: 1, alignItems: 'center', paddingHorizontal: 0, paddingVertical: 4, backgroundColor: isWeekend ? '#f1f5f9' : 'transparent' }]}>
                                        <Text style={{ fontSize: 5, color: C.grayMed }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                                        <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', color: isWeekend ? C.grayMed : C.grayDark }}>{d.getDate()}</Text>
                                    </View>
                                )
                            })}
                            <Text style={[s.th, { width: 40, textAlign: 'center', color: C.success }]}>Total</Text>
                        </View>

                        {/* Table Body */}
                        {worklogData.memberWorklogs.map((member, i) => (
                            <View key={member.accountId} style={i % 2 === 0 ? s.tr : s.trAlt} wrap={false}>
                                <View style={{ width: 120, paddingVertical: 5, paddingHorizontal: 6, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.grayDark }}>{member.displayName}</Text>
                                    <Text style={{ fontSize: 6, color: member.role === 'qa' ? '#db2777' : '#3b82f6', marginTop: 1, textTransform: 'uppercase' }}>{member.role}</Text>
                                </View>

                                {member.dailyLogs.map((log, logIdx) => {
                                    const d = new Date(log.date);
                                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                    const heat = getHeatmapStyles(log.hours);
                                    return (
                                        <View key={log.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, backgroundColor: isWeekend ? '#f8fafc' : 'transparent' }}>
                                            <View style={{
                                                width: '80%',
                                                aspectRatio: 1.5,
                                                backgroundColor: heat.bg,
                                                borderRadius: 2,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <Text style={{ fontSize: 6, fontFamily: log.hours > 0 ? 'Helvetica-Bold' : 'Helvetica', color: heat.color }}>
                                                    {log.hours > 0 ? log.hours.toFixed(1).replace('.0', '') : '-'}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}

                                <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: member.totalHours >= 60 ? C.success : C.grayDark }}>
                                        {member.totalHours.toFixed(1).replace('.0', '')}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    <Footer />
                </Page>
            )}
        </Document>
    );
}
