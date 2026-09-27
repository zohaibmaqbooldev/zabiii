-- Minimal stand-in for the parts of a Supabase project that setup.sql touches.
create role anon nologin;
create role authenticated nologin;
create role authenticator login password 'auth' noinherit;
grant anon, authenticated to authenticator;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
-- the pre-existing bucket the user mentioned
insert into storage.buckets (id,name,public) values ('portfolio-images','portfolio-images',false);
-- Mirror of the tables that already exist in the real project (columns probed via the REST API)
create table public.profiles (id uuid primary key default gen_random_uuid(), name text, title text, bio text, profile_image text, email text, phone text, whatsapp text, location text, github text, linkedin text, website text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.projects (id uuid primary key default gen_random_uuid(), title text, short_description text, full_description text, image text, technologies text[], category text, github_url text, live_url text, featured boolean default false, display_order integer default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.skills (id uuid primary key default gen_random_uuid(), name text, category text, proficiency integer, icon text, display_order integer default 0, created_at timestamptz default now());
create table public.education (id uuid primary key default gen_random_uuid(), degree text, institution text, field text, start_date text, end_date text, description text, display_order integer default 0, created_at timestamptz default now());
create table public.certificates (id uuid primary key default gen_random_uuid(), title text, issuer text, issue_date text, image text, display_order integer default 0, created_at timestamptz default now());
create table public.social_links (id uuid primary key default gen_random_uuid(), platform text, url text, icon text, display_order integer default 0, created_at timestamptz default now());
-- an over-permissive legacy policy like many tutorials create; setup.sql must neutralise it
alter table public.projects enable row level security;
create policy "Enable all for everyone" on public.projects for all using (true) with check (true);
grant all on all tables in schema public to anon, authenticated;
