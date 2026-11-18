import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmail } from '@/components/auth/AuthForms';

export const metadata = { title: 'Confirm your email' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Confirming your email">
      <VerifyEmail token={token} />
    </AuthShell>
  );
}
