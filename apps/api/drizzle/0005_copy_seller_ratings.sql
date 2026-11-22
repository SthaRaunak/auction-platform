-- Carry existing seller ratings into the two-way reviews table before the old table is dropped.
INSERT INTO reviews (id, auction_id, reviewer_id, reviewee_id, reviewee_role, stars, comment, created_at)
SELECT id, auction_id, rater_id, seller_id, 'seller', stars, comment, created_at FROM seller_ratings
ON CONFLICT DO NOTHING;
