import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotForm } from '@/components/auth/AuthForms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.forgot') };
}

export default async function ForgotPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t('meta.forgot')} lead={t('auth.forgotLead')}>
      <ForgotForm />
    </AuthShell>
  );
}
