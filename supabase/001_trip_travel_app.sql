-- Applied to the Supabase project "oneteam-vote" (gxyckkinlygeasruapmj) as migration trip_travel_app.
-- Kept here as a record; re-running it on the same project will fail because the objects already exist.

create table public.trip_trips (id uuid primary key default gen_random_uuid(), name text not null default '도쿄 태교여행', invite_code text not null unique, created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table public.trip_members (trip_id uuid not null references public.trip_trips(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, display_name text not null, color text not null default '#5a6fe3', joined_at timestamptz not null default now(), primary key (trip_id, user_id));
create index trip_members_user_idx on public.trip_members(user_id);
create table public.trip_items (trip_id uuid not null references public.trip_trips(id) on delete cascade, kind text not null, id text not null, data jsonb not null default '{}'::jsonb, deleted boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null, server_ts timestamptz not null default now(), primary key (trip_id, kind, id));
create index trip_items_sync_idx on public.trip_items(trip_id, server_ts);
create or replace function public.trip_touch() returns trigger language plpgsql set search_path = '' as $$ begin new.server_ts := now(); return new; end $$;
create trigger trip_items_touch before insert or update on public.trip_items for each row execute function public.trip_touch();
create or replace function public.trip_is_member(t uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.trip_members m where m.trip_id = t and m.user_id = (select auth.uid())); $$;
alter table public.trip_trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_items enable row level security;
create policy "members read trip" on public.trip_trips for select to authenticated using (public.trip_is_member(id));
create policy "members read members" on public.trip_members for select to authenticated using (public.trip_is_member(trip_id));
create policy "member updates own profile" on public.trip_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members read items" on public.trip_items for select to authenticated using (public.trip_is_member(trip_id));
create policy "members insert items" on public.trip_items for insert to authenticated with check (public.trip_is_member(trip_id));
create policy "members update items" on public.trip_items for update to authenticated using (public.trip_is_member(trip_id)) with check (public.trip_is_member(trip_id));
-- trip_create(p_name, p_display_name, p_color) and trip_join(p_code, p_display_name, p_color): security definer RPCs, see the applied migration
-- storage bucket "trip-files" (private, 15 MB per file) with member-only policies via public.trip_file_ok(name)
alter publication supabase_realtime add table public.trip_items;
