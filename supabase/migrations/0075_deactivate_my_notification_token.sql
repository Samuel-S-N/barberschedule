-- Settings > Notifications > off on a phone: the signed-in user switches their own device's Expo token off.
-- Only the caller's row changes (someone else's token is a no-op), like deactivate_my_web_subscription (0072).
create function public.deactivate_my_notification_token(target_expo_push_token text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where user_id = auth.uid() and expo_push_token = target_expo_push_token;
$$;

revoke all on function public.deactivate_my_notification_token(text) from public, anon;
grant execute on function public.deactivate_my_notification_token(text) to authenticated;
