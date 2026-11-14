import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-10 border-t border-divider">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-[12.5px]">
        <span className="font-semibold tracking-[-0.025em]">Bidwell</span>
        <span className="mut">You pay nothing unless you win.</span>
        <span className="ml-auto flex gap-5">
          <Link href="/how-bidding-works">How bidding works</Link>
          <Link href="/how-bidding-works#transparency">Transparency &amp; results</Link>
          {process.env.NODE_ENV !== 'production' && <Link href="/dev/mailbox">Dev mailbox</Link>}
        </span>
      </div>
    </footer>
  );
}
