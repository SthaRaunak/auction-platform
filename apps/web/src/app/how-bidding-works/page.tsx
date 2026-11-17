import { BUYER_PREMIUM_BPS } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'How bidding works' };

const SECTIONS = [
  {
    id: 'proxy',
    title: 'You set a maximum; we bid for you',
    body: [
      'Enter the most you’re willing to pay. Bidwell keeps it secret and bids on your behalf, one increment at a time, only as far as needed to keep you on top.',
      'The price is always the second-highest maximum plus one increment (or your own maximum, if that’s lower). If two people set the same maximum, whoever set it first wins.',
      'If you’re already the top bidder you can raise your maximum at any time; it doesn’t move the price.',
    ],
  },
  {
    id: 'increments',
    title: 'Increments',
    body: ['Each lot has an increment schedule shown on the lot page. The default is Rs. 100 under Rs. 10,000, Rs. 500 under 1 lakh, Rs. 2,000 under 10 lakh, Rs. 10,000 under 1 crore and Rs. 50,000 above that. A department may set a flat increment instead, as notices for land and licences often do.'],
  },
  {
    id: 'soft-close',
    title: 'Soft close — no sniping',
    body: [
      'A bid in the final minutes pushes the end time back, so every bidder gets time to respond. A last-second bid can’t win simply because it arrived after everyone else stopped watching.',
      'This isn’t only about fairness between rivals: it removes the advantage of a faster connection or better hardware. The server’s clock decides — never the countdown on your screen.',
    ],
  },
  {
    id: 'transparency',
    title: 'Sealed while live, published after',
    body: [
      'While an auction runs, bidders appear as “Bidder #1”, “Bidder #2”… and maximums stay sealed. When it ends we publish a permanent record: the winner, final price, every bid with each bidder’s maximum, the times, and any amendments.',
      'Bids can never be edited or deleted. Each one is chained to the one before it with a cryptographic hash, and the published record shows whether the chain verifies — so anyone can tell if the log was tampered with.',
    ],
  },
  {
    id: 'edits',
    title: 'Edits after the first bid',
    body: ['Once someone has bid, the seller can’t change the price, reserve, increments, timing, title, condition or delivery terms. They can clarify the description and add photos, and every change is listed publicly on the lot.'],
  },
  {
    id: 'deposits',
    title: 'Earnest money deposits (dharauti)',
    body: [
      'Some lots ask for a refundable deposit before you can bid. If you don’t win, it’s refunded when the auction closes. If you win, it counts towards your payment — and is forfeited if you don’t pay within 48 hours.',
      `Winning bidders pay the final price plus Bidwell’s ${BUYER_PREMIUM_BPS / 100}% fee and any shipping. (This demo build doesn’t take real payments.)`,
    ],
  },
  {
    id: 'moderation',
    title: 'Reports, takedowns and appeals',
    body: [
      'Anyone signed in can report a lot. Moderators can pause a lot for review or void it. A voided auction keeps every bid in its ledger, marked void; deposits are refunded and every bidder is told why. Each action’s reason is published on the lot.',
      'Sellers can appeal, and a different moderator reviews the appeal. Every moderator action is recorded in an audit log.',
    ],
  },
];

export default function HowBiddingWorks() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <div className="k">Help</div>
      <h1 className="ttl mt-2 text-[40px]">How bidding works</h1>
      <p className="mut mt-3 text-[15px]">Bid what you like. You pay nothing unless you win, and never more than the maximum you set.</p>
      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="pill">
            {s.title.split(' — ')[0]}
          </a>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="mt-9 scroll-mt-24">
          <h2 className="ttl text-[22px]">{s.title}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 20)} className="mt-3 text-[14.5px] leading-[1.65]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <Link href="/" className="btn btn-primary mt-10">
        Browse live lots
      </Link>
    </div>
  );
}
