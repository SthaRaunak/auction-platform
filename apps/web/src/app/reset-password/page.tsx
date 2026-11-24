import { AuthShell } from '@/components/auth/AuthShell';
import { ResetForm } from '@/components/auth/AuthForms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.reset') };
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  return (
    <AuthShell title={t('meta.reset')}>
      <ResetForm token={token} />
    </AuthShell>
  );
}
