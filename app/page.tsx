import { getAppData } from './actions';
import { AppShell } from '@/components/app/AppShell';

// Read the library at request time (it lives on the runtime volume, not in the build).
export const dynamic = 'force-dynamic';

export default async function Home() {
    const initialData = await getAppData();
    return <AppShell initialData={initialData} />;
}
