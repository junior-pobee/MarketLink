create index if not exists marketlink_moderation_actor_idx on public.marketlink_moderation_actions(actor_id);
create index if not exists marketlink_moderation_target_idx on public.marketlink_moderation_actions(target_user_id);
create index if not exists platform_announcements_created_by_idx on public.platform_announcements(created_by);
create index if not exists seller_ad_campaigns_product_idx on public.seller_ad_campaigns(product_id);
create index if not exists seller_ad_campaigns_seller_idx on public.seller_ad_campaigns(seller_id);

drop policy if exists announcements_admin_manage on public.platform_announcements;
create policy announcements_admin_insert on public.platform_announcements for insert to authenticated with check(public.is_marketlink_admin());
create policy announcements_admin_update on public.platform_announcements for update to authenticated using(public.is_marketlink_admin()) with check(public.is_marketlink_admin());
create policy announcements_admin_delete on public.platform_announcements for delete to authenticated using(public.is_marketlink_admin());

drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_owner_or_admin on public.profiles for update to authenticated
using(id=(select auth.uid()) or public.is_marketlink_admin())
with check(id=(select auth.uid()) or public.is_marketlink_admin());

drop policy if exists seller_plans_admin_read on public.seller_plans;
drop policy if exists seller_plans_read_own on public.seller_plans;
create policy seller_plans_read_owner_or_admin on public.seller_plans for select to authenticated
using(seller_id=(select auth.uid()) or public.is_marketlink_admin());

drop policy if exists subscription_catalog_admin_manage on public.seller_subscription_catalog;
create policy subscription_catalog_admin_insert on public.seller_subscription_catalog for insert to authenticated with check(public.is_marketlink_admin());
create policy subscription_catalog_admin_update on public.seller_subscription_catalog for update to authenticated using(public.is_marketlink_admin()) with check(public.is_marketlink_admin());
create policy subscription_catalog_admin_delete on public.seller_subscription_catalog for delete to authenticated using(public.is_marketlink_admin());

drop policy if exists storefronts_admin_update on public.storefronts;
drop policy if exists storefronts_update_owner on public.storefronts;
create policy storefronts_update_owner_or_admin on public.storefronts for update to authenticated
using(owner_id=(select auth.uid()) or public.is_marketlink_admin())
with check(owner_id=(select auth.uid()) or public.is_marketlink_admin());
