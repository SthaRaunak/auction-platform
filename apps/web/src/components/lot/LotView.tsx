'use client';

import { type AuctionCard, type AuctionDetail, type AuctionLiveState, type BidResult, type Comment, type Me } from '@bidwell/contract';
import { CreditCard, ShieldCheck, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
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
  const { t, money } = useI18n();
  const [message, setMessage] = useState('');
  const lastPrice = useRef(state.price);
  const lastMark = useRef<number | null>(null);
  const left = (new Date(state.endsAt).getTime() - now) / 1000;

  useEffect(() => {
    if (state.price !== lastPrice.current) {
      lastPrice.current = state.price;
      setMessage(t('lot.announceBid', { price: money(state.price), count: state.bidCount }));
    }
  }, [state.price, state.bidCount, t, money]);

  useEffect(() => {
    if (state.status !== 'live') return;
    const mark = [600, 300, 60, 10].find((m) => left <= m && left > m - 2) ?? null;
    if (mark !== null && mark !== lastMark.current) {
      lastMark.current = mark;
      setMessage(mark >= 60 ? t('lot.announceMinutes', { count: mark / 60 }) : t('lot.announceSeconds', { count: mark }));
    }
  }, [left, state.status, t]);

  return (
    <div className="sr-only" aria-live="polite" role="status">
      {message}
    </div>
  );
}

export function LotView({ detail, similar, comments, me }: { detail: AuctionDetail; similar: AuctionCard[]; comments: Comment[]; me: Me | null }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, money } = i18n;
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
  const title = i18n.pick(detail.title, detail.titleNe);
  const description = i18n.pick(detail.description, detail.descriptionNe);
  const englishDescriptionOnly = i18n.locale === 'ne' && Boolean(detail.description) && !detail.descriptionNe;

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-10 pt-5">
      <LiveAnnouncer state={state} />
      <div className="grid items-start gap-9 lg:grid-cols-2">
        {/* Left: gallery (sticky) */}
        <div className="lg:sticky lg:top-[90px]">
          <Gallery images={detail.images} credits={detail.imageCredits} title={title} lotNo={detail.lotNo} />
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
                      <Stars value={seller.rating} size={12} /> {i18n.num(seller.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ({i18n.num(seller.ratingCount)})
                    </>
                  ) : (
                    t('common.noReviewsYet')
                  )}{' '}
                  · {t('lot.sales', { count: seller.sales })} · {t('lot.locatedAt', { location: detail.sellerLocation })}
                </div>
              </div>
            </div>
            <Link href={`/users/${seller.id}`} className="text-[12.5px]">
              {t('lot.seeSeller', { name: seller.displayName })}
            </Link>
            <p className="mut m-0 text-[12.5px] leading-[1.5]">{t('lot.sellerNote', { date: i18n.monthYear(seller.memberSince) })}</p>
          </div>
        </div>

        {/* Right: all bidding */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div>
            <div className="k mb-[9px]">
              <Link href={`/?category=${detail.category}`} className="text-inherit no-underline" style={{ color: 'inherit' }}>
                {i18n.category(detail.category)}
              </Link>
              {detail.brand ? ` / ${detail.brand}` : ''} / {t('common.lotNo', { lotNo: i18n.digits(detail.lotNo) })}
            </div>
            <h1 className="ttl mb-2.5 text-[28px] sm:text-[34px]">{title}</h1>
            <div className="flex flex-wrap gap-2">
              <span className="tag tag-accent">{i18n.condition(detail.condition)}</span>
              <span className="tag tag-neutral">{i18n.category(detail.category)}</span>
              <span className="tag tag-neutral">{shipLabel(i18n, detail)}</span>
              {detail.emdAmount && <span className="tag tag-neutral">{t('lot.deposit', { amount: money(detail.emdAmount) })}</span>}
              {state.hasReserve && <span className="tag tag-neutral">{t(state.reserveMet ? 'lot.reserveMet' : 'lot.reservePrice')}</span>}
              {detail.amendments.length > 0 && <span className="tag tag-warn">{t('lot.amended')}</span>}
            </div>
            {detail.amendments.length > 0 && <Amendments items={detail.amendments} />}
          </div>

          <BidPanel detail={detail} state={state} yourMax={own.yourMax} isLeader={isLeader} onResult={onResult} />

          {detail.viewer.review && <ReviewForm auctionId={detail.id} {...detail.viewer.review} />}

          <BidFeed feed={feed} freshKeys={freshKeys} viewerNo={viewerNo} connection={connection} live={live} bidCount={state.bidCount} resultHref={`/lots/${detail.id}/result`} />

          <section className="card !gap-3 !p-4" aria-labelledby="details-title">
            <h2 id="details-title" className="k">
              {t('lot.itemDetails')}
            </h2>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-[13px]">
              <div>
                <dt className="mut text-[12px]">{t('lot.condition')}</dt>
                <dd>{i18n.condition(detail.condition)}</dd>
              </div>
              {detail.brand && (
                <div>
                  <dt className="mut text-[12px]">{t('lot.brand')}</dt>
                  <dd>{detail.brand}</dd>
                </div>
              )}
              {detail.specs.map((s) => (
                <div key={s.label}>
                  <dt className="mut text-[12px]">{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
            {description && (
              <p className="m-0 whitespace-pre-line text-[13px] leading-[1.6]" lang={description === detail.descriptionNe ? 'ne' : 'en'}>
                {description}
              </p>
            )}
            {englishDescriptionOnly && <p className="mut m-0 text-[12px]">{t('lot.englishOnly')}</p>}
          </section>

          <section className="card !gap-[11px] !p-4" aria-labelledby="delivery-title">
            <h2 id="delivery-title" className="k">
              {t('lot.deliveryPayment')}
            </h2>
            <div className="row text-[13px]">
              <Truck size={16} strokeWidth={1.5} aria-hidden />
              <span>
                {detail.delivery === 'local_pickup'
                  ? t('lot.liftFrom', { location: detail.location })
                  : t('lot.shipFrom', { delivery: shipLabel(i18n, detail), location: detail.location })}
              </span>
            </div>
            <div className="row text-[13px]">
              <ShieldCheck size={16} strokeWidth={1.5} aria-hidden />
              <span>{t('lot.asIs')}</span>
            </div>
            <div className="row text-[13px]">
              <CreditCard size={16} strokeWidth={1.5} aria-hidden />
              <span>{t('lot.payment')}</span>
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
            {t('lot.similar')}
          </h2>
          <hr className="hr !mb-4 !mt-2.5" />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {similar.map((lot) => (
              <Link key={lot.id} href={`/lots/${lot.id}`} className="card !gap-0 !p-0 text-ink no-underline hover:text-ink">
                <Photo src={lot.image} alt={i18n.pick(lot.title, lot.titleNe)} label={`#${i18n.digits(lot.lotNo)}`} />
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="ttl text-[14.5px]">{i18n.pick(lot.title, lot.titleNe)}</div>
                  <div className="num text-[18px]">{money(lot.price)}</div>
                  <div className="mut text-[12px]">
                    {i18n.rich('lot.left', { time: () => <CountdownText endsAt={lot.endsAt} status={lot.status} /> }, { bids: t('common.bids', { count: lot.bidCount }) })}
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
