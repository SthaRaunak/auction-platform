'use client';

import { useState } from 'react';
import { api } from '@/lib/client';

export function ResendVerification() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  if (state === 'sent') return <span className="mut">Sent — check your inbox.</span>;
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
      {state === 'error' ? 'Couldn’t send — try again' : 'Resend link'}
    </button>
  );
}
