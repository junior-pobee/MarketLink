alter table public.orders
  add column if not exists payment_method text not null default 'cash_on_delivery'
  check (payment_method in ('cash_on_delivery','manual_transfer','online'));

create or replace function private.marketlink_can_view_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.orders o where o.id=p_order_id and o.buyer_id=(select auth.uid())
    union all
    select 1 from public.order_items oi where oi.order_id=p_order_id and oi.seller_id=(select auth.uid())
  );
$$;
revoke all on function private.marketlink_can_view_order(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.marketlink_can_view_order(uuid) to authenticated;

drop policy if exists orders_read_buyer on public.orders;
drop policy if exists orders_read_buyer_or_seller on public.orders;
create policy orders_read_buyer_or_seller on public.orders
for select to authenticated using(private.marketlink_can_view_order(id));
drop policy if exists order_items_read_buyer_or_seller on public.order_items;
create policy order_items_read_buyer_or_seller on public.order_items
for select to authenticated using(private.marketlink_can_view_order(order_id));

create or replace function private.marketlink_place_order(p_phone text,p_address text,p_notes text default '',p_lat double precision default null,p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_user uuid:=auth.uid(); v_cart_id uuid; v_order_id uuid; v_order_number text;
 v_currency char(3); v_min_currency char(3); v_max_currency char(3);
 v_subtotal numeric(12,2); v_seller uuid; v_item record; v_profile public.profiles%rowtype;
 v_orders jsonb:='[]'::jsonb;
begin
 if v_user is null then raise exception 'Sign in before placing an order'; end if;
 select * into v_profile from public.profiles where id=v_user;
 if not found or v_profile.account_status<>'active' then raise exception 'This account cannot place orders'; end if;
 if length(trim(coalesce(p_phone,'')))<7 then raise exception 'Enter a valid delivery phone number'; end if;
 if length(trim(coalesce(p_address,'')))<4 then raise exception 'Enter a delivery address or landmark'; end if;
 if (p_lat is not null and (p_lat < -90 or p_lat > 90)) or (p_lng is not null and (p_lng < -180 or p_lng > 180)) then raise exception 'Invalid delivery coordinates'; end if;
 select id into v_cart_id from public.carts where user_id=v_user;
 if v_cart_id is null or not exists(select 1 from public.cart_items where cart_id=v_cart_id) then raise exception 'Your cart is empty'; end if;
 select min(p.currency),max(p.currency) into v_min_currency,v_max_currency
 from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=v_cart_id;
 if v_min_currency is null or v_min_currency<>v_max_currency then raise exception 'Your cart contains different currencies. Place separate orders by currency'; end if;
 v_currency:=v_min_currency;
 for v_seller in
  select distinct p.seller_id from public.cart_items ci join public.products p on p.id=ci.product_id
  where ci.cart_id=v_cart_id order by p.seller_id
 loop
  v_subtotal:=0;
  for v_item in
   select ci.product_id,ci.quantity,p.title,p.price,p.currency,p.stock_quantity,p.seller_id,p.status
   from public.cart_items ci join public.products p on p.id=ci.product_id
   where ci.cart_id=v_cart_id and p.seller_id=v_seller order by p.id for update of p
  loop
   if v_item.status<>'published' then raise exception 'A product in your cart is no longer available'; end if;
   if v_item.stock_quantity<v_item.quantity then raise exception 'Not enough stock for %',v_item.title; end if;
   v_subtotal:=v_subtotal+(v_item.price*v_item.quantity);
  end loop;
  v_order_number:='ML-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.orders(buyer_id,order_number,currency,subtotal,shipping_total,tax_total,total,status,payment_status,payment_method,shipping_address)
  values(v_user,v_order_number,v_currency,v_subtotal,0,0,v_subtotal,'pending','unpaid','cash_on_delivery',
   jsonb_build_object('name',v_profile.display_name,'phone',trim(p_phone),'address',trim(p_address),'notes',coalesce(trim(p_notes),''),'latitude',p_lat,'longitude',p_lng))
  returning id into v_order_id;
  for v_item in
   select ci.product_id,ci.quantity,p.title,p.price,p.currency,p.seller_id
   from public.cart_items ci join public.products p on p.id=ci.product_id
   where ci.cart_id=v_cart_id and p.seller_id=v_seller order by p.id for update of p
  loop
   insert into public.order_items(order_id,product_id,seller_id,product_title,quantity,unit_price,currency)
   values(v_order_id,v_item.product_id,v_item.seller_id,v_item.title,v_item.quantity,v_item.price,v_item.currency);
   update public.products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now()
   where id=v_item.product_id and stock_quantity>=v_item.quantity;
   if not found then raise exception 'Stock changed while placing your order'; end if;
  end loop;
  insert into public.notifications(user_id,title,body,kind,payload)
  values(v_seller,'New order received','A buyer placed a new MarketLink order','order',jsonb_build_object('order_id',v_order_id,'order_number',v_order_number));
  v_orders:=v_orders||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'total',v_subtotal,'currency',v_currency,'payment_method','cash_on_delivery'));
 end loop;
 delete from public.cart_items where cart_id=v_cart_id;
 update public.carts set updated_at=now() where id=v_cart_id;
 return v_orders;
end; $$;
revoke all on function private.marketlink_place_order(text,text,text,double precision,double precision) from public,anon;
grant execute on function private.marketlink_place_order(text,text,text,double precision,double precision) to authenticated;

create or replace function public.marketlink_place_order(p_phone text,p_address text,p_notes text default '',p_lat double precision default null,p_lng double precision default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.marketlink_place_order(p_phone,p_address,p_notes,p_lat,p_lng); $$;
revoke all on function public.marketlink_place_order(text,text,text,double precision,double precision) from public,anon;
grant execute on function public.marketlink_place_order(text,text,text,double precision,double precision) to authenticated;
