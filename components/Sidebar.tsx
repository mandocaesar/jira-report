'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    description?: string;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const IconSprintOverview = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
);

const IconCapacity = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5" strokeLinejoin="round" />
        <path d="M2 12l10 5 10-5" strokeLinejoin="round" />
    </svg>
);

const IconTeam = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.85" strokeLinecap="round" />
    </svg>
);

const IconLeave = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth={2.5} />
    </svg>
);

const IconTitleDays = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconVelocity = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="17 6 23 6 23 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconMetrics = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconTeamReport = () => (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const navigation: NavSection[] = [
    {
        title: 'Dashboard',
        items: [
            {
                name: 'Sprint Overview',
                href: '/',
                icon: <IconSprintOverview />,
                description: 'View sprint progress and metrics',
            },
        ],
    },
    {
        title: 'Planning',
        items: [
            {
                name: 'Capacity Planning',
                href: '/planning/capacity',
                icon: <IconCapacity />,
                description: 'Forecast sprint capacity',
            },
            {
                name: 'Sprint Velocity',
                href: '/planning/velocity',
                icon: <IconVelocity />,
                description: 'Sprint-to-sprint commitment tracker',
            },
        ],
    },
    {
        title: 'Settings',
        items: [
            {
                name: 'Team Members',
                href: '/settings/team',
                icon: <IconTeam />,
                description: 'Manage team roster',
            },
            {
                name: 'Sprint Leave',
                href: '/settings/leave',
                icon: <IconLeave />,
                description: 'Plan leave per sprint',
            },
            {
                name: 'Title Days',
                href: '/settings/title-days',
                icon: <IconTitleDays />,
                description: 'Available days per title',
            },
        ],
    },
    {
        title: 'Analytics',
        items: [
            {
                name: 'Metrics Dashboard',
                href: '/metrics',
                icon: <IconMetrics />,
                description: 'Historical performance',
            },
            {
                name: 'Team Report',
                href: '/reports/team',
                icon: <IconTeamReport />,
                description: 'Per-member sprint metrics',
            },

        ],
    },
];

interface SidebarProps {
    children?: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch by only rendering after mount
    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render anything until mounted to prevent hydration mismatch
    if (!mounted) {
        return <>{children}</>;
    }

    if (pathname === '/login') {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 h-screen bg-background border-r border-border transition-all duration-300 z-50 flex flex-col ${collapsed ? 'w-20' : 'w-64'
                    }`}
            >
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-border">
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-foreground/10 border border-border rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-foreground" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <rect x="3" y="12" width="3" height="8" rx="0.5" />
                                    <rect x="10.5" y="7" width="3" height="13" rx="0.5" />
                                    <rect x="18" y="3" width="3" height="17" rx="0.5" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-foreground">Jira Sprint</h1>
                                <p className="text-xs text-muted-foreground">Report Dashboard</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <svg
                            className="w-5 h-5 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {collapsed ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                                />
                            )}
                        </svg>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-2">
                    {navigation.map((section) => (
                        <div key={section.title} className="mb-6">
                            {!collapsed && (
                                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {section.title}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative ${isActive
                                                ? 'bg-foreground text-background'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                }`}
                                            title={collapsed ? item.name : ''}
                                        >
                                            <span className="flex-shrink-0">{item.icon}</span>
                                            {!collapsed && (
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">{item.name}</div>
                                                    {item.description && !isActive && (
                                                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                                    )}
                                                </div>
                                            )}
                                            {isActive && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Footer - Actions */}
                <div className="border-t border-border p-4 space-y-2 overflow-hidden">
                    <button
                        onClick={() => router.refresh()}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={collapsed ? 'Refresh Data' : ''}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {!collapsed && <span className="text-sm font-medium whitespace-nowrap truncate">Refresh Data</span>}
                    </button>

                    {/* Theme Toggle Button */}
                    <ThemeToggle collapsed={collapsed} />

                    <Link
                        href="/api/auth/logout"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={collapsed ? 'Logout' : ''}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                        </svg>
                        {!collapsed && <span className="text-sm font-medium">Logout</span>}
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 min-w-0 flex flex-col overflow-x-hidden ${collapsed ? 'ml-20' : 'ml-64'} transition-all duration-300`}>
                {children}
            </main>
        </div>
    );
}
