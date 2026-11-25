create or replace view public.marketlink_seller_sales_summary with (security_invoker = true) as
select oi.seller_id,
       count(distinct oi.order_id)::integer as order_count,
       coalesce(sum(oi.quantity),0)::bigint as units_sold,
       coalesce(sum(oi.quantity * oi.unit_price),0)::numeric(14,2) as gross_sales,
       oi.currency
from public.order_items oi
join public.orders o on o.id=oi.order_id
where o.payment_status='paid'
group by oi.seller_id, oi.currency;

grant select on public.marketlink_seller_sales_summary to authenticated;
