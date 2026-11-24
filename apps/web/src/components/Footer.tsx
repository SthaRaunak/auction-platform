import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export async function Footer() {
  const { t } = await getI18n();
  return (
    <footer className="mt-10 border-t border-divider">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-[12.5px]">
        <span className="font-semibold tracking-[-0.025em]">Bidwell</span>
        <span className="mut">{t('footer.tagline')}</span>
        <span className="ml-auto flex gap-5">
          <Link href="/how-bidding-works">{t('footer.howBidding')}</Link>
          <Link href="/how-bidding-works#transparency">{t('footer.transparency')}</Link>
          {process.env.NODE_ENV !== 'production' && <Link href="/dev/mailbox">{t('footer.mailbox')}</Link>}
        </span>
      </div>
    </footer>
  );
}
