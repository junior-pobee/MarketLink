create or replace function public.is_marketlink_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.marketlink_admins a
    where a.user_id = (select auth.uid())
  );
$$;

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
for update to authenticated using (public.is_marketlink_admin())
with check (public.is_marketlink_admin());

drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
for insert to authenticated with check (public.is_marketlink_admin());

drop policy if exists audit_logs_admin_insert on public.audit_logs;
create policy audit_logs_admin_insert on public.audit_logs
for insert to authenticated with check (public.is_marketlink_admin());

drop policy if exists moderation_admin_insert on public.marketlink_moderation_actions;
create policy moderation_admin_insert on public.marketlink_moderation_actions
for insert to authenticated with check (public.is_marketlink_admin());

create or replace function public.marketlink_publish_announcement(
  p_title text, p_body text, p_audience text default 'all'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
  if p_audience not in ('all','buyers','sellers') then raise exception 'Invalid audience'; end if;
  insert into public.platform_announcements(title,body,audience,published,published_at,created_by)
  values(p_title,p_body,p_audience,true,now(),auth.uid()) returning id into v_id;
  insert into public.notifications(user_id,title,body,kind,payload)
  select p.id,p_title,p_body,'announcement',jsonb_build_object('announcement_id',v_id)
  from public.profiles p
  where p_audience='all'
     or (p_audience='buyers' and p.account_type in ('buyer','both'))
     or (p_audience='sellers' and p.account_type in ('seller','both'));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'publish_announcement','platform_announcement',v_id,jsonb_build_object('audience',p_audience));
  return v_id;
end;
$$;

create or replace function public.marketlink_moderate_user(
  p_target_user_id uuid, p_action text, p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
  if p_action not in ('suspend','reinstate','ban') then raise exception 'Invalid moderation action'; end if;
  update public.profiles
  set account_status=case when p_action='reinstate' then 'active' when p_action='ban' then 'banned' else 'suspended' end,
      suspended_at=case when p_action='reinstate' then null else now() end,
      suspension_reason=case when p_action='reinstate' then null else p_reason end,
      updated_at=now()
  where id=p_target_user_id;
  if not found then raise exception 'Account profile not found'; end if;
  insert into public.marketlink_moderation_actions(target_user_id,actor_id,action,reason)
  values(p_target_user_id,auth.uid(),p_action,p_reason);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),p_action||'_user','user',p_target_user_id,jsonb_build_object('reason',p_reason));
end;
$$;

create or replace function public.marketlink_start_conversation(
  p_recipient_id uuid, p_product_id uuid, p_subject text, p_message text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_conversation uuid;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_recipient_id is null or p_recipient_id = v_user then raise exception 'Choose another user'; end if;
  if length(trim(coalesce(p_message,''))) = 0 then raise exception 'Message cannot be empty'; end if;
  if p_product_id is not null and not exists (
    select 1 from public.products where id=p_product_id and status='published'
  ) then raise exception 'Product is unavailable'; end if;
  insert into public.conversations(created_by,product_id,subject)
  values(v_user,p_product_id,coalesce(nullif(trim(p_subject),''),'Marketplace enquiry'))
  returning id into v_conversation;
  insert into public.conversation_members(conversation_id,user_id)
  values(v_conversation,v_user),(v_conversation,p_recipient_id);
  insert into public.messages(conversation_id,sender_id,body)
  values(v_conversation,v_user,trim(p_message));
  return v_conversation;
end;
$$;

revoke all on function public.is_marketlink_admin() from public, anon;
grant execute on function public.is_marketlink_admin() to authenticated;
revoke all on function public.marketlink_publish_announcement(text,text,text) from public, anon;
grant execute on function public.marketlink_publish_announcement(text,text,text) to authenticated;
revoke all on function public.marketlink_moderate_user(uuid,text,text) from public, anon;
grant execute on function public.marketlink_moderate_user(uuid,text,text) to authenticated;
revoke all on function public.marketlink_start_conversation(uuid,uuid,text,text) from public, anon;
grant execute on function public.marketlink_start_conversation(uuid,uuid,text,text) to authenticated;
