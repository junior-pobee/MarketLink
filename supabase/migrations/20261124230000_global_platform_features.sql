create table if not exists public.marketlink_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('ceo','admin','moderator','support')),
  created_at timestamptz not null default now()
);
alter table public.marketlink_admins enable row level security;
create or replace function public.is_marketlink_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.marketlink_admins a where a.user_id = (select auth.uid())); $$;
revoke all on function public.is_marketlink_admin() from public;
grant execute on function public.is_marketlink_admin() to authenticated;
create table if not exists public.seller_subscription_catalog (
  plan_code text primary key,
  plan_name text not null,
  monthly_fee numeric(12,2) not null check (monthly_fee > 0),
  currency char(3) not null default 'GHS' check (currency = 'GHS'),
  category_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.seller_subscription_catalog(plan_code,plan_name,monthly_fee,currency,category_limit)
values ('single_category','Single Category Seller',550,'GHS',1),('multi_category','Multiple Categories Seller',920,'GHS',null)
on conflict (plan_code) do update set plan_name=excluded.plan_name,monthly_fee=excluded.monthly_fee,currency=excluded.currency,category_limit=excluded.category_limit;
alter table public.seller_subscription_catalog enable row level security;
create policy subscription_catalog_read on public.seller_subscription_catalog for select to authenticated using (active or public.is_marketlink_admin());
create policy subscription_catalog_admin_manage on public.seller_subscription_catalog for all to authenticated using (public.is_marketlink_admin()) with check (public.is_marketlink_admin());
alter table public.seller_plans add column if not exists monthly_fee numeric(12,2), add column if not exists currency char(3) not null default 'GHS', add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded')), add column if not exists category_count integer not null default 1 check (category_count > 0), add column if not exists updated_at timestamptz not null default now();
create table if not exists public.platform_announcements (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 140), body text not null check(length(trim(body)) between 1 and 5000), audience text not null default 'all' check(audience in ('all','buyers','sellers')), published boolean not null default false, published_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.platform_announcements enable row level security;
create policy announcements_read_published on public.platform_announcements for select to authenticated using (published or public.is_marketlink_admin());
create policy announcements_admin_manage on public.platform_announcements for all to authenticated using (public.is_marketlink_admin()) with check (public.is_marketlink_admin());
create or replace function public.marketlink_publish_announcement(p_title text,p_body text,p_audience text default 'all')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
 if p_audience not in ('all','buyers','sellers') then raise exception 'Invalid audience'; end if;
 insert into public.platform_announcements(title,body,audience,published,published_at,created_by) values(p_title,p_body,p_audience,true,now(),auth.uid()) returning id into v_id;
 insert into public.notifications(user_id,title,body,kind,payload)
 select p.id,p_title,p_body,'announcement',jsonb_build_object('announcement_id',v_id) from public.profiles p
 where p_audience='all' or (p_audience='buyers' and p.account_type in ('buyer','both')) or (p_audience='sellers' and p.account_type in ('seller','both'));
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'publish_announcement','platform_announcement',v_id,jsonb_build_object('audience',p_audience));
 return v_id;
end; $$;
revoke all on function public.marketlink_publish_announcement(text,text,text) from public;
grant execute on function public.marketlink_publish_announcement(text,text,text) to authenticated;
create table if not exists public.seller_ad_campaigns (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade, product_id uuid references public.products(id) on delete set null, media_path text, status text not null default 'pending_payment' check(status in ('pending_payment','pending_review','active','paused','rejected','expired')), payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid','failed','refunded')), starts_at timestamptz, ends_at timestamptz, provider_reference text, created_at timestamptz not null default now()
);
alter table public.seller_ad_campaigns enable row level security;
create policy ad_campaign_owner_read on public.seller_ad_campaigns for select to authenticated using(seller_id=(select auth.uid()) or public.is_marketlink_admin());
create policy ad_campaign_owner_insert on public.seller_ad_campaigns for insert to authenticated with check(seller_id=(select auth.uid()));
create policy ad_campaign_admin_update on public.seller_ad_campaigns for update to authenticated using(public.is_marketlink_admin()) with check(public.is_marketlink_admin());
alter table public.profiles add column if not exists account_status text not null default 'active' check(account_status in ('active','suspended','banned')), add column if not exists suspended_at timestamptz, add column if not exists suspension_reason text;
create table if not exists public.marketlink_moderation_actions (
 id uuid primary key default gen_random_uuid(), target_user_id uuid not null references auth.users(id) on delete cascade, actor_id uuid not null references auth.users(id), action text not null check(action in ('suspend','reinstate','ban')), reason text not null, created_at timestamptz not null default now()
);
alter table public.marketlink_moderation_actions enable row level security;
create policy moderation_admin_read on public.marketlink_moderation_actions for select to authenticated using(public.is_marketlink_admin());
create or replace function public.marketlink_moderate_user(p_target_user_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('suspend','reinstate','ban') then raise exception 'Invalid moderation action'; end if;
 update public.profiles set account_status=case when p_action='reinstate' then 'active' when p_action='ban' then 'banned' else 'suspended' end,suspended_at=case when p_action='reinstate' then null else now() end,suspension_reason=case when p_action='reinstate' then null else p_reason end,updated_at=now() where id=p_target_user_id;
 insert into public.marketlink_moderation_actions(target_user_id,actor_id,action,reason) values(p_target_user_id,auth.uid(),p_action,p_reason);
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),p_action||'_user','user',p_target_user_id,jsonb_build_object('reason',p_reason));
end; $$;
revoke all on function public.marketlink_moderate_user(uuid,text,text) from public;
grant execute on function public.marketlink_moderate_user(uuid,text,text) to authenticated;
drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversations.id and cm.user_id=(select auth.uid())));
drop policy if exists conversations_creator_insert on public.conversations;
create policy conversations_creator_insert on public.conversations for insert to authenticated with check(created_by=(select auth.uid()));
drop policy if exists conversation_members_read_self on public.conversation_members;
create policy conversation_members_read_self on public.conversation_members for select to authenticated using(user_id=(select auth.uid()) or public.is_marketlink_admin());
drop policy if exists conversation_members_creator_add on public.conversation_members;
create policy conversation_members_creator_add on public.conversation_members for insert to authenticated with check(exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=(select auth.uid())));
drop policy if exists conversation_members_self_update on public.conversation_members;
create policy conversation_members_self_update on public.conversation_members for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create or replace function public.marketlink_start_conversation(p_recipient_id uuid,p_product_id uuid,p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_conversation uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_recipient_id is null or p_recipient_id=v_user then raise exception 'Choose another user'; end if;
 if length(trim(coalesce(p_message,'')))=0 then raise exception 'Message cannot be empty'; end if;
 if not exists(select 1 from auth.users where id=p_recipient_id) then raise exception 'Recipient not found'; end if;
 insert into public.conversations(created_by,product_id,subject) values(v_user,p_product_id,coalesce(nullif(trim(p_subject),''),'Marketplace enquiry')) returning id into v_conversation;
 insert into public.conversation_members(conversation_id,user_id) values(v_conversation,v_user),(v_conversation,p_recipient_id);
 insert into public.messages(conversation_id,sender_id,body) values(v_conversation,v_user,trim(p_message));
 return v_conversation;
end; $$;
revoke all on function public.marketlink_start_conversation(uuid,uuid,text,text) from public;
grant execute on function public.marketlink_start_conversation(uuid,uuid,text,text) to authenticated;
