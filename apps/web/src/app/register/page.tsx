import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/AuthForms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.register') };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getI18n();
  return (
    <AuthShell title={t('meta.register')} lead={t('auth.registerLead')}>
      <RegisterForm next={next} />
    </AuthShell>
  );
}
