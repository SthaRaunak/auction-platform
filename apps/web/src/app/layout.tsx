import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ClockProvider } from '@/components/Clock';
import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { getMe } from '@/lib/server';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: { default: 'Bidwell — live auctions', template: '%s · Bidwell' },
  description: 'A transparent auction marketplace. Bid what you like; you pay nothing unless you win.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <html lang="en-NP" className={jakarta.variable}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <ClockProvider>
          <Nav me={me} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </ClockProvider>
      </body>
    </html>
  );
}
