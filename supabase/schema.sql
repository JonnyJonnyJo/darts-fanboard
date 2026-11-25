-- =====================================================================
--  Darts-WM 2026/27 – Tippspiel
--  Einmal komplett im Supabase SQL Editor ausführen (Projekt > SQL Editor > New query).
-- =====================================================================

-- ---------- Tabellen ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null unique check (char_length(display_name) between 2 and 24),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.matches (
  id        bigint generated always as identity primary key,
  round     text not null,
  starts_at timestamptz not null,
  player1   text not null,
  player2   text not null,
  best_of   int not null check (best_of in (5,7,9,11,13)),
  sets1     int check (sets1 >= 0),
  sets2     int check (sets2 >= 0)
);

-- Schlüssel für den automatischen Abgleich aus data/matches.json (z. B. WM27-R1-001)
alter table public.matches add column if not exists ext_key text unique;

create table if not exists public.match_tips (
  user_id    uuid   not null references public.profiles on delete cascade,
  match_id   bigint not null references public.matches  on delete cascade,
  sets1      int not null check (sets1 >= 0),
  sets2      int not null check (sets2 >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create table if not exists public.bonus_questions (
  id       bigint generated always as identity primary key,
  sort     int  not null default 0,
  question text not null,
  points   int  not null default 5 check (points between 0 and 100),
  kind     text not null default 'text' check (kind in ('text','number','select')),
  options  jsonb,
  locks_at timestamptz not null,
  answer   text               -- richtige Antwort(en), mehrere mit | trennen: "Luke Littler|Littler"
);

create table if not exists public.bonus_tips (
  user_id     uuid   not null references public.profiles        on delete cascade,
  question_id bigint not null references public.bonus_questions on delete cascade,
  value       text   not null check (char_length(value) between 1 and 60),
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ---------- Hilfsfunktionen ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.match_open(mid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select now() < starts_at from public.matches where id = mid), false)
$$;

create or replace function public.question_open(qid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select now() < locks_at from public.bonus_questions where id = qid), false)
$$;

-- Satzergebnis prüfen: genau einer muss die nötigen Sätze haben
create or replace function public.check_match_tip() returns trigger
language plpgsql set search_path = public as $$
declare need int;
begin
  select (best_of + 1) / 2 into need from public.matches where id = new.match_id;
  if need is null or not ((new.sets1 = need and new.sets2 < need) or (new.sets2 = need and new.sets1 < need)) then
    raise exception 'Ungültiges Satzergebnis';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_check_match_tip on public.match_tips;
create trigger trg_check_match_tip before insert or update on public.match_tips
  for each row execute function public.check_match_tip();

create or replace function public.touch_bonus_tip() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_touch_bonus_tip on public.bonus_tips;
create trigger trg_touch_bonus_tip before insert or update on public.bonus_tips
  for each row execute function public.touch_bonus_tip();

-- ---------- Rechte & Row Level Security ----------
alter table public.profiles        enable row level security;
alter table public.matches         enable row level security;
alter table public.match_tips      enable row level security;
alter table public.bonus_questions enable row level security;
alter table public.bonus_tips      enable row level security;

-- Niemand darf sich selbst zum Admin machen: nur id + Name sind beschreibbar
revoke insert, update on public.profiles from anon, authenticated;
grant  insert (id, display_name) on public.profiles to authenticated;
grant  update (display_name)     on public.profiles to authenticated;

drop policy if exists p_profiles_read  on public.profiles;
drop policy if exists p_profiles_ins   on public.profiles;
drop policy if exists p_profiles_upd   on public.profiles;
create policy p_profiles_read on public.profiles for select using (true);
create policy p_profiles_ins  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy p_profiles_upd  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_matches_read  on public.matches;
drop policy if exists p_matches_admin on public.matches;
create policy p_matches_read  on public.matches for select using (true);
create policy p_matches_admin on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_q_read  on public.bonus_questions;
drop policy if exists p_q_admin on public.bonus_questions;
create policy p_q_read  on public.bonus_questions for select using (true);
create policy p_q_admin on public.bonus_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Eigene Tipps immer sichtbar, fremde erst nach Anwurf (kein Abschreiben)
drop policy if exists p_mt_read on public.match_tips;
drop policy if exists p_mt_ins  on public.match_tips;
drop policy if exists p_mt_upd  on public.match_tips;
drop policy if exists p_mt_del  on public.match_tips;
create policy p_mt_read on public.match_tips for select using (user_id = auth.uid() or not public.match_open(match_id));
create policy p_mt_ins  on public.match_tips for insert to authenticated with check (user_id = auth.uid() and public.match_open(match_id));
create policy p_mt_upd  on public.match_tips for update to authenticated using (user_id = auth.uid() and public.match_open(match_id)) with check (user_id = auth.uid() and public.match_open(match_id));
create policy p_mt_del  on public.match_tips for delete to authenticated using (user_id = auth.uid() and public.match_open(match_id));

drop policy if exists p_bt_read on public.bonus_tips;
drop policy if exists p_bt_ins  on public.bonus_tips;
drop policy if exists p_bt_upd  on public.bonus_tips;
drop policy if exists p_bt_del  on public.bonus_tips;
create policy p_bt_read on public.bonus_tips for select using (user_id = auth.uid() or not public.question_open(question_id));
create policy p_bt_ins  on public.bonus_tips for insert to authenticated with check (user_id = auth.uid() and public.question_open(question_id));
create policy p_bt_upd  on public.bonus_tips for update to authenticated using (user_id = auth.uid() and public.question_open(question_id)) with check (user_id = auth.uid() and public.question_open(question_id));
create policy p_bt_del  on public.bonus_tips for delete to authenticated using (user_id = auth.uid() and public.question_open(question_id));

-- ---------- Rangliste ----------
-- Spiel-Tipp: exaktes Satzergebnis 4 Punkte, richtiger Sieger 2 Punkte.
-- Bonusfrage: volle Punktzahl der Frage bei richtiger Antwort.
create or replace function public.leaderboard()
returns table (rank int, display_name text, points int, exact_hits int, winner_hits int, bonus_points int, tips int)
language sql stable security definer set search_path = public as $$
  with mt as (
    select t.user_id,
      (m.sets1 is not null and t.sets1 = m.sets1 and t.sets2 = m.sets2) as ex,
      (m.sets1 is not null and sign(t.sets1 - t.sets2) = sign(m.sets1 - m.sets2)) as win
    from public.match_tips t join public.matches m on m.id = t.match_id
  ), bt as (
    select b.user_id,
      case when q.answer is not null and lower(trim(b.value)) = any (
        select lower(trim(x)) from unnest(string_to_array(q.answer, '|')) x
      ) then q.points else 0 end as pts
    from public.bonus_tips b join public.bonus_questions q on q.id = b.question_id
  ), agg as (
    select p.id, p.display_name,
      coalesce((select sum(case when ex then 4 when win then 2 else 0 end) from mt where mt.user_id = p.id), 0)::int as match_pts,
      coalesce((select count(*) filter (where ex)  from mt where mt.user_id = p.id), 0)::int as exact_hits,
      coalesce((select count(*) filter (where win) from mt where mt.user_id = p.id), 0)::int as winner_hits,
      coalesce((select sum(pts) from bt where bt.user_id = p.id), 0)::int as bonus_points,
      ((select count(*) from mt where mt.user_id = p.id) + (select count(*) from bt where bt.user_id = p.id))::int as tips
    from public.profiles p
  )
  select (rank() over (order by match_pts + bonus_points desc, exact_hits desc))::int,
         display_name, match_pts + bonus_points, exact_hits, winner_hits, bonus_points, tips
  from agg
  order by 1, display_name
$$;
grant execute on function public.leaderboard() to anon, authenticated;

-- ---------- News (für die Startseite, gepflegt über admin.html) ----------
create table if not exists public.news (
  id           bigint generated always as identity primary key,
  published_at date not null default current_date,
  tag          text not null default 'News' check (char_length(tag) <= 40),
  title        text not null check (char_length(title) between 3 and 140),
  teaser       text not null check (char_length(teaser) between 3 and 600),
  url          text check (url is null or url ~* '^https?://'),
  source       text check (char_length(source) <= 60),
  is_top       boolean not null default false
);
alter table public.news enable row level security;
drop policy if exists p_news_read  on public.news;
drop policy if exists p_news_admin on public.news;
create policy p_news_read  on public.news for select using (true);
create policy p_news_admin on public.news for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Bonusfragen (Tippschluss: Turnierstart 11.12.2026, 20:00 Uhr) ----------
insert into public.bonus_questions (sort, question, points, kind, options, locks_at)
select * from (values
  (1, 'Wer wird Weltmeister?', 10, 'text', null::jsonb, '2026-12-11 20:00+01'::timestamptz),
  (2, 'Wer wird Vize-Weltmeister?', 6, 'text', null, '2026-12-11 20:00+01'),
  (3, 'Wie weit kommt Titelverteidiger Luke Littler?', 5, 'select',
      '["1. Runde","2. Runde","3. Runde","Achtelfinale","Viertelfinale","Halbfinale","Finale","Weltmeister"]', '2026-12-11 20:00+01'),
  (4, 'Wie weit kommt der beste deutsche Spieler?', 5, 'select',
      '["1. Runde","2. Runde","3. Runde","Achtelfinale","Viertelfinale","Halbfinale","Finale","Weltmeister"]', '2026-12-11 20:00+01'),
  (5, 'Wie viele 9-Darter fallen im ganzen Turnier?', 5, 'number', null, '2026-12-11 20:00+01')
) v
where not exists (select 1 from public.bonus_questions);
