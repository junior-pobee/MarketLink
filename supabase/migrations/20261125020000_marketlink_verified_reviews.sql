create table if not exists public.marketlink_reviews (
 id uuid primary key default gen_random_uuid(),
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 seller_id uuid not null references auth.users(id) on delete cascade,
 order_item_id uuid not null references public.order_items(id) on delete cascade,
 rating integer not null check (rating between 1 and 5),
 review_text text not null default '' check (char_length(review_text)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(reviewer_id,order_item_id)
);
alter table public.marketlink_reviews enable row level security;
create index if not exists marketlink_reviews_product_idx on public.marketlink_reviews(product_id,created_at desc);
create index if not exists marketlink_reviews_seller_idx on public.marketlink_reviews(seller_id,created_at desc);
drop policy if exists marketlink_reviews_public_read on public.marketlink_reviews;
create policy marketlink_reviews_public_read on public.marketlink_reviews for select to anon,authenticated using (true);
drop policy if exists marketlink_reviews_verified_insert on public.marketlink_reviews;
create policy marketlink_reviews_verified_insert on public.marketlink_reviews for insert to authenticated with check (
 reviewer_id=(select auth.uid()) and exists (
  select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
  where oi.id=marketlink_reviews.order_item_id and oi.product_id=marketlink_reviews.product_id and oi.seller_id=marketlink_reviews.seller_id and o.buyer_id=(select auth.uid()) and o.payment_status='paid'
 )
);
drop policy if exists marketlink_reviews_owner_update on public.marketlink_reviews;
create policy marketlink_reviews_owner_update on public.marketlink_reviews for update to authenticated using (reviewer_id=(select auth.uid())) with check (reviewer_id=(select auth.uid()));
drop policy if exists marketlink_reviews_owner_delete on public.marketlink_reviews;
create policy marketlink_reviews_owner_delete on public.marketlink_reviews for delete to authenticated using (reviewer_id=(select auth.uid()));
grant select on public.marketlink_reviews to anon,authenticated;
grant insert,update,delete on public.marketlink_reviews to authenticated;