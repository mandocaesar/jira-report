'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TeamReportPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/organisation/squads');
    }, [router]);

    return null;
}
