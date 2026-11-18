import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/AuthForms';

export const metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Create an account" lead="Browse freely. To bid or sell you’ll confirm your email first.">
      <RegisterForm next={next} />
    </AuthShell>
  );
}
