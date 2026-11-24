-- O.E. SeeDee poll: storage for herr.net/seedee/
-- Run in the Supabase SQL editor, then put the project URL and public key in config.js.
-- Safe to run again after an update: it keeps existing votes.
--
-- The public key can only call the functions below: cast a vote, read totals, read answer
-- patterns (once the summit is open), ask whether the summit is open, and, with the admin
-- passcode, open or close it. Names and comments are readable only from the Supabase dashboard
-- (Table editor > seedee_votes), which requires your own login.
--
-- After running this script, set your admin passcode once. Do NOT put it in this file; run this
-- line on its own in the SQL editor, with a passcode of your choice:
--   update public.seedee_settings set admin_code = 'your-passcode-here' where id = 1;

create table if not exists public.seedee_votes (
  voter      uuid        not null,
  name       text        not null check (char_length(name) between 1 and 80),
  case_key   text        not null check (case_key in ('A', 'B', 'C', 'D', 'D2')),
  answer     text        not null check (answer in ('yes', 'no', 'unc')),
  comment    text        check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (voter, case_key)
);

-- D2 is the second vote on Case D, taken after the hidden path. This also upgrades an older table.
alter table public.seedee_votes drop constraint if exists seedee_votes_case_key_check;
alter table public.seedee_votes add constraint seedee_votes_case_key_check
  check (case_key in ('A', 'B', 'C', 'D', 'D2'));

alter table public.seedee_votes enable row level security;
revoke all on table public.seedee_votes from anon, authenticated;

-- One row of settings: whether the summit is open, and the admin passcode. Nobody can read this
-- table with the public key.
create table if not exists public.seedee_settings (
  id          int     primary key default 1 check (id = 1),
  summit_open boolean not null default false,
  admin_code  text
);
insert into public.seedee_settings (id) values (1) on conflict (id) do nothing;
alter table public.seedee_settings enable row level security;
revoke all on table public.seedee_settings from anon, authenticated;

-- Cast or change one answer. One row per person per case.
create or replace function public.seedee_cast(
  p_voter uuid, p_name text, p_case text, p_answer text, p_comment text default null
) returns void
language sql security definer set search_path = public as $$
  insert into seedee_votes (voter, name, case_key, answer, comment)
  values (p_voter, btrim(p_name), p_case, p_answer, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (voter, case_key) do update
    set name = excluded.name, answer = excluded.answer, comment = excluded.comment, updated_at = now();
$$;

-- Totals per case and answer. No names.
create or replace function public.seedee_totals()
returns table (case_key text, answer text, n bigint)
language sql stable security definer set search_path = public as $$
  select v.case_key, v.answer, count(*) from seedee_votes v group by v.case_key, v.answer;
$$;

-- How many people gave each answer pattern for A, B, C, D, D2, e.g. 'yynny'. '-' marks no answer. No names.
-- Returns nothing until the summit is open.
create or replace function public.seedee_paths()
returns table (path text, n bigint)
language sql stable security definer set search_path = public as $$
  select s.path, count(*) from (
    select p.voter, string_agg(coalesce(left(v.answer, 1), '-'), '' order by c.ord) as path
    from (select distinct voter from seedee_votes) p
    cross join (values ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('D2', 5)) as c(k, ord)
    left join seedee_votes v on v.voter = p.voter and v.case_key = c.k
    group by p.voter
  ) s
  where (select summit_open from seedee_settings where id = 1)
  group by s.path;
$$;

-- Is the summit open?
create or replace function public.seedee_state()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select summit_open from seedee_settings where id = 1), false);
$$;

-- Administrator: with the right passcode, optionally open or close the summit, and get progress.
-- A wrong passcode waits a second and is refused.
create or replace function public.seedee_admin(p_code text, p_open boolean default null)
returns json
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select admin_code is not null and admin_code <> '' and admin_code = p_code into ok from seedee_settings where id = 1;
  if not coalesce(ok, false) then
    perform pg_sleep(1);
    raise exception 'wrong admin passcode' using errcode = '42501';
  end if;
  if p_open is not null then
    update seedee_settings set summit_open = p_open where id = 1;
  end if;
  return json_build_object(
    'open', (select summit_open from seedee_settings where id = 1),
    'people', (select count(distinct voter) from seedee_votes),
    'answered', (select coalesce(json_object_agg(t.case_key, t.n), '{}'::json)
                 from (select case_key, count(*) as n from seedee_votes group by case_key) t),
    'done4', (select count(*) from (select voter from seedee_votes where case_key in ('A', 'B', 'C', 'D')
                                    group by voter having count(*) = 4) x),
    'done5', (select count(*) from seedee_votes where case_key = 'D2'));
end;
$$;

revoke all on function public.seedee_cast(uuid, text, text, text, text) from public;
revoke all on function public.seedee_totals() from public;
revoke all on function public.seedee_paths() from public;
grant execute on function public.seedee_cast(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.seedee_totals() to anon, authenticated;
grant execute on function public.seedee_paths() to anon, authenticated;
revoke all on function public.seedee_state() from public;
revoke all on function public.seedee_admin(text, boolean) from public;
grant execute on function public.seedee_state() to anon, authenticated;
grant execute on function public.seedee_admin(text, boolean) to anon, authenticated;

-- Your view of the results (run in the SQL editor, or use the Table editor and its CSV export):
--   select name, case_key, answer, comment, updated_at from seedee_votes order by name, case_key;
