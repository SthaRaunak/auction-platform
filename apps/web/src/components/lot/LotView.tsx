'use client';

import { categoryLabel, conditionLabel, type AuctionCard, type AuctionDetail, type AuctionLiveState, type BidResult, type Comment, type Me } from '@bidwell/contract';
import { CreditCard, ShieldCheck, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { money } from '@/lib/format';
import { Avatar } from '../Avatar';
import { CountdownText } from '../Countdown';
import { Photo } from '../Photo';
import { shipLabel } from '../LotCard';
import { useNow } from '../Clock';
import { Amendments } from './Amendments';
import { BidFeed } from './BidFeed';
import { BidPanel } from './BidPanel';
import { Gallery } from './Gallery';
import { Comments } from './Comments';
import { ModeratorTools, ReportLot, ReviewForm } from './LotActions';
import { Stars } from '../Stars';
import { useLiveAuction } from './useLiveAuction';

const liveOf = (d: AuctionDetail): AuctionLiveState => ({
  auctionId: d.id,
  version: d.version,
  status: d.status,
  hidden: d.hidden,
  price: d.price,
  bidCount: d.bidCount,
  endsAt: d.endsAt,
  minNextBid: d.minNextBid,
  increment: d.increment,
  hasReserve: d.hasReserve,
  reserveMet: d.reserveMet,
  leaderNo: d.leaderNo,
  winnerName: d.winnerName,
  finalPrice: d.finalPrice,
});

/** Announces price moves and closing milestones to screen readers (E8) without spamming every tick. */
function LiveAnnouncer({ state }: { state: AuctionLiveState }) {
  const now = useNow();
  const [message, setMessage] = useState('');
  const lastPrice = useRef(state.price);
  const lastMark = useRef<number | null>(null);
  const left = (new Date(state.endsAt).getTime() - now) / 1000;

  useEffect(() => {
    if (state.price !== lastPrice.current) {
      lastPrice.current = state.price;
      setMessage(`New bid. Current price ${money(state.price)}, ${state.bidCount} bids.`);
    }
  }, [state.price, state.bidCount]);

  useEffect(() => {
    if (state.status !== 'live') return;
    const mark = [600, 300, 60, 10].find((m) => left <= m && left > m - 2) ?? null;
    if (mark !== null && mark !== lastMark.current) {
      lastMark.current = mark;
      setMessage(mark >= 60 ? `${mark / 60} minute${mark === 60 ? '' : 's'} left in this auction.` : `${mark} seconds left.`);
    }
  }, [left, state.status]);

  return (
    <div className="sr-only" aria-live="polite" role="status">
      {message}
    </div>
  );
}

export function LotView({ detail, similar, comments, me }: { detail: AuctionDetail; similar: AuctionCard[]; comments: Comment[]; me: Me | null }) {
  const router = useRouter();
  const { state, feed, freshKeys, connection, applyState } = useLiveAuction(liveOf(detail), detail.feed);
  // Our own last bid result, until a server render at least as new replaces it.
  const [lastBid, setLastBid] = useState<{ version: number; bidderNo: number; yourMax: number } | null>(null);
  const own = lastBid && lastBid.version >= detail.version ? lastBid : detail.viewer;

  const onResult = (r: BidResult) => {
    applyState(r.state);
    setLastBid({ version: r.state.version, bidderNo: r.bidderNo, yourMax: r.yourMax });
    router.refresh();
  };

  const isLeader = own.bidderNo !== null && state.leaderNo === own.bidderNo;
  const viewerNo = own.bidderNo;
  const staff = me?.role === 'moderator' || me?.role === 'admin';
  const live = state.status === 'live';
  const seller = detail.seller;

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-10 pt-5">
      <LiveAnnouncer state={state} />
      <div className="grid items-start gap-9 lg:grid-cols-2">
        {/* Left: gallery (sticky) */}
        <div className="lg:sticky lg:top-[90px]">
          <Gallery images={detail.images} credits={detail.imageCredits} title={detail.title} lotNo={detail.lotNo} />
          <div className="card mt-4 !gap-2.5 !px-4 !py-3.5">
            <div className="row !gap-[11px]">
              <Avatar initials={seller.initials} size={38} />
              <div className="flex-1">
                <Link href={`/users/${seller.id}`} className="text-[14px] font-medium text-ink no-underline hover:text-accent-800">
                  {seller.displayName}
                </Link>
                <div className="mut flex flex-wrap items-center gap-1.5 text-[12px]">
                  {seller.rating ? (
                    <>
                      <Stars value={seller.rating} size={12} /> {seller.rating.toFixed(1)} ({seller.ratingCount})
                    </>
                  ) : (
                    'No reviews yet'
                  )}{' '}
                  · {seller.sales} {seller.sales === 1 ? 'sale' : 'sales'} · Lot located at {detail.sellerLocation}
                </div>
              </div>
            </div>
            <Link href={`/users/${seller.id}`} className="text-[12.5px]">
              See all lots and reviews for {seller.displayName} →
            </Link>
            <p className="mut m-0 text-[12.5px] leading-[1.5]">Member since {new Date(seller.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. Bidwell sellers can’t bid on their own lots, and every edit after the first bid is published below.</p>
          </div>
        </div>

        {/* Right: all bidding */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div>
            <div className="k mb-[9px]">
              <Link href={`/?category=${detail.category}`} className="text-inherit no-underline" style={{ color: 'inherit' }}>
                {categoryLabel(detail.category)}
              </Link>
              {detail.brand ? ` / ${detail.brand}` : ''} / Lot #{detail.lotNo}
            </div>
            <h1 className="ttl mb-2.5 text-[28px] sm:text-[34px]">{detail.title}</h1>
            <div className="flex flex-wrap gap-2">
              <span className="tag tag-accent">{conditionLabel(detail.condition)}</span>
              <span className="tag tag-neutral">{categoryLabel(detail.category)}</span>
              <span className="tag tag-neutral">{shipLabel(detail)}</span>
              {detail.emdAmount && <span className="tag tag-neutral">Deposit {money(detail.emdAmount)}</span>}
              {state.hasReserve && <span className="tag tag-neutral">Reserve {state.reserveMet ? 'met' : 'price'}</span>}
              {detail.amendments.length > 0 && <span className="tag tag-warn">Amended</span>}
            </div>
            {detail.amendments.length > 0 && <Amendments items={detail.amendments} />}
          </div>

          <BidPanel detail={detail} state={state} yourMax={own.yourMax} isLeader={isLeader} onResult={onResult} />

          {detail.viewer.review && <ReviewForm auctionId={detail.id} {...detail.viewer.review} />}

          <BidFeed feed={feed} freshKeys={freshKeys} viewerNo={viewerNo} connection={connection} live={live} bidCount={state.bidCount} resultHref={`/lots/${detail.id}/result`} />

          <section className="card !gap-3 !p-4" aria-labelledby="details-title">
            <h2 id="details-title" className="k">
              Item details
            </h2>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-[13px]">
              <div>
                <dt className="mut text-[11.5px]">Condition</dt>
                <dd>{conditionLabel(detail.condition)}</dd>
              </div>
              {detail.brand && (
                <div>
                  <dt className="mut text-[11.5px]">Make / brand</dt>
                  <dd>{detail.brand}</dd>
                </div>
              )}
              {detail.specs.map((s) => (
                <div key={s.label}>
                  <dt className="mut text-[11.5px]">{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
            {detail.description && <p className="m-0 whitespace-pre-line text-[13px] leading-[1.6]">{detail.description}</p>}
          </section>

          <section className="card !gap-[11px] !p-4" aria-labelledby="delivery-title">
            <h2 id="delivery-title" className="k">
              Delivery &amp; payment
            </h2>
            <div className="row text-[13px]">
              <Truck size={16} strokeWidth={1.5} aria-hidden />
              <span>
                {detail.delivery === 'local_pickup'
                  ? `Lift from site at ${detail.location} within 15 days of full payment, at the buyer’s cost and risk`
                  : `${shipLabel(detail)} from ${detail.location}, after full payment`}
              </span>
            </div>
            <div className="row text-[13px]">
              <ShieldCheck size={16} strokeWidth={1.5} aria-hidden />
              <span>Sold on an “as is, where is” basis — inspect the lot before bidding</span>
            </div>
            <div className="row text-[13px]">
              <CreditCard size={16} strokeWidth={1.5} aria-hidden />
              <span>Bank deposit voucher or connectIPS · 48 hours to pay after the auction closes</span>
            </div>
          </section>

          <Comments auctionId={detail.id} initial={comments} me={me} status={state.status} />

          {staff && <ModeratorTools auctionId={detail.id} hidden={state.hidden} status={state.status} />}
          {me && !detail.viewer.isSeller && live && <ReportLot auctionId={detail.id} />}
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-10" aria-labelledby="similar-title">
          <h2 id="similar-title" className="ttl mt-3 text-[20px]">
            You might also like
          </h2>
          <hr className="hr !mb-4 !mt-2.5" />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {similar.map((lot) => (
              <Link key={lot.id} href={`/lots/${lot.id}`} className="card !gap-0 !p-0 text-ink no-underline hover:text-ink">
                <Photo src={lot.image} alt={lot.title} label={`#${lot.lotNo}`} />
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="ttl text-[14.5px]">{lot.title}</div>
                  <div className="num text-[18px]">{money(lot.price)}</div>
                  <div className="mut text-[11.5px]">
                    <CountdownText endsAt={lot.endsAt} status={lot.status} /> left · {lot.bidCount} bids
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
