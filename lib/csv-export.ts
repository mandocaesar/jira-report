import { UserUtilization } from '@/types';

export function downloadSprintCSV(
    userUtilizations: UserUtilization[],
    epicBreakdowns: any[],
    sprintName: string
): void {
    const rows: (string | number)[][] = [
        ['Member Name', 'Role', 'Title', 'Available Days', 'Completed Points', 'Utilization %'],
    ];

    [...userUtilizations].sort((a, b) => {
        if (a.role !== b.role) return a.role === 'engineer' ? -1 : 1;
        return a.user.displayName.localeCompare(b.user.displayName);
    }).forEach(u => {
        rows.push([
            u.user.displayName,
            u.role.toUpperCase(),
            u.title || '',
            u.availableDays.toString(),
            u.storyPoints.toString(),
            u.utilizationPercent.toFixed(1) + '%'
        ]);
    });

    if (epicBreakdowns.length > 0) {
        rows.push([]);
        rows.push(['Epic Key', 'Epic Name', 'Total Points', 'Completed Points', 'Completion %']);
        epicBreakdowns.forEach(e => {
            rows.push([
                e.epicKey,
                e.epicName,
                e.totalPoints.toString(),
                e.completedPoints.toString(),
                e.completionPercent.toFixed(1) + '%'
            ]);
        });
    }

    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sprint_Metrics_${sprintName.replace(/ /g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
