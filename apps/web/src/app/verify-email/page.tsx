import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmail } from '@/components/auth/AuthForms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.verify') };
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  return (
    <AuthShell title={t('auth.confirming')}>
      <VerifyEmail token={token} />
    </AuthShell>
  );
}
