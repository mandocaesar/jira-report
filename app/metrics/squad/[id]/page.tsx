'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';

export default function SquadDetailRedirect() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    useEffect(() => {
        router.replace(`/organisation/squads/${encodeURIComponent(id)}`);
    }, [id, router]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
                <Spinner size="md" />
                <p className="text-muted-foreground text-sm">Redirecting...</p>
            </div>
        </div>
    );
}
