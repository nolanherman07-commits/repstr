-- REPSTR cloud accounts: tables and access rules for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste all of it -> Run.
-- It is safe to run again (it only creates what is missing and re-applies the rules).
--
-- What is stored:
--   files         one row per signed-in user per "kind": their REPSTR data ('app'), a firm's portal ('cpa'),
--                 and a firm's working copy of each client ('c_<client id>').
--   client_files  the file a client sends to a CPA firm. Written by the client, readable by that firm.
--   reviews       the review / sign-off a firm sends back. Written by the firm, readable by that client.
-- Every table has row-level security: a row can only be read or changed by the people named on it.

create table if not exists public.files (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind ~ '^(app|cpa|c_[a-z0-9]{6,24})$'),
  ts         bigint      not null default 0,
  data       text        not null check (length(data) <= 8000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create table if not exists public.client_files (
  client_id  uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  firm_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        check (length(name) <= 200),
  email      text        check (length(email) <= 200),
  ts         bigint      not null default 0,
  payload    text        not null check (length(payload) <= 8000000),
  docs       text        check (length(docs) <= 6000000),
  docs_ts    bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (client_id, firm_id)
);
create index if not exists client_files_firm on public.client_files (firm_id);

create table if not exists public.reviews (
  firm_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid        not null references auth.users (id) on delete cascade,
  ts         bigint      not null default 0,
  payload    text        not null check (length(payload) <= 2000000),
  updated_at timestamptz not null default now(),
  primary key (firm_id, client_id)
);
create index if not exists reviews_client on public.reviews (client_id);

-- keep updated_at current
create or replace function public.repstr_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists files_touch on public.files;
create trigger files_touch before update on public.files for each row execute function public.repstr_touch();
drop trigger if exists client_files_touch on public.client_files;
create trigger client_files_touch before update on public.client_files for each row execute function public.repstr_touch();
drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews for each row execute function public.repstr_touch();

-- a firm keeps at most 2,000 client working copies; stops one login from filling the database
create or replace function public.repstr_file_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.files where user_id = new.user_id) >= 2002 then
    raise exception 'too many files for this account' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists files_cap on public.files;
create trigger files_cap before insert on public.files for each row execute function public.repstr_file_cap();

-- row-level security
alter table public.files        enable row level security;
alter table public.client_files enable row level security;
alter table public.reviews      enable row level security;

-- files: only the owner
drop policy if exists files_own on public.files;
create policy files_own on public.files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- client_files: the client writes; the client and the firm read; either can remove it
drop policy if exists client_files_read on public.client_files;
create policy client_files_read on public.client_files for select to authenticated
  using (client_id = (select auth.uid()) or firm_id = (select auth.uid()));
drop policy if exists client_files_insert on public.client_files;
create policy client_files_insert on public.client_files for insert to authenticated
  with check (client_id = (select auth.uid()) and firm_id <> (select auth.uid()));
drop policy if exists client_files_update on public.client_files;
create policy client_files_update on public.client_files for update to authenticated
  using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));
drop policy if exists client_files_delete on public.client_files;
create policy client_files_delete on public.client_files for delete to authenticated
  using (client_id = (select auth.uid()) or firm_id = (select auth.uid()));

-- reviews: the firm writes, and only to a client who has sent that firm a file; both read; either can remove it
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated
  using (firm_id = (select auth.uid()) or client_id = (select auth.uid()));
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated
  with check (firm_id = (select auth.uid()) and exists (
    select 1 from public.client_files cf where cf.client_id = reviews.client_id and cf.firm_id = (select auth.uid())));
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update to authenticated
  using (firm_id = (select auth.uid()))
  with check (firm_id = (select auth.uid()) and exists (
    select 1 from public.client_files cf where cf.client_id = reviews.client_id and cf.firm_id = (select auth.uid())));
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete to authenticated
  using (firm_id = (select auth.uid()) or client_id = (select auth.uid()));

-- signed-in users only; visitors without an account get nothing
revoke all on public.files, public.client_files, public.reviews from anon;
grant select, insert, update, delete on public.files, public.client_files, public.reviews to authenticated;
