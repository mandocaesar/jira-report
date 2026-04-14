import React from 'react';

const svgProps = { className: 'w-5 h-5 flex-shrink-0', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.75, viewBox: '0 0 24 24' };

export const IconSprintOverview = React.memo(() => (
  <svg {...svgProps}>
    <rect x="3" y="12" width="4" height="9" rx="1" />
    <rect x="10" y="7" width="4" height="14" rx="1" />
    <rect x="17" y="3" width="4" height="18" rx="1" />
  </svg>
));
IconSprintOverview.displayName = 'IconSprintOverview';

export const IconCapacity = React.memo(() => (
  <svg {...svgProps}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
    <path d="M2 17l10 5 10-5" strokeLinejoin="round" />
    <path d="M2 12l10 5 10-5" strokeLinejoin="round" />
  </svg>
));
IconCapacity.displayName = 'IconCapacity';

export const IconTeam = React.memo(() => (
  <svg {...svgProps}>
    <circle cx="9" cy="7" r="3" />
    <path d="M3 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" strokeLinejoin="round" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.85" strokeLinecap="round" />
  </svg>
));
IconTeam.displayName = 'IconTeam';

export const IconOrgStructure = React.memo(() => (
  <svg {...svgProps}>
    <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconOrgStructure.displayName = 'IconOrgStructure';

export const IconEngineer = React.memo(() => (
  <svg {...svgProps}>
    <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconEngineer.displayName = 'IconEngineer';

export const IconLeaveNav = React.memo(() => (
  <svg {...svgProps}>
    <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconLeaveNav.displayName = 'IconLeaveNav';

export const IconLeave = React.memo(() => (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth={2.5} />
  </svg>
));
IconLeave.displayName = 'IconLeave';

export const IconTitleDays = React.memo(() => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconTitleDays.displayName = 'IconTitleDays';

export const IconVelocity = React.memo(() => (
  <svg {...svgProps}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17 6 23 6 23 12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconVelocity.displayName = 'IconVelocity';

export const IconMetrics = React.memo(() => (
  <svg {...svgProps}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconMetrics.displayName = 'IconMetrics';

export const IconTeamReport = React.memo(() => (
  <svg {...svgProps}>
    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconTeamReport.displayName = 'IconTeamReport';

export const IconSquad = React.memo(() => (
  <svg {...svgProps}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
));
IconSquad.displayName = 'IconSquad';

export const IconJira = React.memo(() => (
  <svg {...svgProps}>
    <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconJira.displayName = 'IconJira';

export const IconHoliday = React.memo(() => (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    <circle cx="12" cy="15" r="2" />
  </svg>
));
IconHoliday.displayName = 'IconHoliday';

export const IconWorkType = React.memo(() => (
  <svg {...svgProps}>
    <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 6h.008v.008H6V6z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconWorkType.displayName = 'IconWorkType';

export const IconSprintPerformance = React.memo(() => (
  <svg {...svgProps}>
    <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 16l4-8 4 4 5-10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
));
IconSprintPerformance.displayName = 'IconSprintPerformance';
