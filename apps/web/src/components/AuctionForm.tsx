'use client';

import { CATEGORIES, CONDITIONS, DEFAULT_INCREMENT_BANDS, DELIVERY_OPTIONS, MATERIAL_FIELDS, parseMajorInput, toMajor, type AuctionCreateInput, type AuctionDetail, type IncrementBand } from '@bidwell/contract';
import { ImagePlus, Lock, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, uploadPhoto } from '@/lib/client';

const DURATIONS = [1, 3, 5, 7, 10];

const isDefaultBands = (b: IncrementBand[]) => JSON.stringify(b) === JSON.stringify(DEFAULT_INCREMENT_BANDS);
const rupeesText = (minor: number | null | undefined) => (minor ? String(toMajor(minor)) : '');
const localInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function AuctionForm({ existing }: { existing?: AuctionDetail }) {
  const router = useRouter();
  const frozen = Boolean(existing && existing.bidCount > 0);
  const locked = (field: (typeof MATERIAL_FIELDS)[number]) => frozen && (MATERIAL_FIELDS as readonly string[]).includes(field);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'vehicles');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [condition, setCondition] = useState(existing?.condition ?? 'like_new');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [specs, setSpecs] = useState(existing?.specs ?? []);
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [delivery, setDelivery] = useState(existing?.delivery ?? 'free_shipping');
  const [shipping, setShipping] = useState(rupeesText(existing?.shippingCost));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [start, setStart] = useState(rupeesText(existing?.startPrice));
  const [reserve, setReserve] = useState(''); // the reserve is sealed, so it is never prefilled
  const [emd, setEmd] = useState(rupeesText(existing?.emdAmount));
  const [days, setDays] = useState(7);
  const [endsAt, setEndsAt] = useState(existing ? localInput(existing.endsAt) : '');
  const [bandMode, setBandMode] = useState<'tiered' | 'flat' | 'custom'>(!existing || isDefaultBands(existing.incrementBands) ? 'tiered' : existing.incrementBands.length === 1 ? 'flat' : 'custom');
  const [flatStep, setFlatStep] = useState(existing?.incrementBands.length === 1 ? String(toMajor(existing.incrementBands[0].step)) : '100');
  const [softWindow, setSoftWindow] = useState(String(existing?.softCloseWindowSec ?? 120));
  const [softExtend, setSoftExtend] = useState(String(existing?.softCloseExtendSec ?? 120));

  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 8 - images.length)) {
        const url = await uploadPhoto(f);
        setImages((cur) => [...cur, url]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const build = (): AuctionCreateInput => {
    const startPrice = parseMajorInput(start) ?? 0;
    const bands: IncrementBand[] | undefined =
      bandMode === 'tiered' ? DEFAULT_INCREMENT_BANDS : bandMode === 'flat' ? [{ below: null, step: parseMajorInput(flatStep) ?? 10_000 }] : existing?.incrementBands;
    return {
      title,
      description,
      category: category as AuctionCreateInput['category'],
      brand: brand || null,
      condition: condition as AuctionCreateInput['condition'],
      specs: specs.filter((s) => s.label.trim() && s.value.trim()),
      images,
      delivery: delivery as AuctionCreateInput['delivery'],
      shippingCost: delivery === 'paid_shipping' ? (parseMajorInput(shipping) ?? 0) : null,
      location,
      startPrice,
      reservePrice: parseMajorInput(reserve),
      emdAmount: parseMajorInput(emd),
      incrementBands: bands,
      endsAt: existing || endsAt ? new Date(endsAt).toISOString() : new Date(Date.now() + days * 86_400_000).toISOString(),
      softCloseWindowSec: Number(softWindow),
      softCloseExtendSec: Number(softExtend),
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = build();
      if (!existing) {
        const { id } = await api<{ id: string }>('POST', '/auctions', body);
        router.push(`/lots/${id}`);
        return;
      }
      // Send only what changed; anything frozen is simply not sent.
      const before: Record<string, unknown> = {
        title: existing.title, description: existing.description, category: existing.category, brand: existing.brand, condition: existing.condition,
        specs: existing.specs, images: existing.images, delivery: existing.delivery, shippingCost: existing.shippingCost, location: existing.location,
        startPrice: existing.startPrice, emdAmount: existing.emdAmount, incrementBands: existing.incrementBands, endsAt: existing.endsAt,
        softCloseWindowSec: existing.softCloseWindowSec, softCloseExtendSec: existing.softCloseExtendSec,
      };
      const patch = Object.fromEntries(
        Object.entries(body).filter(([k, v]) => {
          if (k === 'reservePrice') return v !== null; // reserve is sealed: only sent when the seller types one
          if (k === 'endsAt') return new Date(v as string).getTime() !== new Date(existing.endsAt).getTime();
          return JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? null);
        }),
      );
      if (Object.keys(patch).length) await api('PATCH', `/auctions/${existing.id}`, patch);
      router.push(`/lots/${existing.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = (err.details as { fields?: string[] } | undefined)?.fields;
        setError(fields ? `${err.message} (${fields.join(', ')})` : err.message);
      } else setError('Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {frozen && (
        <div className="banner banner-warn">
          <Lock size={15} aria-hidden />
          <span>
            Bids have been placed, so the details bidders relied on are locked — price, reserve, increments, timing, title, condition and delivery. You can still clarify the description and add photos. Every edit is published in the lot’s amendment log.
          </span>
        </div>
      )}

      <Section title="The item">
        <div className="field">
          <label htmlFor="title">
            Title <LockMark show={frozen} />
          </label>
          <input id="title" className="input" required minLength={5} maxLength={120} value={title} disabled={locked('title')} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="category">
              Category <LockMark show={frozen} />
            </label>
            <select id="category" className="input" value={category} disabled={locked('category')} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="brand">
              Make / brand (optional) <LockMark show={frozen} />
            </label>
            <input id="brand" className="input" maxLength={60} value={brand} disabled={locked('brand')} onChange={(e) => setBrand(e.target.value)} />
          </div>
        </div>
        <fieldset>
          <legend className="label">
            Condition <LockMark show={frozen} />
          </legend>
          <div className="seg flex-wrap">
            {CONDITIONS.map((c) => (
              <label key={c.value} className="seg-opt">
                <input type="radio" name="condition" checked={condition === c.value} disabled={locked('condition')} onChange={() => setCondition(c.value)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" className="input" maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Honest condition, what's included, anything a bidder should know." />
        </div>
        <fieldset>
          <legend className="label">
            Specs <LockMark show={frozen} />
          </legend>
          <div className="flex flex-col gap-2">
            {specs.map((s, i) => (
              <div key={i} className="row !gap-2">
                <input className="input" aria-label={`Spec ${i + 1} label`} placeholder="e.g. Year" value={s.label} disabled={locked('specs')} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="input" aria-label={`Spec ${i + 1} value`} placeholder="e.g. 1972" value={s.value} disabled={locked('specs')} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                {!locked('specs') && (
                  <button type="button" className="btn btn-icon btn-secondary" aria-label={`Remove spec ${i + 1}`} onClick={() => setSpecs(specs.filter((_, j) => j !== i))}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {!locked('specs') && specs.length < 12 && (
              <button type="button" className="btn btn-ghost self-start" onClick={() => setSpecs([...specs, { label: '', value: '' }])}>
                <Plus size={14} aria-hidden /> Add a spec
              </button>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Photos ({images.length}/8){frozen ? ' — you can add photos but not remove existing ones' : ''}</legend>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
            {images.map((src, i) => {
              const original = frozen && existing!.images.includes(src);
              return (
                <div key={src} className="relative overflow-hidden rounded-[11px] border border-neutral-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
                  {!original && (
                    <button type="button" className="btn btn-icon absolute right-1 top-1 !h-7 !w-7 !bg-white" aria-label={`Remove photo ${i + 1}`} onClick={() => setImages(images.filter((x) => x !== src))}>
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}
            {images.length < 8 && (
              <label className="ph aspect-square cursor-pointer rounded-[11px] border border-dashed border-neutral-400">
                <span className="row !gap-1">
                  <ImagePlus size={13} aria-hidden /> {uploading ? 'Uploading…' : 'Add'}
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} disabled={uploading} />
              </label>
            )}
          </div>
          <p className="hint">JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover.</p>
        </fieldset>
      </Section>

      <Section title="Delivery">
        <fieldset>
          <legend className="label">
            How does the buyer get it? <LockMark show={frozen} />
          </legend>
          <div className="seg flex-wrap">
            {DELIVERY_OPTIONS.map((d) => (
              <label key={d.value} className="seg-opt">
                <input type="radio" name="delivery" checked={delivery === d.value} disabled={locked('delivery')} onChange={() => setDelivery(d.value)} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {delivery === 'paid_shipping' && (
            <Money id="shipping" label="Shipping cost" value={shipping} onChange={setShipping} disabled={locked('shippingCost')} locked={frozen} />
          )}
          <div className="field">
            <label htmlFor="location">
              Item location (city) <LockMark show={frozen} />
            </label>
            <input id="location" className="input" required minLength={2} maxLength={80} value={location} disabled={locked('location')} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Price and rules">
        <div className="grid gap-4 sm:grid-cols-3">
          <Money id="start" label="Starting price" value={start} onChange={setStart} required disabled={locked('startPrice')} locked={frozen} />
          <Money id="reserve" label={existing ? (existing.hasReserve ? 'New reserve (sealed)' : 'Reserve (optional)') : 'Reserve (optional, sealed)'} value={reserve} onChange={setReserve} disabled={locked('reservePrice')} locked={frozen} hint="The lowest price you’ll sell at. Bidders only see whether it’s met." />
          <Money id="emd" label="Earnest deposit (optional)" value={emd} onChange={setEmd} disabled={locked('emdAmount')} locked={frozen} hint="Refundable deposit bidders pay to qualify." />
        </div>
        <fieldset>
          <legend className="label">
            Bid increments <LockMark show={frozen} />
          </legend>
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              <label className="seg-opt">
                <input type="radio" name="bands" checked={bandMode === 'tiered'} disabled={locked('incrementBands')} onChange={() => setBandMode('tiered')} />
                <span>Price-tiered (recommended)</span>
              </label>
              <label className="seg-opt">
                <input type="radio" name="bands" checked={bandMode === 'flat'} disabled={locked('incrementBands')} onChange={() => setBandMode('flat')} />
                <span>Flat</span>
              </label>
            </div>
            {bandMode === 'flat' && (
              <span className="row !gap-2 text-[13px]">
                Rs.
                <input className="input !w-28" inputMode="numeric" aria-label="Flat increment in rupees" value={flatStep} disabled={locked('incrementBands')} onChange={(e) => setFlatStep(e.target.value)} />
              </span>
            )}
          </div>
          <p className="hint">Tiered: Rs. 100 under Rs. 10,000 · Rs. 500 under 1 lakh · Rs. 2,000 under 10 lakh · Rs. 10,000 under 1 crore · Rs. 50,000 above.</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          {existing ? (
            <div className="field">
              <label htmlFor="endsAt">
                Ends <LockMark show={frozen} />
              </label>
              <input id="endsAt" type="datetime-local" className="input" value={endsAt} disabled={locked('endsAt')} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="days">Runs for</label>
              <select id="days" className="input" value={endsAt ? 'custom' : days} onChange={(e) => (e.target.value === 'custom' ? setEndsAt(localInput(new Date(Date.now() + 86_400_000).toISOString())) : (setEndsAt(''), setDays(Number(e.target.value))))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'day' : 'days'}
                  </option>
                ))}
                <option value="custom">Pick an end time…</option>
              </select>
              {endsAt && <input type="datetime-local" aria-label="End time" className="input mt-2" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />}
            </div>
          )}
          <div className="field">
            <label htmlFor="softWindow">
              Soft-close window <LockMark show={frozen} />
            </label>
            <select id="softWindow" className="input" value={softWindow} disabled={locked('softCloseWindowSec')} onChange={(e) => setSoftWindow(e.target.value)}>
              <option value="0">Off</option>
              <option value="60">Last 1 minute</option>
              <option value="120">Last 2 minutes</option>
              <option value="300">Last 5 minutes</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="softExtend">
              …extends to <LockMark show={frozen} />
            </label>
            <select id="softExtend" className="input" value={softExtend} disabled={locked('softCloseExtendSec')} onChange={(e) => setSoftExtend(e.target.value)}>
              <option value="60">1 min after the bid</option>
              <option value="120">2 min after the bid</option>
              <option value="300">5 min after the bid</option>
            </select>
          </div>
        </div>
        <p className="hint">Soft close stops last-second sniping: a late bid gives everyone time to respond, whatever their connection speed.</p>
      </Section>

      {error && (
        <p className="banner banner-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary !px-6" disabled={busy || uploading}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Publish auction'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LockMark({ show }: { show: boolean }) {
  return show ? <Lock size={12} className="ml-1 inline align-[-1px]" aria-label="Locked after first bid" /> : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card !gap-4 !p-5">
      <h2 className="k">{title}</h2>
      {children}
    </section>
  );
}

function Money({ id, label, value, onChange, disabled, required, hint, locked }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; required?: boolean; hint?: string; locked?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <LockMark show={Boolean(locked)} />
      </label>
      <div className="relative">
        <span className="mut pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px]">Rs.</span>
        <input id={id} className="input !pl-10" inputMode="numeric" value={value} required={required} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
