-- Hosted projects ship public.rls_auto_enable(), the SECURITY DEFINER function behind the
-- platform's "enable RLS on new tables" event trigger. It is executable by anon and authenticated,
-- which the security advisor flags. The event trigger does not need those grants, so revoke them.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
