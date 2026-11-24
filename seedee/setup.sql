-- O.E. SeeDee poll: storage for herr.net/seedee/
-- Run in the Supabase SQL editor, then put the project URL and public key in config.js.
-- Safe to run again after an update: it keeps existing votes.
--
-- The public (anon key) can only call the three functions below: cast a vote, read totals,
-- read answer patterns. Names and comments are readable only from the Supabase dashboard
-- (Table editor > seedee_votes), which requires your own login.

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
create or replace function public.seedee_paths()
returns table (path text, n bigint)
language sql stable security definer set search_path = public as $$
  select s.path, count(*) from (
    select p.voter, string_agg(coalesce(left(v.answer, 1), '-'), '' order by c.ord) as path
    from (select distinct voter from seedee_votes) p
    cross join (values ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('D2', 5)) as c(k, ord)
    left join seedee_votes v on v.voter = p.voter and v.case_key = c.k
    group by p.voter
  ) s group by s.path;
$$;

revoke all on function public.seedee_cast(uuid, text, text, text, text) from public;
revoke all on function public.seedee_totals() from public;
revoke all on function public.seedee_paths() from public;
grant execute on function public.seedee_cast(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.seedee_totals() to anon, authenticated;
grant execute on function public.seedee_paths() to anon, authenticated;

-- Your view of the results (run in the SQL editor, or use the Table editor and its CSV export):
--   select name, case_key, answer, comment, updated_at from seedee_votes order by name, case_key;
