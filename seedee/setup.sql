-- O.E. SeeDee poll: storage for herr.net/seedee/
-- Run in the Supabase SQL editor, then put the project URL and public key in config.js.
-- Safe to run again after an update: it keeps existing votes.
--
-- The public key can only call the functions below: cast a vote, read totals, read answer
-- patterns (once the summit is open), ask which switches are on, and, with the admin passcode,
-- flip them and read progress and individual answers. Without the passcode, names and comments
-- are readable only from the Supabase dashboard (Table editor > seedee_votes).
--
-- Two switches, both off after a first install: "cases" lets people move from the ground rules
-- into Case A, "summit" shows everyone's results. Flip them in the page's admin panel.
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

-- One row of settings: the two switches and the admin passcode. Nobody can read this table with
-- the public key.
create table if not exists public.seedee_settings (
  id          int     primary key default 1 check (id = 1),
  summit_open boolean not null default false,
  cases_open  boolean not null default false,
  admin_code  text
);
alter table public.seedee_settings add column if not exists cases_open boolean not null default false;
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

-- Which switches are on? { "cases": bool, "summit": bool }
drop function if exists public.seedee_state();
create function public.seedee_state()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('cases', coalesce(s.cases_open, false), 'summit', coalesce(s.summit_open, false))
  from (select 1) one left join seedee_settings s on s.id = 1;
$$;

-- Administrator: with the right passcode, optionally flip a switch, and get progress.
-- p_list ('yes', 'no' or 'unc') also returns everyone who gave that answer, with name and comment.
-- A wrong passcode waits a second and is refused.
drop function if exists public.seedee_admin(text, boolean);
create or replace function public.seedee_admin(p_code text, p_open boolean default null, p_cases boolean default null, p_list text default null)
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
  if p_cases is not null then
    update seedee_settings set cases_open = p_cases where id = 1;
  end if;
  return json_build_object(
    'open', (select summit_open from seedee_settings where id = 1),
    'cases', (select cases_open from seedee_settings where id = 1),
    'people', (select count(distinct voter) from seedee_votes),
    'answered', (select coalesce(json_object_agg(t.case_key, t.n), '{}'::json)
                 from (select case_key, count(*) as n from seedee_votes group by case_key) t),
    'done4', (select count(*) from (select voter from seedee_votes where case_key in ('A', 'B', 'C', 'D')
                                    group by voter having count(*) = 4) x),
    'done5', (select count(*) from seedee_votes where case_key = 'D2'),
    'votes', case when p_list is null then null else
      (select coalesce(json_agg(json_build_object('case', v.case_key, 'name', v.name, 'comment', v.comment)
                                order by v.case_key, lower(v.name)), '[]'::json)
       from seedee_votes v where v.answer = p_list) end);
end;
$$;

revoke all on function public.seedee_cast(uuid, text, text, text, text) from public;
revoke all on function public.seedee_totals() from public;
revoke all on function public.seedee_paths() from public;
grant execute on function public.seedee_cast(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.seedee_totals() to anon, authenticated;
grant execute on function public.seedee_paths() to anon, authenticated;
revoke all on function public.seedee_state() from public;
revoke all on function public.seedee_admin(text, boolean, boolean, text) from public;
grant execute on function public.seedee_state() to anon, authenticated;
grant execute on function public.seedee_admin(text, boolean, boolean, text) to anon, authenticated;

-- Your view of the results (run in the SQL editor, or use the Table editor and its CSV export):
--   select name, case_key, answer, comment, updated_at from seedee_votes order by name, case_key;
