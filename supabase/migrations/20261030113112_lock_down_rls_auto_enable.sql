-- rls_auto_enable() is a Supabase platform event-trigger helper. Event triggers run as the owner,
-- so nobody needs EXECUTE on it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
