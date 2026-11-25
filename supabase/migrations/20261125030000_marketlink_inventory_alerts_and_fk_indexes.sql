alter table public.products add column if not exists low_stock_threshold integer not null default 5 check(low_stock_threshold>=0);
create or replace function public.marketlink_stock_alert_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.stock_quantity is not null and new.stock_quantity<=coalesce(new.low_stock_threshold,5)
 and (old.stock_quantity is null or old.stock_quantity>coalesce(new.low_stock_threshold,5))
 then
 insert into public.notifications(user_id,title,body,kind,payload)
 values(new.seller_id,'Low stock alert',new.title||' is running low ('||new.stock_quantity||' left).','inventory',jsonb_build_object('product_id',new.id,'quantity',new.stock_quantity));
 end if;
 return new;
end;$$;
drop trigger if exists marketlink_stock_alert on public.products;
create trigger marketlink_stock_alert after update of stock_quantity on public.products for each row execute function public.marketlink_stock_alert_trigger();
create index if not exists marketlink_reviews_order_item_idx on public.marketlink_reviews(order_item_id);
create index if not exists marketlink_reports_product_idx on public.marketlink_reports(product_id);
create index if not exists marketlink_reports_reporter_idx on public.marketlink_reports(reporter_id);
create index if not exists marketlink_reports_target_user_idx on public.marketlink_reports(target_user_id);
create index if not exists marketlink_user_blocks_blocked_idx on public.marketlink_user_blocks(blocked_id);