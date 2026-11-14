import type { Me } from '@bidwell/contract';
import { Search, Star } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { ResendVerification } from './ResendVerification';

export function Nav({ me, q }: { me: Me | null; q?: string }) {
  const staff = me?.role === 'moderator' || me?.role === 'admin';
  return (
    <>
      <header className="nav sticky top-0 z-30 border-b border-divider bg-bg">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[18px] gap-y-3 px-6 py-3.5">
          <Link href="/" className="text-[20px] font-semibold tracking-[-0.025em] text-ink no-underline hover:text-ink">
            Bidwell
          </Link>
          <form action="/" role="search" className="relative order-last flex w-full items-center sm:order-none sm:w-auto sm:max-w-[420px] sm:flex-1">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-[13px] opacity-50" aria-hidden />
            <label htmlFor="nav-search" className="sr-only">
              Search lots
            </label>
            <input id="nav-search" name="q" defaultValue={q} className="input !rounded-full !pl-[38px]" type="search" placeholder="Search live lots" />
          </form>
          <nav className="ml-auto flex items-center gap-[18px]" aria-label="Main">
            <Link href="/how-bidding-works" className="navlink hidden md:inline">
              How bidding works?
            </Link>
            {staff && (
              <Link href="/moderation" className="navlink">
                Moderation
              </Link>
            )}
            <Link href="/sell" className="btn btn-primary btn-pill">
              Sell an item
            </Link>
            {me ? (
              <>
                <Link href="/account?tab=watching" className="navlink row !gap-[7px] text-[13px]" aria-label={`Watchlist, ${me.watchCount} lots`}>
                  <Star size={16} strokeWidth={1.5} aria-hidden />
                  {me.watchCount}
                </Link>
                <Link href="/account" className="navlink row !gap-2">
                  <Avatar initials={me.initials} size={32} />
                  <span className="text-[13px]">{me.displayName.split(' ')[0]}</span>
                </Link>
              </>
            ) : (
              <Link href="/login" className="navlink text-[13px]">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      {me && !me.emailVerified && (
        <div className="border-b border-divider bg-accent-100">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-6 py-2.5 text-[13px]">
            <span>Confirm your email to bid and sell — we sent a link to <strong>{me.email}</strong>.</span>
            <ResendVerification />
          </div>
        </div>
      )}
    </>
  );
}
