begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

-- Safety net: a table in `public` without row level security is readable and writable by anon/authenticated through the API.
-- The list of offenders is the "got" value, so a failure names the tables. Extension-owned tables are not ours to alter.
select is(
  (
    select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  ),
  '',
  'every table in schema public has row level security enabled'
);

-- The check itself works: a table created without RLS shows up in that list.
create table public.t64_no_rls (id int);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 't64_no_rls' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  1,
  'a table created without RLS is detected by the same predicate'
);

select * from finish();
rollback;
