import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { SprintSummary, SprintReportData } from '@/types';

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

export interface SprintReportPDFProps {
    summary: SprintSummary;
    report: SprintReportData | null;
    epicBreakdowns: EpicBreakdownData[];
    teamName?: string;
}

// ── Color Tokens ─────────────────────────────────────────────────────────

const C = {
    primary: '#4338ca',      // indigo-700
    primaryLight: '#818cf8', // indigo-400
    accent: '#7c3aed',      // violet-600
    success: '#16a34a',      // green-600
    successBg: '#f0fdf4',   // green-50
    warning: '#ca8a04',      // yellow-600
    warningBg: '#fefce8',   // yellow-50
    danger: '#dc2626',       // red-600
    dangerBg: '#fef2f2',    // red-50
    infoBg: '#eff6ff',      // blue-50
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

// ── Main Document ────────────────────────────────────────────────────────

export default function SprintReportPDF({ summary, report, epicBreakdowns, teamName }: SprintReportPDFProps) {
    const { sprint, totalStoryPoints, totalWorkingDays, averageUtilization, userUtilizations, qaStats, engineerStats, holidays } = summary;
    const engineers = userUtilizations.filter(u => u.role !== 'qa');
    const qas = userUtilizations.filter(u => u.role === 'qa');

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

            {/* ────────── EXECUTIVE SUMMARY ────────── */}
            <Page size="A4" style={s.page}>
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

            {/* ────────── EPIC DELIVERY BREAKDOWN ────────── */}
            {epicBreakdowns.length > 0 && (
                <Page size="A4" style={s.page} wrap>
                    <SectionHeader title="Epic Delivery Breakdown" color="#7c3aed" />

                    {epicBreakdowns.filter(e => e.totalPoints > 0).map((epic) => (
                        <View key={epic.epicKey} style={{ marginBottom: 14 }} wrap={false}>
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
        </Document>
    );
}
