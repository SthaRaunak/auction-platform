/** Disposal categories used by government departments, PSUs and local bodies. */
export const CATEGORIES = [
  { slug: 'vehicles', label: 'Vehicles' },
  { slug: 'scrap-metal', label: 'Scrap & metal' },
  { slug: 'e-waste', label: 'E-waste & IT' },
  { slug: 'office-furniture', label: 'Office furniture' },
  { slug: 'machinery', label: 'Machinery & plant' },
  { slug: 'confiscated', label: 'Confiscated goods' },
  { slug: 'land-property', label: 'Land & property' },
  { slug: 'timber', label: 'Timber & forest produce' },
  { slug: 'minerals', label: 'Minerals & sand' },
  { slug: 'licences', label: 'Licences & leases' },
  { slug: 'advertising', label: 'Advertising rights' },
  { slug: 'fisheries', label: 'Fisheries & ponds' },
  { slug: 'agri-produce', label: 'Agricultural produce' },
  { slug: 'medical', label: 'Medical & lab equipment' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

// Stored codes are generic; labels follow government disposal practice
// (items are declared serviceable, repairable or condemned by a survey board).
export const CONDITIONS = [
  { value: 'new', label: 'New / unused' },
  { value: 'like_new', label: 'Serviceable' },
  { value: 'good', label: 'Repairable' },
  { value: 'fair', label: 'Condemned / scrap' },
] as const;
export type Condition = (typeof CONDITIONS)[number]['value'];
export const CONDITION_VALUES = CONDITIONS.map((c) => c.value) as [Condition, ...Condition[]];

export function conditionLabel(value: string): string {
  return CONDITIONS.find((c) => c.value === value)?.label ?? value;
}

export const DELIVERY_OPTIONS = [
  { value: 'free_shipping', label: 'Delivered by department' },
  { value: 'paid_shipping', label: 'Delivery at buyer’s cost' },
  { value: 'local_pickup', label: 'Lift from site' },
] as const;
export type Delivery = (typeof DELIVERY_OPTIONS)[number]['value'];
export const DELIVERY_VALUES = DELIVERY_OPTIONS.map((d) => d.value) as [Delivery, ...Delivery[]];

export function deliveryLabel(value: string): string {
  return DELIVERY_OPTIONS.find((d) => d.value === value)?.label ?? value;
}

export const SORTS = [
  { value: 'ending_soonest', label: 'Ending soonest' },
  { value: 'newly_listed', label: 'Newly listed' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'most_bids', label: 'Most bids' },
  { value: 'fewest_bids', label: 'Fewest bids' },
  { value: 'ending_latest', label: 'Ending latest' },
] as const;
export type Sort = (typeof SORTS)[number]['value'];
export const SORT_VALUES = SORTS.map((s) => s.value) as [Sort, ...Sort[]];

export const ENDING_WINDOWS = [
  { value: 'hour', label: 'In the next hour' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
] as const;
export type EndingWindow = (typeof ENDING_WINDOWS)[number]['value'];

export const REPORT_REASONS = [
  { value: 'prohibited_item', label: 'Prohibited or illegal item' },
  { value: 'counterfeit', label: 'Counterfeit or misdescribed' },
  { value: 'fraud', label: 'Suspected fraud or shill bidding' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]];

/** Display-only buyer premium, in basis points. No payment rail exists (see docs/payments.md). */
export const BUYER_PREMIUM_BPS = 800;

/** Countdown chips switch to high emphasis below this many seconds. */
export const URGENCY_SECONDS = 60 * 60;
