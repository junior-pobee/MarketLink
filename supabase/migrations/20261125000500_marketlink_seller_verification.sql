drop policy if exists storefronts_admin_update on public.storefronts;
create policy storefronts_admin_update on public.storefronts
for update to authenticated using(public.is_marketlink_admin())
with check(public.is_marketlink_admin());

create or replace function public.marketlink_set_storefront_verification(p_storefront_id uuid,p_verified boolean)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_owner uuid; v_name text;
begin
 if not public.is_marketlink_admin() then raise exception 'Administrator access required'; end if;
 update public.storefronts set verified_at=case when p_verified then now() else null end,updated_at=now()
 where id=p_storefront_id returning owner_id,name into v_owner,v_name;
 if not found then raise exception 'Storefront not found'; end if;
 insert into public.notifications(user_id,title,body,kind,payload)
 values(v_owner,case when p_verified then 'MarketLink seller verified' else 'MarketLink verification updated' end,
 case when p_verified then 'Your storefront has received a MarketLink verification badge.' else 'Your storefront verification badge has been removed.' end,
 'verification',jsonb_build_object('storefront_id',p_storefront_id,'verified',p_verified));
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),case when p_verified then 'verify_storefront' else 'remove_storefront_verification' end,
 'storefront',p_storefront_id,jsonb_build_object('owner_id',v_owner,'name',v_name));
end; $$;
revoke all on function public.marketlink_set_storefront_verification(uuid,boolean) from public,anon;
grant execute on function public.marketlink_set_storefront_verification(uuid,boolean) to authenticated;
