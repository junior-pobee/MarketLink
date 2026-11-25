create table if not exists public.marketlink_support_tickets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 subject text not null check(length(trim(subject)) between 3 and 160),
 body text not null check(length(trim(body)) between 10 and 10000),
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.marketlink_support_tickets enable row level security;
create policy ticket_user_read on public.marketlink_support_tickets for select to authenticated using(user_id=(select auth.uid()) or public.is_marketlink_admin());
create policy ticket_user_create on public.marketlink_support_tickets for insert to authenticated with check(user_id=(select auth.uid()));
create policy ticket_admin_update on public.marketlink_support_tickets for update to authenticated using(public.is_marketlink_admin()) with check(public.is_marketlink_admin());
create table if not exists public.marketlink_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 target_user_id uuid references auth.users(id) on delete cascade,
 product_id uuid references public.products(id) on delete cascade,
 reason text not null check(length(trim(reason)) between 3 and 120),
 details text not null check(length(trim(details)) between 5 and 5000),
 status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now(),
 check(target_user_id is not null or product_id is not null)
);
alter table public.marketlink_reports enable row level security;
create policy report_user_read on public.marketlink_reports for select to authenticated using(reporter_id=(select auth.uid()) or public.is_marketlink_admin());
create policy report_user_create on public.marketlink_reports for insert to authenticated with check(reporter_id=(select auth.uid()));
create policy report_admin_update on public.marketlink_reports for update to authenticated using(public.is_marketlink_admin()) with check(public.is_marketlink_admin());
create table if not exists public.marketlink_user_blocks (
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 check(blocker_id<>blocked_id)
);
alter table public.marketlink_user_blocks enable row level security;
create policy blocks_self_manage on public.marketlink_user_blocks for all to authenticated using(blocker_id=(select auth.uid())) with check(blocker_id=(select auth.uid()));
create table if not exists public.marketlink_saved_searches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 search_text text not null check(length(trim(search_text)) between 1 and 300),
 filters jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.marketlink_saved_searches enable row level security;
create policy saved_search_self_manage on public.marketlink_saved_searches for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create index if not exists marketlink_tickets_user_status_idx on public.marketlink_support_tickets(user_id,status,created_at desc);
create index if not exists marketlink_reports_status_idx on public.marketlink_reports(status,created_at desc);
create index if not exists marketlink_saved_searches_user_idx on public.marketlink_saved_searches(user_id,created_at desc);
