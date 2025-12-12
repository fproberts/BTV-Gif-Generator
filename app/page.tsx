import { getAppData } from './actions';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  const initialData = await getAppData();

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[url('/bg-grid.svg')] bg-fixed bg-center">
      <div className="absolute inset-0 bg-background/90 pointer-events-none -z-10" />
      <Dashboard initialData={initialData} />
    </main>
  );
}
