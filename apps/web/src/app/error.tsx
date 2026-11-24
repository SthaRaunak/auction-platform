'use client';

import { useI18n } from '@/i18n/client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t, rich } = useI18n();
  return (
    <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
      <h1 className="ttl text-[30px]">{t('errorPage.title')}</h1>
      <p className="mut mt-3">{rich('errorPage.body', { code: (s) => <code>{s}</code> })}</p>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        {t('errorPage.retry')}
      </button>
    </div>
  );
}
