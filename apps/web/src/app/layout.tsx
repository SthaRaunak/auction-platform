import type { Metadata } from 'next';
import { Noto_Sans_Devanagari, Plus_Jakarta_Sans } from 'next/font/google';
import { ClockProvider } from '@/components/Clock';
import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { I18nProvider } from '@/i18n/client';
import { getI18n, getMessages } from '@/i18n/server';
import { getMe } from '@/lib/server';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
// Jakarta has no Devanagari; the browser falls through to this for Nepali text.
const devanagari = Noto_Sans_Devanagari({ variable: '--font-devanagari', subsets: ['devanagari'], weight: ['400', '500', '600', '700'] });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t('meta.siteTitle'), template: '%s · Bidwell' }, description: t('meta.siteDescription') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, { locale, t }, messages] = await Promise.all([getMe(), getI18n(), getMessages()]);
  return (
    <html lang={locale === 'ne' ? 'ne-NP' : 'en-NP'} className={`${jakarta.variable} ${devanagari.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
          {t('common.skipToContent')}
        </a>
        <I18nProvider locale={locale} messages={messages}>
          <ClockProvider>
            <Nav me={me} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </ClockProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
