-- updated_at maintenance on every table that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger function only; never callable through the API.
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'assets', 'materials', 'models', 'app_state']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end
$$;
