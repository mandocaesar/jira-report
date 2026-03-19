import { redirect } from 'next/navigation';

export default async function SquadDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/organisation/squads/${encodeURIComponent(id)}`);
}
