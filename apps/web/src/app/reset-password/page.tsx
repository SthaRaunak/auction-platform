import { AuthShell } from '@/components/auth/AuthShell';
import { ResetForm } from '@/components/auth/AuthForms';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      <ResetForm token={token} />
    </AuthShell>
  );
}
