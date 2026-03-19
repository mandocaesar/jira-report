'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TeamSettingsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/organisation/squads');
    }, [router]);

    return null;
}
