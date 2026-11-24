'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client';

export function ResendVerification() {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  if (state === 'sent') return <span className="mut">{t('nav.resent')}</span>;
  return (
    <button
      type="button"
      className="btn btn-ghost !py-1 text-[13px]"
      disabled={state === 'sending'}
      onClick={async () => {
        setState('sending');
        try {
          await api('POST', '/auth/resend-verification');
          setState('sent');
        } catch {
          setState('error');
        }
      }}
    >
      {state === 'error' ? t('nav.resendFailed') : t('nav.resend')}
    </button>
  );
}
