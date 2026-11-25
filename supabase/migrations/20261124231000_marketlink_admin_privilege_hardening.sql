
drop policy if exists marketlink_admin_self_read on public.marketlink_admins;
create policy marketlink_admin_self_read on public.marketlink_admins
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_marketlink_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select exists (select 1 from public.marketlink_admins a where a.user_id = (select auth.uid())); $$;

revoke all on function public.is_marketlink_admin() from public;
revoke all on function public.is_marketlink_admin() from anon;
grant execute on function public.is_marketlink_admin() to authenticated;

revoke all on function public.marketlink_publish_announcement(text,text,text) from public;
revoke all on function public.marketlink_publish_announcement(text,text,text) from anon;
grant execute on function public.marketlink_publish_announcement(text,text,text) to authenticated;

revoke all on function public.marketlink_moderate_user(uuid,text,text) from public;
revoke all on function public.marketlink_moderate_user(uuid,text,text) from anon;
grant execute on function public.marketlink_moderate_user(uuid,text,text) to authenticated;

revoke all on function public.marketlink_start_conversation(uuid,uuid,text,text) from public;
revoke all on function public.marketlink_start_conversation(uuid,uuid,text,text) from anon;
grant execute on function public.marketlink_start_conversation(uuid,uuid,text,text) to authenticated;
