-- ============================================================
--  LottoLens — Full Database Schema
--  Run this entire script in the Supabase SQL Editor once.
--  Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================

-- ─── 1. Lucky Day Lotto draws ─────────────────────────────
create table if not exists public.draws (
  draw_number integer primary key,
  n1 integer not null check (n1 between 1 and 45),
  n2 integer not null check (n2 between 1 and 45),
  n3 integer not null check (n3 between 1 and 45),
  n4 integer not null check (n4 between 1 and 45),
  n5 integer not null check (n5 between 1 and 45),
  draw_date date,
  created_at timestamptz not null default now(),
  constraint draws_unique_numbers check (
    n1 <> n2 and n1 <> n3 and n1 <> n4 and n1 <> n5 and
    n2 <> n3 and n2 <> n4 and n2 <> n5 and
    n3 <> n4 and n3 <> n5 and
    n4 <> n5
  )
);

create index if not exists idx_draws_date on public.draws(draw_date desc);

alter table public.draws enable row level security;

create policy if not exists "draws_read_all"
  on public.draws for select using (true);

create policy if not exists "draws_insert_all"
  on public.draws for insert with check (true);

create policy if not exists "draws_update_all"
  on public.draws for update using (true) with check (true);


-- ─── 2. Powerball draws ───────────────────────────────────
create table if not exists public.pb_draws (
  draw_number integer primary key,
  n1 integer not null check (n1 between 1 and 69),
  n2 integer not null check (n2 between 1 and 69),
  n3 integer not null check (n3 between 1 and 69),
  n4 integer not null check (n4 between 1 and 69),
  n5 integer not null check (n5 between 1 and 69),
  pb integer not null check (pb between 1 and 26),
  draw_date date,
  created_at timestamptz not null default now(),
  constraint pb_draws_unique_numbers check (
    n1 <> n2 and n1 <> n3 and n1 <> n4 and n1 <> n5 and
    n2 <> n3 and n2 <> n4 and n2 <> n5 and
    n3 <> n4 and n3 <> n5 and
    n4 <> n5
  )
);

create index if not exists idx_pb_draws_date on public.pb_draws(draw_date desc);

alter table public.pb_draws enable row level security;

create policy if not exists "pb_draws_read_all"
  on public.pb_draws for select using (true);

create policy if not exists "pb_draws_insert_all"
  on public.pb_draws for insert with check (true);

create policy if not exists "pb_draws_update_all"
  on public.pb_draws for update using (true) with check (true);


-- ─── 3. Mega Millions draws ───────────────────────────────
create table if not exists public.mm_draws (
  draw_number integer primary key,
  n1 integer not null check (n1 between 1 and 70),
  n2 integer not null check (n2 between 1 and 70),
  n3 integer not null check (n3 between 1 and 70),
  n4 integer not null check (n4 between 1 and 70),
  n5 integer not null check (n5 between 1 and 70),
  mb integer not null check (mb between 1 and 25),
  draw_date date,
  created_at timestamptz not null default now(),
  constraint mm_draws_unique_numbers check (
    n1 <> n2 and n1 <> n3 and n1 <> n4 and n1 <> n5 and
    n2 <> n3 and n2 <> n4 and n2 <> n5 and
    n3 <> n4 and n3 <> n5 and
    n4 <> n5
  )
);

create index if not exists idx_mm_draws_date on public.mm_draws(draw_date desc);

alter table public.mm_draws enable row level security;

create policy if not exists "mm_draws_read_all"
  on public.mm_draws for select using (true);

create policy if not exists "mm_draws_insert_all"
  on public.mm_draws for insert with check (true);

create policy if not exists "mm_draws_update_all"
  on public.mm_draws for update using (true) with check (true);
