import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AuctionCreateInput } from '@bidwell/contract';
import { registerSubscribers } from '../bootstrap';
import { hashPassword } from '../infra/argon';
import { createAuction } from '../modules/auction/auction.usecase';
import { auctions } from '../modules/auction/auction.schema';
import { users } from '../modules/auth/auth.schema';
import type { UserRow } from '../modules/auth/auth.usecase';
import { closeAuction, placeBid } from '../modules/bid/bid.usecase';
import { postComment, removeComment } from '../modules/comment/comment.usecase';
import { flushOutbox } from '../modules/outbox/outbox.drainer';
import { payDeposit } from '../modules/payment/payment.usecase';
import { submitReview } from '../modules/review/review.usecase';
import { db, pool } from './index';
import { stockPhotos } from './seed-photos';

// Dev-only: wipes the database and loads a demo marketplace. Every bid goes
// through placeBid, so ledgers, hash chains and derived prices are genuine.

const PASSWORD = 'bidwell-demo-pass';
const TABLES = 'appeals, reports, audit_log, deposits, reviews, auction_comments, watchlist, amendments, bids, outbox, auctions, email_tokens, oauth_accounts, sessions, users';

const rupees = (n: number) => n * 100;
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function main() {
  registerSubscribers();
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw('alter table bids disable trigger user; alter table audit_log disable trigger user; alter table amendments disable trigger user'));
    await tx.execute(sql.raw(`truncate ${TABLES} restart identity cascade`));
    await tx.execute(sql.raw('alter table bids enable trigger user; alter table audit_log enable trigger user; alter table amendments enable trigger user'));
  });

  const passwordHash = await hashPassword(PASSWORD);
  const person = async (email: string, displayName: string, role: 'user' | 'moderator' | 'admin' = 'user') =>
    (await db.insert(users).values({ email, displayName, passwordHash, role, emailVerifiedAt: new Date() }).returning())[0];

  const anjali = await person('anjali@bidwell.test', 'Anjali Shrestha');
  const moderator = await person('mod@bidwell.test', 'Sunita Karki', 'moderator');
  await person('mod2@bidwell.test', 'Bikash Adhikari', 'moderator');
  await person('admin@bidwell.test', 'Admin Desk', 'admin');

  // Sellers are disposing offices — divisions, municipalities, customs, forest offices.
  // `code` prefixes their auction (लिलाम) notice numbers, which run on the Bikram Sambat fiscal year.
  const sellers = {
    roads: { user: await person('roads.pokhara@bidwell.test', 'Road Division Office, Pokhara'), city: 'Pokhara', code: 'RDO/PKR' },
    transport: { user: await person('depot.kathmandu@bidwell.test', 'Metropolitan Transport Depot, Kathmandu'), city: 'Kathmandu', code: 'MTD/KTM' },
    municipal: { user: await person('stores.lalitpur@bidwell.test', 'Lalitpur Metropolitan City, Stores Section'), city: 'Lalitpur', code: 'LMC/STR' },
    customs: { user: await person('customs.birgunj@bidwell.test', 'Customs Office, Birgunj'), city: 'Birgunj', code: 'CO/BRG' },
    forest: { user: await person('dfo.chitwan@bidwell.test', 'Division Forest Office, Chitwan'), city: 'Bharatpur', code: 'DFO/CTN' },
    dao: { user: await person('dao.kaski@bidwell.test', 'District Administration Office, Kaski'), city: 'Pokhara', code: 'DAO/KSK' },
    health: { user: await person('hospital.dhading@bidwell.test', 'District Hospital Stores, Dhading'), city: 'Dhading Besi', code: 'DH/DHD' },
  };
  // Bidders are VAT/PAN-registered firms and individual citizens.
  const bidders = await Promise.all(
    ['Shrestha Metal Udhyog', 'Himalayan Recyclers Pvt. Ltd.', 'Sita Gurung', 'Tamang Auto Traders', 'Green Valley E-Waste Pvt. Ltd.', 'Ram Bahadur Thapa'].map((n, i) =>
      person(`bidder${i + 1}@bidwell.test`, n),
    ),
  );
  await person('unverified@bidwell.test', 'Una Verified').then((u) => db.execute(sql`update users set email_verified_at = null where id = ${u.id}`));

  type Lot = Partial<AuctionCreateInput> & Pick<AuctionCreateInput, 'title' | 'category' | 'condition' | 'startPrice'> & {
    seller: keyof typeof sellers;
    /** Unsplash search used for demo photos when UNSPLASH_ACCESS_KEY is set. */
    photo: string;
    endsInMin: number;
    /** Each entry is one bid's maximum, in rupees. */
    maxes?: number[];
    qty?: string;
    extraSpecs?: { label: string; value: string }[];
  };

  const asIs = (city: string) =>
    `Sold by public auction (lilam) on an “as is, where is” basis, under the applicable government financial procedure rules. Inspection on office days (Sunday–Friday), 10:00–15:00, at the ${city} premises with prior notice. ` +
    `The successful bidder must deposit the balance within 15 days of the sale decision and remove the lot within 15 days of payment, at their own cost and risk. ` +
    `VAT (13%) and other applicable taxes are payable by the buyer. A PAN/VAT registration certificate is required at handover.`;

  const lots: Lot[] = [
    // Vehicles
    { seller: 'roads', photo: 'white pickup truck', title: 'Toyota Hilux double cab (2010) — condemned project vehicle', category: 'vehicles', brand: 'Toyota', condition: 'good', startPrice: rupees(8_50_000), emdAmount: rupees(85_000), endsInMin: 41, maxes: [8_80_000, 9_40_000, 10_20_000, 9_90_000],
      qty: '1 vehicle', extraSpecs: [{ label: 'Registration', value: 'Ga 1 Ja ••71' }, { label: 'Odometer', value: '2,86,000 km' }, { label: 'Papers', value: 'Bluebook, condemnation decision, tax clearance' }] },
    { seller: 'transport', photo: 'old bus', title: 'Tata 1512 city buses (2008), lot of 3', category: 'vehicles', brand: 'Tata', condition: 'fair', startPrice: rupees(13_50_000), emdAmount: rupees(1_35_000), endsInMin: 11, maxes: [13_80_000, 15_60_000, 14_70_000],
      qty: '3 buses', extraSpecs: [{ label: 'Condition', value: 'Off-road since 2080; engines seized' }, { label: 'Papers', value: 'Registration cancelled; sold for scrap' }] },
    { seller: 'health', photo: 'ambulance', title: 'Mahindra Bolero ambulance (2014)', category: 'vehicles', brand: 'Mahindra', condition: 'good', startPrice: rupees(6_00_000), reservePrice: rupees(8_00_000), emdAmount: rupees(60_000), endsInMin: 157, maxes: [6_20_000, 8_20_000, 9_40_000, 9_10_000],
      qty: '1 vehicle', extraSpecs: [{ label: 'Registration', value: 'Ba 2 Cha ••32' }, { label: 'Odometer', value: '3,12,500 km' }, { label: 'Fittings', value: 'Medical fittings removed; stretcher rails intact' }] },
    { seller: 'dao', photo: 'motorcycles parked', title: 'Unclaimed motorcycles, lot of 18', category: 'confiscated', condition: 'fair', startPrice: rupees(4_50_000), emdAmount: rupees(45_000), endsInMin: 60 * 49, maxes: [4_65_000],
      qty: '18 motorcycles (Bajaj, Hero, Honda)', extraSpecs: [{ label: 'Source', value: 'Unclaimed after 35-day public notice in the Gorkhapatra' }, { label: 'Papers', value: 'Sold as scrap; no transfer of ownership' }] },

    // Scrap & metal
    { seller: 'municipal', photo: 'scrap metal', title: 'MS scrap from dismantled water tank, approx. 42 MT', category: 'scrap-metal', condition: 'fair', startPrice: rupees(25_20_000), emdAmount: rupees(2_52_000), endsInMin: 60 * 13,
      qty: '≈ 42 MT (final billing on weighbridge)', extraSpecs: [{ label: 'Material', value: 'Mild steel plates and angles' }] },
    { seller: 'transport', photo: 'copper wire', title: 'Copper cable scrap, approx. 3.8 MT', category: 'scrap-metal', condition: 'fair', startPrice: rupees(36_00_000), emdAmount: rupees(3_60_000), endsInMin: 85, maxes: [36_80_000, 39_20_000],
      qty: '≈ 3.8 MT', extraSpecs: [{ label: 'Material', value: 'Armoured copper cable, insulated' }] },
    { seller: 'roads', photo: 'steel bridge', title: 'Bailey bridge panels and fittings, approx. 120 MT', category: 'scrap-metal', condition: 'fair', startPrice: rupees(84_00_000), emdAmount: rupees(8_40_000), endsInMin: 60 * 26, maxes: [85_00_000, 88_00_000],
      qty: '≈ 120 MT', extraSpecs: [{ label: 'Source', value: 'Temporary crossing replaced by RCC bridge, 2082' }] },

    // E-waste & IT
    { seller: 'dao', photo: 'old computers', title: 'Desktop computers and monitors, 146 units', category: 'e-waste', brand: 'Dell', condition: 'fair', startPrice: rupees(2_20_000), emdAmount: rupees(22_000), endsInMin: 60 * 5, maxes: [2_36_000],
      qty: '146 units', extraSpecs: [{ label: 'Eligibility', value: 'Recyclers registered with the Department of Environment only' }, { label: 'Data', value: 'Hard drives removed and destroyed' }] },
    { seller: 'health', photo: 'office printer', title: 'Laser printers and UPS batteries, mixed lot', category: 'e-waste', condition: 'fair', startPrice: rupees(76_000), endsInMin: 33, maxes: [80_000, 92_000, 99_000],
      qty: '41 printers, 63 batteries', extraSpecs: [{ label: 'Eligibility', value: 'Registered recyclers only' }] },

    // Office furniture
    { seller: 'municipal', photo: 'filing cabinets', title: 'Steel dafaar almirahs and filing cabinets, 64 pieces', category: 'office-furniture', brand: 'Godrej', condition: 'good', startPrice: rupees(1_44_000), endsInMin: 60 * 30,
      qty: '64 pieces' },
    { seller: 'dao', photo: 'conference table', title: 'Sal-wood conference table with 24 chairs', category: 'office-furniture', condition: 'good', startPrice: rupees(90_000), endsInMin: 60 * 70, maxes: [94_000],
      qty: '1 table, 24 chairs' },

    // Machinery & plant
    { seller: 'roads', photo: 'backhoe loader', title: 'JCB 3DX backhoe loader (2011)', category: 'machinery', brand: 'JCB', condition: 'good', startPrice: rupees(19_00_000), emdAmount: rupees(1_90_000), endsInMin: 22, maxes: [19_40_000, 21_20_000, 20_40_000],
      qty: '1 machine', extraSpecs: [{ label: 'Hours', value: '14,800 hrs' }, { label: 'Condition', value: 'Runs; hydraulic leak on boom cylinder' }] },
    { seller: 'health', photo: 'diesel generator', title: 'Diesel generator set, 125 kVA', category: 'machinery', brand: 'Kirloskar', condition: 'good', startPrice: rupees(4_80_000), emdAmount: rupees(48_000), endsInMin: 60 * 8,
      qty: '1 set', extraSpecs: [{ label: 'Year', value: '2067 BS' }, { label: 'Condition', value: 'Working; replaced by 250 kVA set' }] },
    { seller: 'roads', photo: 'road roller', title: 'Static road roller, 10 tonne (condemned)', category: 'machinery', condition: 'fair', startPrice: rupees(6_20_000), emdAmount: rupees(62_000), endsInMin: 60 * 20, maxes: [6_40_000, 6_90_000],
      qty: '1 machine' },

    // Confiscated goods
    { seller: 'customs', photo: 'mobile phones', title: 'Confiscated mobile phones, 210 units', category: 'confiscated', condition: 'new', startPrice: rupees(13_00_000), emdAmount: rupees(1_30_000), endsInMin: 52,
      qty: '210 handsets, assorted models', extraSpecs: [{ label: 'Order', value: 'Final confiscation under the Customs Act; appeal period lapsed' }, { label: 'Eligibility', value: 'VAT-registered traders only' }] },
    { seller: 'customs', photo: 'peppercorns', title: 'Seized timur (Sichuan pepper), 1.2 MT', category: 'confiscated', condition: 'new', delivery: 'free_shipping', startPrice: rupees(9_60_000), reservePrice: rupees(11_50_000), emdAmount: rupees(96_000), endsInMin: 60 * 40, maxes: [9_80_000],
      qty: '1.2 MT in sealed sacks', extraSpecs: [{ label: 'Test report', value: 'DFTQC laboratory, fit for consumption' }] },

    // Land & property
    { seller: 'municipal', photo: 'vacant land', title: 'Commercial land, 4 ropani — 30-year lease', category: 'land-property', condition: 'new', startPrice: rupees(5_60_00_000), emdAmount: rupees(56_00_000),
      incrementBands: [{ below: null, step: rupees(1_00_000) }], endsInMin: 60 * 9,
      qty: '4 ropani (≈ 2,035 sq m)', extraSpecs: [{ label: 'Kitta no.', value: '1124' }, { label: 'Permitted use', value: 'Commercial, per municipal building bylaws' }, { label: 'Tenure', value: '30-year lease, renewable' }] },
    { seller: 'municipal', photo: 'small shop', title: 'Shop no. 14, municipal market complex — 10-year lease', category: 'land-property', condition: 'new', startPrice: rupees(36_00_000), emdAmount: rupees(3_60_000), endsInMin: 18, maxes: [37_00_000, 42_00_000],
      qty: '1 shop, 28 sq m', extraSpecs: [{ label: 'Floor', value: 'Ground floor, road-facing' }, { label: 'Monthly rent', value: 'Rs. 8,400 + VAT' }] },

    // Timber & forest produce
    { seller: 'forest', photo: 'timber logs', title: 'Sal timber, 1,220 cu ft — depot lot 27', category: 'timber', condition: 'new', startPrice: rupees(48_00_000), emdAmount: rupees(4_80_000), endsInMin: 60 * 12, maxes: [49_00_000],
      qty: '1,220 cu ft (118 logs)', extraSpecs: [{ label: 'Grade', value: 'Grade I and II, depot-measured' }, { label: 'Transit permit', value: 'Issued by the DFO on full payment' }] },
    { seller: 'forest', photo: 'bamboo poles', title: 'Bamboo (tama bans), 12,000 culms', category: 'timber', condition: 'new', startPrice: rupees(7_20_000), endsInMin: 60 * 6, maxes: [7_40_000],
      qty: '12,000 culms' },

    // Minerals & river materials
    { seller: 'dao', photo: 'river gravel', title: 'River materials (sand, gravel, boulders), 6,35,000 cu ft — FY 2083/84', category: 'minerals', condition: 'new', startPrice: rupees(1_70_00_000), emdAmount: rupees(17_00_000),
      incrementBands: [{ below: null, step: rupees(50_000) }], endsInMin: 60 * 55,
      qty: '6,35,000 cu ft', extraSpecs: [{ label: 'Conditions', value: 'Per the approved IEE; manual collection only, no excavators in the riverbed' }] },

    // Licences & leases
    { seller: 'transport', photo: 'parking lot', title: 'Parking management contract, city bus park — 3 years', category: 'licences', condition: 'new', startPrice: rupees(28_80_000), emdAmount: rupees(2_88_000), endsInMin: 27, maxes: [29_20_000, 30_80_000, 32_40_000],
      qty: '1 contract (420 two-wheeler, 60 car bays)', extraSpecs: [{ label: 'Bid basis', value: 'Total fee for 3 years' }] },
    { seller: 'dao', photo: 'canteen', title: 'Canteen operation, District Administration complex — 2 years', category: 'licences', condition: 'new', startPrice: rupees(9_60_000), endsInMin: 60 * 10,
      qty: '1 licence' },

    // Advertising rights
    { seller: 'municipal', photo: 'billboard', title: 'Hoarding board rights at 22 locations — 3 years', category: 'advertising', condition: 'new', startPrice: rupees(72_00_000), emdAmount: rupees(7_20_000), endsInMin: 60 * 36, maxes: [73_00_000],
      qty: '22 boards', extraSpecs: [{ label: 'Content', value: 'Subject to the metropolitan city’s advertisement regulation' }] },

    // Fisheries
    { seller: 'dao', photo: 'fish pond', title: 'Fish farming rights, community pond no. 7 — 5 years', category: 'fisheries', condition: 'new', startPrice: rupees(12_40_000), emdAmount: rupees(1_24_000), endsInMin: 60 * 15,
      qty: '1 pond, 38 bigha', extraSpecs: [{ label: 'Preference', value: 'Local fisheries co-operatives may match the highest bid' }] },

    // Agricultural produce
    { seller: 'forest', photo: 'orange orchard', title: 'Orange harvest rights, government farm (380 trees) — 2083 season', category: 'agri-produce', condition: 'new', startPrice: rupees(7_80_000), endsInMin: 47, maxes: [8_00_000, 8_70_000],
      qty: '380 trees' },
    { seller: 'municipal', photo: 'rice sacks', title: 'Damaged rice stock, 64 MT (feed grade)', category: 'agri-produce', condition: 'fair', startPrice: rupees(19_20_000), emdAmount: rupees(1_92_000), endsInMin: 60 * 4, maxes: [19_60_000],
      qty: '64 MT', extraSpecs: [{ label: 'Use', value: 'Declared unfit for human consumption; animal feed or industrial use only' }] },

    // Medical & lab equipment
    { seller: 'health', photo: 'x-ray machine', title: 'X-ray machine, 300 mA (condemned)', category: 'medical', brand: 'Siemens', condition: 'fair', startPrice: rupees(2_80_000), endsInMin: 60 * 10, maxes: [2_90_000],
      qty: '1 unit', extraSpecs: [{ label: 'Eligibility', value: 'Agencies registered with the radiation regulator only (source removed)' }] },
  ];

  // Demo stock photos bypass the upload-only rule on purpose: real listings must
  // show the actual item, so sellers can only attach photos they upload.
  const stock = await stockPhotos();
  const attachPhotos = async (auctionId: string, query: string, count: number) => {
    const photos = await stock.photosFor(query, count);
    if (!photos.length) return;
    await db
      .update(auctions)
      .set({ images: photos.map((p) => p.url), imageCredits: Object.fromEntries(photos.map((p) => [p.url, p.credit])) })
      .where(eq(auctions.id, auctionId));
  };

  const meta = { ip: '127.0.0.1', userAgent: 'seed' };
  let notice = 0;
  const ids: string[] = [];
  for (const lot of lots) {
    const seller = sellers[lot.seller];
    const { seller: _s, photo, endsInMin, maxes, qty, extraSpecs, ...input } = lot;
    const a = await createAuction(seller.user, {
      description: asIs(seller.city),
      images: [],
      delivery: 'local_pickup',
      location: seller.city,
      ...input,
      specs: [
        { label: 'Notice no.', value: `${seller.code}/Lilam/2083-84/${String(++notice).padStart(3, '0')}` },
        ...(qty ? [{ label: 'Quantity', value: qty }] : []),
        { label: 'Lying at', value: `${seller.user.displayName.split(',')[0]} yard, ${seller.city}` },
        ...(extraSpecs ?? []),
      ],
      endsAt: inMinutes(endsInMin),
    } as AuctionCreateInput);
    ids.push(a.id);
    await attachPhotos(a.id, photo, 3);
    for (const [i, max] of (maxes ?? []).entries()) {
      const bidder = bidders[(i + ids.length) % bidders.length];
      try {
        if (lot.emdAmount) await payDeposit(bidder, a.id);
        await placeBid(bidder, a.id, { maxAmount: rupees(max), idempotencyKey: randomUUID() }, meta);
      } catch (err) {
        console.warn(`  skipped a bid on "${lot.title}": ${(err as Error).message}`);
      }
    }
  }

  // Anjali leads the ambulance lot and has a deposit (dharauti) lodged on the 42 MT scrap lot.
  await payDeposit(anjali, ids[2]);
  await placeBid(anjali, ids[2], { maxAmount: rupees(10_00_000), idempotencyKey: randomUUID() }, meta);
  await payDeposit(anjali, ids[4]);

  // Completed disposals: both sides review each other, so profiles have history.
  const completed: [keyof typeof sellers, string, AuctionCreateInput['category'], number, UserRow, number, string, number, string, string][] = [
    ['transport', 'Mahindra Scorpio (2009), condemned', 'vehicles', 4_20_000, bidders[3], 5, 'Vehicle and papers exactly as listed; handover took one morning.', 5, 'Paid in full on day 2 and collected on schedule.', 'suv'],
    ['municipal', 'Aluminium scrap, approx. 6.2 MT', 'scrap-metal', 18_60_000, bidders[0], 4, 'Weight matched the weighbridge slip. Gate pass took two visits.', 5, 'Lifted the full quantity within a week.', 'aluminium scrap'],
    ['dao', 'Office chairs, 140 pieces', 'office-furniture', 1_04_000, anjali, 4, 'Most chairs usable as described; a few castors missing.', 4, 'Paid promptly; collection was a day late.', 'office chairs'],
    ['forest', 'Khayer (catechu) logs, 410 cu ft', 'timber', 6_20_000, bidders[1], 5, 'Depot measurement was accurate and the transit permit came the same day.', 5, 'Documents in order, prompt payment.', 'wood logs'],
    ['roads', 'Tata Sumo (2007), condemned', 'vehicles', 2_10_000, bidders[5], 3, 'Ran fine, but the bluebook tax clearance took two weeks to arrive.', 4, 'Paid on time.', 'old car'],
    ['customs', 'Confiscated LED televisions, 46 units', 'confiscated', 5_80_000, bidders[3], 4, 'Units sealed as described. Customs paperwork was thorough.', 2, 'Balance paid on day 14 after two reminders; lifted late.', 'television'],
    ['health', 'Hospital beds (manual), 30 units', 'medical', 1_50_000, anjali, 5, 'Clean and well-packed for collection — very helpful stores staff.', 5, 'Collected on the agreed day.', 'hospital bed'],
  ];
  for (const [seller, title, category, max, winner, sellerStars, sellerReview, buyerStars, buyerReview, photo] of completed) {
    const dept = sellers[seller];
    const a = await createAuction(dept.user, {
      title, category, condition: 'fair', description: asIs(dept.city), images: [], delivery: 'local_pickup',
      specs: [{ label: 'Notice no.', value: `${dept.code}/Lilam/2083-84/${String(++notice).padStart(3, '0')}` }],
      location: dept.city, startPrice: rupees(Math.round(max * 0.7)), endsAt: inMinutes(30),
    } as AuctionCreateInput);
    await attachPhotos(a.id, photo, 1);
    const runnerUp = bidders[0] === winner ? bidders[2] : bidders[0];
    await placeBid(runnerUp, a.id, { maxAmount: rupees(Math.round(max * 0.8)), idempotencyKey: randomUUID() }, meta);
    await placeBid(winner, a.id, { maxAmount: rupees(max), idempotencyKey: randomUUID() }, meta);
    await db.execute(sql`update auctions set starts_at = now() - interval '9 days', ends_at = now() - interval '2 days' where id = ${a.id}`);
    await closeAuction(a.id);
    await submitReview(winner, a.id, { stars: sellerStars, comment: sellerReview });
    await submitReview(dept.user, a.id, { stars: buyerStars, comment: buyerReview });
  }

  // Public Q&A on live lots — the seller's answers are visible to every bidder.
  const thread = async (lot: number, posts: [UserRow, string][]) => {
    for (const [author, body] of posts) await postComment(author, ids[lot], body);
  };
  await thread(0, [
    [bidders[2], 'Is the vehicle tax paid up to date? Who pays for bluebook renewal?'],
    [sellers.roads.user, 'Tax is cleared up to FY 2081/82. Renewal and any later dues are the buyer’s responsibility.'],
  ]);
  await thread(2, [
    [anjali, 'Do the siren and the rear AC still work?'],
    [sellers.health.user, 'Siren works. The rear AC compressor is not working — please treat it as non-functional.'],
    [bidders[3], 'Can the stretcher be removed before handover? We only need the vehicle.'],
  ]);
  await thread(4, [
    [bidders[0], 'Is there a weighbridge on site, or do we arrange our own?'],
    [sellers.municipal.user, 'Weighing is done at the metropolitan city weighbridge at Sanepa; the slip is the basis for final billing.'],
  ]);
  await thread(16, [
    [bidders[5], 'Can the lease be mortgaged to a bank for a construction loan?'],
    [sellers.municipal.user, 'Yes, with the metropolitan city’s written consent, as per clause 9 of the lease agreement in the notice.'],
  ]);
  const spam = await postComment(bidders[4], ids[11], 'Cheap JCB spare parts available, call 98XXXXXXXX');
  await removeComment(moderator, spam.id, 'Advertising is not allowed in lot comments.');
  await thread(11, [[bidders[1], 'What is the condition of the tyres and the battery?']]);

  await db.execute(sql`insert into watchlist (user_id, auction_id) select ${anjali.id}, id from auctions where id in (${sql.join([ids[2], ids[0], ids[4], ids[6], ids[11], ids[17], ids[22]].map((i) => sql`${i}`), sql`, `)})`);
  await stock.save();
  await flushOutbox();
  if (!stock.available) console.log('\nNo UNSPLASH_ACCESS_KEY and no cached photos — lots use placeholder images.');
  console.log(`\nSeeded ${lots.length} live government lots and ${completed.length} completed disposals.\n`);
  console.log(`Sign in as anjali@bidwell.test / ${PASSWORD} (bidder), mod@bidwell.test (moderator), admin@bidwell.test (admin).`);
  console.log(`Departments sign in with their own addresses (e.g. roads.pokhara@bidwell.test). Every seeded account uses the same password.`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
