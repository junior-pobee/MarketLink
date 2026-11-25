create or replace view public.marketlink_review_summary with (security_invoker = true) as
select product_id, count(*)::integer as review_count, round(avg(rating)::numeric,2) as average_rating
from public.marketlink_reviews
group by product_id;

grant select on public.marketlink_review_summary to anon, authenticated;
