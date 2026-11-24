import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/AuthForms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.signIn') };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const { t } = await getI18n();
  return (
    <AuthShell title={t('common.signIn')} lead={t('auth.signInLead')}>
      <LoginForm next={next} error={error} />
    </AuthShell>
  );
}
