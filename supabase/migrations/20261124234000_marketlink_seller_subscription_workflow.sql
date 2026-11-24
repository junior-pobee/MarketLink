drop policy if exists seller_plans_insert_own on public.seller_plans;
create policy seller_plans_insert_own on public.seller_plans
for insert to authenticated
with check (
  seller_id = (select auth.uid())
  and status = 'pending'
  and payment_status = 'pending'
  and exists (
    select 1 from public.seller_subscription_catalog c
    where c.plan_code = seller_plans.plan_code
      and c.active
      and c.monthly_fee = seller_plans.monthly_fee
      and c.currency = seller_plans.currency
      and (c.category_limit is null or seller_plans.category_count <= c.category_limit)
  )
);

drop policy if exists seller_plans_admin_update on public.seller_plans;
create policy seller_plans_admin_update on public.seller_plans
for update to authenticated using (public.is_marketlink_admin())
with check (public.is_marketlink_admin());

drop policy if exists seller_plans_admin_read on public.seller_plans;
create policy seller_plans_admin_read on public.seller_plans
for select to authenticated using (public.is_marketlink_admin());

create or replace function public.marketlink_request_subscription(p_plan_code text,p_category_count integer default 1)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_plan public.seller_subscription_catalog%rowtype; v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_category_count is null or p_category_count<1 then raise exception 'Select at least one category'; end if;
 select * into v_plan from public.seller_subscription_catalog where plan_code=p_plan_code and active=true;
 if not found then raise exception 'Subscription plan is unavailable'; end if;
 if v_plan.category_limit is not null and p_category_count>v_plan.category_limit then raise exception 'This plan allows only one product category'; end if;
 insert into public.seller_plans(seller_id,plan_code,status,monthly_fee,currency,payment_status,category_count)
 values(v_user,v_plan.plan_code,'pending',v_plan.monthly_fee,v_plan.currency,'pending',p_category_count)
 returning id into v_id;
 return v_id;
end; $$;

create or replace function public.marketlink_review_subscription(p_plan_id uuid,p_approve boolean,p_reason text default '')
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_seller uuid;
begin
 if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
 select seller_id into v_seller from public.seller_plans where id=p_plan_id for update;
 if not found then raise exception 'Subscription request not found'; end if;
 update public.seller_plans
 set status=case when p_approve then 'active' else 'cancelled' end,
     payment_status=case when p_approve then 'paid' else 'failed' end,
     starts_at=case when p_approve then now() else starts_at end,
     ends_at=case when p_approve then now()+interval '1 month' else ends_at end,
     updated_at=now()
 where id=p_plan_id;
 insert into public.notifications(user_id,title,body,kind,payload)
 values(v_seller,case when p_approve then 'Seller subscription activated' else 'Subscription request not approved' end,
   case when p_approve then 'Your MarketLink seller subscription is active for one month.' else coalesce(nullif(trim(p_reason),''),'Please contact MarketLink support for details.') end,
   'subscription',jsonb_build_object('plan_id',p_plan_id,'approved',p_approve));
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),case when p_approve then 'approve_subscription' else 'reject_subscription' end,'seller_plan',p_plan_id,jsonb_build_object('seller_id',v_seller,'reason',p_reason));
end; $$;

create or replace function public.marketlink_enforce_paid_seller_plan()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_limit integer; v_categories integer;
begin
 if new.status<>'published' then return new; end if;
 select c.category_limit into v_limit
 from public.seller_plans sp join public.seller_subscription_catalog c on c.plan_code=sp.plan_code
 where sp.seller_id=new.seller_id and sp.status='active' and sp.payment_status='paid' and sp.ends_at>now()
 order by sp.ends_at desc limit 1;
 if not found then raise exception 'An active paid seller subscription is required to publish products'; end if;
 if v_limit is not null then
  select count(distinct category_id) into v_categories from public.products
  where seller_id=new.seller_id and status='published' and id is distinct from new.id;
  if not exists(select 1 from public.products p where p.seller_id=new.seller_id and p.status='published' and p.id is distinct from new.id and p.category_id=new.category_id)
     and v_categories>=v_limit then
   raise exception 'Your subscription allows listings in one product category only';
  end if;
 end if;
 return new;
end; $$;

drop trigger if exists marketlink_paid_seller_plan_guard on public.products;
create trigger marketlink_paid_seller_plan_guard before insert or update of status,category_id on public.products
for each row execute function public.marketlink_enforce_paid_seller_plan();

revoke all on function public.marketlink_request_subscription(text,integer) from public,anon;
grant execute on function public.marketlink_request_subscription(text,integer) to authenticated;
revoke all on function public.marketlink_review_subscription(uuid,boolean,text) from public,anon;
grant execute on function public.marketlink_review_subscription(uuid,boolean,text) to authenticated;
