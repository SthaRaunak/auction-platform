'use client';

import { BUYER_PREMIUM_BPS, incrementFor, parseMajorInput, type AuctionDetail, type AuctionLiveState, type BidResult } from '@bidwell/contract';
import { AlertTriangle, Check, Info, Lock, Share2, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { ApiError, api } from '@/lib/client';
import { useCountdown } from '../Countdown';
import { useWatch } from '../WatchButton';

interface Props {
  detail: AuctionDetail;
  state: AuctionLiveState;
  yourMax: number | null;
  isLeader: boolean;
  onResult: (r: BidResult) => void;
}

export function BidPanel({ detail, state, yourMax, isLeader, onResult }: Props) {
  const { viewer } = detail;
  const { t, money, num, endStamp, error: errorText } = useI18n();
  const { label: endsLabel, urgent, left } = useCountdown(state.endsAt, state.status);
  const live = state.status === 'live' && !state.hidden;
  const step = state.increment;

  // The leader can only raise their own max; everyone else starts at the minimum next bid.
  const minimum = isLeader && yourMax ? yourMax + incrementFor(yourMax, detail.incrementBands) : state.minNextBid;
  const [typed, setTyped] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const amount = Math.max(minimum, value ?? minimum);
  const steps = Math.max(1, Math.round((amount - state.price) / step));

  const [busy, setBusy] = useState(false);
  // A success message describes one moment; once the auction moves on (a newer version), it's stale.
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string; version?: number } | null>(null);
  const showMessage = message && (message.version === undefined || message.version === state.version) ? message : null;
  // A9: one key per attempt at a given amount; a retry after a network failure reuses it.
  const attempt = useRef<{ amount: number; key: string; settled: boolean } | null>(null);

  const setAmount = (v: number) => {
    setValue(v);
    setTyped(null);
  };
  const stepBy = (dir: 1 | -1) => setAmount(Math.max(minimum, Math.round((amount + dir * step) / step) * step));

  const placeBid = async () => {
    if (!attempt.current || attempt.current.amount !== amount || attempt.current.settled) {
      attempt.current = { amount, key: crypto.randomUUID(), settled: false };
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<BidResult>('POST', `/auctions/${detail.id}/bids`, { maxAmount: amount, idempotencyKey: attempt.current.key });
      attempt.current.settled = true;
      onResult(r);
      setValue(null);
      setMessage(
        r.isLeader
          ? { tone: 'ok', version: r.state.version, text: t('bid.placedLeader', { price: money(r.state.price), max: money(r.yourMax) }) }
          : { tone: 'warn', version: r.state.version, text: t('bid.placedOutbid', { price: money(r.state.price) }) },
      );
    } catch (err) {
      if (err instanceof ApiError) {
        attempt.current.settled = true;
        const min = (err.details as { minimum?: number } | undefined)?.minimum;
        if (min) setAmount(min);
        setMessage({ tone: 'err', text: min ? t('bid.minimumNow', { message: errorText(err), min: money(min) }) : errorText(err) });
      } else {
        setMessage({ tone: 'err', text: t('bid.network') });
      }
    } finally {
      setBusy(false);
    }
  };

  const premium = Math.round((state.price * BUYER_PREMIUM_BPS) / 10_000);
  const allIn = state.price + premium + (detail.delivery === 'paid_shipping' ? (detail.shippingCost ?? 0) : 0);
  const extended = state.endsAt !== detail.originalEndsAt;

  return (
    <div className="card !gap-0 !p-[18px]">
      <div className="flex items-start justify-between gap-5">
        <div aria-live="polite" aria-atomic>
          <div className="mut mb-[7px] text-[12px]">
            {t(state.status !== 'live' ? (state.finalPrice ? 'bid.winningBid' : 'bid.finalPrice') : isLeader ? 'card.yourBidOnTop' : state.bidCount ? 'card.currentBid' : 'card.startingBid')} · {t('common.bids', { count: state.bidCount })}
          </div>
          <div className="num text-[38px] sm:text-[44px]">{money(state.finalPrice ?? state.price)}</div>
          {state.status === 'live' && (
            <div className="mut mt-2 text-[12.5px]">
              {t('bid.nextBid', { amount: money(state.minNextBid), step: money(step) })}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="mut mb-[7px] text-[12px]">{t(state.status === 'live' ? 'bid.endsIn' : 'bid.ended')}</div>
          <div className="num text-[24px] sm:text-[30px]" style={{ color: urgent ? 'var(--color-accent-800)' : undefined }} suppressHydrationWarning>
            {state.status === 'live' ? endsLabel : endStamp(detail.closedAt ?? state.endsAt)}
          </div>
          <div className="mut mt-2 text-[12px]" suppressHydrationWarning>
            {endStamp(state.endsAt)}
          </div>
          {extended && state.status === 'live' && <div className="mt-1 text-[12px] text-accent-700">{t('bid.extended')}</div>}
        </div>
      </div>

      <StatusBanner detail={detail} state={state} isLeader={isLeader} yourMax={yourMax} />

      {live && <BidBlocker detail={detail} secondsLeft={left} />}

      {live && !viewer.bidBlocker && left > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="max-bid" className="text-[12.5px] font-medium">
              {t(isLeader ? 'bid.raiseMax' : 'bid.yourMax')}
            </label>
            <span className="mut text-[12px]">{t('bid.stepsOf', { step: money(step), min: money(minimum) })}</span>
          </div>
          <div className="stepper">
            <button type="button" onClick={() => stepBy(-1)} disabled={amount <= minimum} aria-label={t('bid.lower')} className="border-r border-divider">
              −
            </button>
            <div className="min-w-0 flex-1 px-1.5 text-center">
              <input
                id="max-bid"
                inputMode="numeric"
                autoComplete="off"
                value={typed ?? money(amount)}
                onChange={(e) => setTyped(e.target.value)}
                onBlur={() => {
                  if (typed === null) return;
                  const parsed = parseMajorInput(typed);
                  setAmount(parsed === null || parsed < minimum ? minimum : parsed);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                aria-describedby="max-bid-sub"
                className="w-full border-0 bg-transparent p-0 pt-2 text-center text-[23px] tabular-nums tracking-[-0.02em] text-ink outline-none"
              />
              <div id="max-bid-sub" className="mut -mt-0.5 pb-1.5 text-[12px]">
                {steps <= 1 ? t(isLeader ? 'bid.oneAboveYours' : 'bid.minimumNext') : t('bid.stepsAbove', { count: steps })}
              </div>
            </div>
            <button type="button" onClick={() => stepBy(1)} aria-label={t('bid.raise')} className="border-l border-divider">
              +
            </button>
          </div>
          <button type="button" className="btn btn-primary mt-[9px] w-full !py-3" onClick={placeBid} disabled={busy || typed !== null}>
            {busy ? t('bid.placing') : t('bid.placeBid', { amount: money(amount) })}
          </button>
          <div className="mt-[11px] flex flex-wrap items-center gap-2">
            <span className="mut text-[12px]">{t('bid.jumpTo')}</span>
            {[1, 2, 4].map((m) => {
              const v = Math.max(minimum, state.price + step * m);
              return (
                <button key={m} type="button" className="pill" onClick={() => setAmount(v)}>
                  {money(v)}
                </button>
              );
            })}
          </div>
          {showMessage && (
            <p role="status" className={`banner mt-3 ${showMessage.tone === 'ok' ? 'banner-accent' : showMessage.tone === 'warn' ? 'banner-warn' : 'banner-danger'}`}>
              {showMessage.tone === 'ok' ? <Check size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
              {showMessage.text}
            </p>
          )}
          {!detail.maskBidders && (
            <p className="mt-3 flex gap-1.5 text-[12px] leading-[1.5] text-accent-700">
              <Info size={13} className="mt-0.5 flex-none" aria-hidden />
              {t('bid.publicNames')}
            </p>
          )}
          <p className="mut mt-3 text-[12px] leading-[1.55]">
            {t('bid.explainer', { step: money(step), fee: num(BUYER_PREMIUM_BPS / 100), allIn: money(allIn) })}
          </p>
        </div>
      )}

      <ActionsRow detail={detail} />
      {detail.softCloseWindowSec > 0 && state.status === 'live' && (
        <p className="mut mt-3 flex gap-1.5 text-[12px] leading-[1.5]">
          <Info size={13} className="mt-0.5 flex-none" aria-hidden />
          {t('bid.softClose', { window: Math.round(detail.softCloseWindowSec / 60), extend: Math.round(detail.softCloseExtendSec / 60) })}
        </p>
      )}
    </div>
  );
}

function StatusBanner({ detail, state, isLeader, yourMax }: { detail: AuctionDetail; state: AuctionLiveState; isLeader: boolean; yourMax: number | null }) {
  const { viewer } = detail;
  const { t, money } = useI18n();
  const resultHref = `/lots/${detail.id}/result`;
  if (state.status === 'voided') {
    return (
      <div className="banner banner-danger mt-4">
        <AlertTriangle size={15} aria-hidden />
        <span>
          {detail.moderation ? t('bid.voidedReason', { reason: detail.moderation.reason }) : t('bid.voided')} <Link href={resultHref}>{t('bid.publishedRecord')}</Link>
        </span>
      </div>
    );
  }
  if (state.status === 'closed') {
    const won = isLeader && state.winnerName !== null;
    return (
      <div className={`banner mt-4 ${won ? 'banner-accent' : 'banner-neutral'}`}>
        <Check size={15} aria-hidden />
        <span>
          {won
            ? t('bid.youWon', { price: money(state.finalPrice!) })
            : state.winnerName
              ? t('bid.soldTo', { name: state.winnerName, price: money(state.finalPrice!) })
              : t(state.bidCount ? 'bid.reserveNotMet' : 'bid.noBids')}{' '}
          <Link href={resultHref}>{t('bid.seeResult')}</Link>
        </span>
      </div>
    );
  }
  if (state.hidden) {
    return (
      <div className="banner banner-warn mt-4">
        <AlertTriangle size={15} aria-hidden />
        <span>{detail.moderation ? t('bid.pausedReason', { reason: detail.moderation.reason }) : t('bid.paused')}</span>
      </div>
    );
  }
  return (
    <>
      {isLeader ? (
        <div className="banner banner-accent mt-4">
          <Check size={15} aria-hidden />
          <span>
            {t('bid.youLead')}
            {yourMax ? ` ${t('bid.yourMaxIs', { amount: money(yourMax) })}` : ''}
          </span>
        </div>
      ) : viewer.bidderNo !== null ? (
        <div className="banner banner-warn mt-4">
          <AlertTriangle size={15} aria-hidden />
          <span>{yourMax ? t('bid.outbidMax', { amount: money(yourMax) }) : t('bid.outbid')}</span>
        </div>
      ) : null}
      {state.hasReserve && state.bidCount > 0 && (
        <p className={`mt-3 text-[12px] ${state.reserveMet ? 'text-accent-700' : 'mut'}`}>{t(state.reserveMet ? 'bid.reserveMetNote' : 'bid.reserveNotYet')}</p>
      )}
    </>
  );
}

function BidBlocker({ detail, secondsLeft }: { detail: AuctionDetail; secondsLeft: number }) {
  const router = useRouter();
  const { t, rich, money, endStamp, error: errorText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(`/lots/${detail.id}`);
  const blocker = secondsLeft <= 0 ? 'ended' : detail.viewer.bidBlocker;
  if (!blocker) return null;

  const box = (children: React.ReactNode) => <div className="banner banner-neutral mt-4">{children}</div>;
  switch (blocker) {
    case 'sign_in':
      return box(
        <>
          <Lock size={15} aria-hidden />
          <span>
            {rich('bid.signIn', {
              signin: (s) => <Link href={`/login?next=${next}`}>{s}</Link>,
              register: (s) => <Link href={`/register?next=${next}`}>{s}</Link>,
            })}
          </span>
        </>,
      );
    case 'verify_email':
      return box(
        <>
          <Lock size={15} aria-hidden />
          <span>{t('bid.verifyEmail')}</span>
        </>,
      );
    case 'seller':
      return box(
        <>
          <Info size={15} aria-hidden />
          <span>
            {rich('bid.ownLot', { edit: (s) => <Link href={`/lots/${detail.id}/edit`}>{s}</Link> })}
            {detail.bidCount > 0 ? t('bid.ownLotLocked') : ''}
          </span>
        </>,
      );
    case 'not_started':
      return box(
        <>
          <Info size={15} aria-hidden />
          <span>{t('bid.opens', { when: endStamp(detail.startsAt) })}</span>
        </>,
      );
    case 'deposit_required':
      return (
        <div className="banner banner-accent mt-4 flex-col !items-stretch">
          <span>
            {rich('bid.depositNeeded', { b: (s) => <strong>{s}</strong> }, { amount: money(detail.emdAmount!) })}
          </span>
          <button
            type="button"
            className="btn btn-primary self-start"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api('POST', `/auctions/${detail.id}/deposit`);
                router.refresh();
              } catch (e) {
                setError(e instanceof ApiError ? errorText(e) : t('bid.depositFailed'));
                setBusy(false);
              }
            }}
          >
            {busy ? t('bid.processing') : t('bid.payDeposit', { amount: money(detail.emdAmount!) })}
          </button>
          <span className="mut text-[12px]">{t('bid.demoGateway')}</span>
          {error && <span className="err">{error}</span>}
        </div>
      );
    case 'ended':
      return box(
        <>
          <Info size={15} aria-hidden />
          <span>{t('bid.closing')}</span>
        </>,
      );
    default:
      return null;
  }
}

function ActionsRow({ detail }: { detail: AuctionDetail }) {
  const { watched, busy, toggle } = useWatch(detail.id, detail.viewer.watched, detail.viewer.signedIn);
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3.5 flex gap-[9px]">
      <button type="button" className="btn btn-secondary flex-1" onClick={toggle} disabled={busy} aria-pressed={watched}>
        <Star size={15} strokeWidth={1.5} fill={watched ? 'var(--color-accent)' : 'none'} color={watched ? 'var(--color-accent)' : 'currentColor'} aria-hidden />
        {t(watched ? 'bid.watching' : 'bid.watch')}
      </button>
      <button
        type="button"
        className="btn btn-secondary flex-1"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        <Share2 size={15} strokeWidth={1.5} aria-hidden />
        {t(copied ? 'bid.copied' : 'bid.share')}
      </button>
    </div>
  );
}
