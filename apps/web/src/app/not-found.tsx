import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
      <h1 className="ttl text-[34px]">{t('notFound.title')}</h1>
      <p className="mut mt-3">{t('notFound.body')}</p>
      <Link href="/" className="btn btn-primary mt-6">
        {t('common.browseLive')}
      </Link>
    </div>
  );
}
