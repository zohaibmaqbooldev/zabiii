-- =====================================================================
-- Zohaib Maqbool — Portfolio CMS : database setup for the EXISTING project
-- =====================================================================
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query.
--
-- It is safe to run on a project that already has tables/data:
--   • tables are only created if they don't exist
--   • missing columns are added; existing columns and rows are never dropped
--   • starter rows are only inserted into EMPTY tables
--   • it is re-runnable (idempotent)
--
-- It DOES replace the row-level-security policies on the six portfolio
-- tables, on purpose: any older "allow everyone" policy would otherwise stay
-- active next to the new ones (Postgres ORs policies together) and let
-- anonymous visitors edit your data.
--
-- Column names follow the tables that already exist in this project
-- (profiles.name / profile_image / github, projects.image, certificates.image …).
-- =====================================================================

-- The account that may edit the portfolio (must exist under Authentication → Users)
select set_config('zm.admin_email', 'zohaibmaqbool313@gmail.com', false);

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Admin allow-list  (only these auth users can edit anything)
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- shared updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tables (create if missing, then add any missing columns)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (id uuid primary key default gen_random_uuid());
alter table public.profiles
  add column if not exists name           text,
  add column if not exists title          text,
  add column if not exists headline       text,
  add column if not exists bio            text,
  add column if not exists about          text,
  add column if not exists profile_image  text,
  add column if not exists about_image_url text,
  add column if not exists logo_url       text,
  add column if not exists email          text,
  add column if not exists phone          text,
  add column if not exists whatsapp       text,
  add column if not exists location       text,
  add column if not exists github         text,
  add column if not exists linkedin       text,
  add column if not exists website        text,
  add column if not exists education_label text,
  add column if not exists focus          text,
  add column if not exists goal           text,
  add column if not exists created_at     timestamptz default now(),
  add column if not exists updated_at     timestamptz default now();

create table if not exists public.projects (id uuid primary key default gen_random_uuid());
alter table public.projects
  add column if not exists title             text,
  add column if not exists slug              text,
  add column if not exists short_description text,
  add column if not exists full_description  text,
  add column if not exists image             text,
  add column if not exists image_path        text,
  add column if not exists technologies      text[] default '{}'::text[],
  add column if not exists category          text,
  add column if not exists github_url        text,
  add column if not exists live_url          text,
  add column if not exists featured          boolean default false,
  add column if not exists published         boolean default true,
  add column if not exists display_order     integer default 0,
  add column if not exists created_at        timestamptz default now(),
  add column if not exists updated_at        timestamptz default now();

create table if not exists public.skills (id uuid primary key default gen_random_uuid());
alter table public.skills
  add column if not exists name          text,
  add column if not exists category      text,
  add column if not exists proficiency   smallint,          -- 1..5, null = not rated
  add column if not exists icon          text,
  add column if not exists display_order integer default 0,
  add column if not exists visible       boolean default true,
  add column if not exists created_at    timestamptz default now(),
  add column if not exists updated_at    timestamptz default now();

create table if not exists public.education (id uuid primary key default gen_random_uuid());
alter table public.education
  add column if not exists degree        text,
  add column if not exists institution   text,
  add column if not exists field         text,
  add column if not exists location      text,
  add column if not exists start_date    text,             -- free text: "2024", "Sep 2024"
  add column if not exists end_date      text,
  add column if not exists is_current    boolean default false,
  add column if not exists description   text,
  add column if not exists display_order integer default 0,
  add column if not exists visible       boolean default true,
  add column if not exists created_at    timestamptz default now(),
  add column if not exists updated_at    timestamptz default now();

create table if not exists public.certificates (id uuid primary key default gen_random_uuid());
alter table public.certificates
  add column if not exists title          text,
  add column if not exists issuer         text,
  add column if not exists issue_date     text,
  add column if not exists image          text,
  add column if not exists image_path     text,
  add column if not exists credential_url text,
  add column if not exists display_order  integer default 0,
  add column if not exists visible        boolean default true,
  add column if not exists created_at     timestamptz default now(),
  add column if not exists updated_at     timestamptz default now();

create table if not exists public.social_links (id uuid primary key default gen_random_uuid());
alter table public.social_links
  add column if not exists platform      text,
  add column if not exists url           text,
  add column if not exists icon          text,
  add column if not exists display_order integer default 0,
  add column if not exists visible       boolean default true,
  add column if not exists created_at    timestamptz default now(),
  add column if not exists updated_at    timestamptz default now();

-- Work / experience (new table — the project didn't have one)
create table if not exists public.experience (id uuid primary key default gen_random_uuid());
alter table public.experience
  add column if not exists company       text,
  add column if not exists position      text,
  add column if not exists location      text,
  add column if not exists start_date    text,
  add column if not exists end_date      text,
  add column if not exists is_current    boolean default false,
  add column if not exists description   text,
  add column if not exists technologies  text[] default '{}'::text[],
  add column if not exists company_url   text,
  add column if not exists display_order integer default 0,
  add column if not exists visible       boolean default true,
  add column if not exists created_at    timestamptz default now(),
  add column if not exists updated_at    timestamptz default now();

-- make sure ids get generated even on pre-existing tables
do $$
declare t text;
begin
  foreach t in array array['profiles','projects','skills','education','certificates','social_links','experience'] loop
    begin
      execute format('alter table public.%I alter column id set default gen_random_uuid()', t);
    exception when others then
      raise notice 'Could not set id default on %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- unique slugs (skipped with a notice if existing data has duplicates)
do $$
begin
  create unique index if not exists projects_slug_key on public.projects (slug);
exception when others then
  raise notice 'projects.slug unique index not created: %', sqlerrm;
end $$;

create index if not exists projects_public_idx on public.projects (published, display_order);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','projects','skills','education','certificates','social_links','experience'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Row Level Security — public READ ONLY, admin full CRUD
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['profiles','projects','skills','education','certificates','social_links','experience','admin_users'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- public read (only published / visible content)
create policy "public read profile"   on public.profiles     for select to anon, authenticated using (true);
create policy "public read projects"  on public.projects     for select to anon, authenticated using (published is true);
create policy "public read skills"    on public.skills       for select to anon, authenticated using (visible is not false);
create policy "public read education" on public.education    for select to anon, authenticated using (visible is not false);
create policy "public read certs"     on public.certificates for select to anon, authenticated using (visible is not false);
create policy "public read socials"   on public.social_links for select to anon, authenticated using (visible is not false);
create policy "public read experience" on public.experience  for select to anon, authenticated using (visible is not false);

-- admin: everything (including hidden/unpublished rows)
do $$
declare t text;
begin
  foreach t in array array['profiles','projects','skills','education','certificates','social_links','experience'] loop
    execute format('create policy "admin all" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- a signed-in user may see whether they themselves are an admin
create policy "read own admin row" on public.admin_users for select to authenticated using (user_id = auth.uid());

-- table privileges (RLS still applies on top of these)
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.projects, public.skills, public.education,
               public.certificates, public.social_links, public.experience to anon;
grant select, insert, update, delete on public.profiles, public.projects, public.skills, public.education,
               public.certificates, public.social_links, public.experience to authenticated;
grant select on public.admin_users to authenticated;
revoke insert, update, delete on public.profiles, public.projects, public.skills, public.education,
               public.certificates, public.social_links, public.experience, public.admin_users from anon;

-- ---------------------------------------------------------------------
-- 4. Storage — bucket "portfolio-images": public read, admin write
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portfolio-images', 'portfolio-images', true)
on conflict (id) do nothing;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,  -- 5 MB
       allowed_mime_types = array['image/webp','image/jpeg','image/png','image/avif','image/gif']
 where id = 'portfolio-images';

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual,'') ilike '%portfolio-images%' or coalesce(with_check,'') ilike '%portfolio-images%')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "portfolio images: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'portfolio-images');
create policy "portfolio images: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'portfolio-images' and public.is_admin());
create policy "portfolio images: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'portfolio-images' and public.is_admin())
  with check (bucket_id = 'portfolio-images' and public.is_admin());
create policy "portfolio images: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'portfolio-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Starter content — only inserted into EMPTY tables. Nothing invented:
--    no URLs, no certificates, no ratings, no institution names.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.profiles) then
    begin
      -- id = the admin's auth id, so this also works when profiles.id references auth.users
      insert into public.profiles (id, name, title, headline, bio, about, location, education_label, focus, goal, whatsapp)
      values (
        coalesce((select id from auth.users where lower(email) = lower(current_setting('zm.admin_email'))), gen_random_uuid()),
        'Zohaib Maqbool',
        'BS Computer Science Student',
        'BS Computer Science Student & Aspiring Software Developer',
        'I''m a Computer Science student focused on building modern digital experiences, learning real-world software development, and turning ideas into useful products.',
        'Zohaib Maqbool is a BS Computer Science student developing practical skills in software development, web technologies, Python and modern digital products.',
        'Pakistan',
        'BS Computer Science',
        'Software Development',
        'Software Developer / Technology Entrepreneur',
        '+923456300129'
      );
    exception when others then
      -- e.g. profiles.id references auth.users: the admin panel creates the row on first save instead
      raise notice 'Starter profile not inserted (%). Fill it in from Admin → Profile.', sqlerrm;
    end;
  end if;

  -- default WhatsApp number for the floating button (editable in Admin → Contact)
  update public.profiles set whatsapp = '+923456300129' where coalesce(trim(whatsapp), '') = '';

  if not exists (select 1 from public.projects) then
    begin
      insert into public.projects (title, slug, short_description, full_description, image, technologies, category, featured, published, display_order)
      values
      ('Student Management System', 'student-management-system',
       'A C++ based student management application designed to manage student records through a simple and efficient interface.',
       'A C++ based student management application designed to manage student records through a simple and efficient interface.',
       '/images/project-dashboard-1376.webp', array['C++'], 'Programming', true, true, 1),
      ('Modern Portfolio Website', 'modern-portfolio-website',
       'A responsive personal portfolio website focused on presenting projects, technical skills, education and professional information.',
       'A responsive personal portfolio website focused on presenting projects, technical skills, education and professional information.',
       '/images/project-ai-workspace-1376.webp', array['HTML','CSS','JavaScript'], 'Web Development', true, true, 2);
    exception when others then
      raise notice 'Starter projects not inserted: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from public.skills) then
    begin
      insert into public.skills (name, category, display_order) values
        ('C++','Programming',1), ('Python','Programming',2), ('JavaScript','Programming',3), ('TypeScript','Programming',4),
        ('HTML','Web Development',5), ('CSS','Web Development',6), ('React','Web Development',7), ('Tailwind CSS','Web Development',8),
        ('Supabase','Database',9), ('Database','Database',10),
        ('Git','Tools',11), ('GitHub','Tools',12), ('VS Code','Tools',13),
        ('AI','AI / ML',14), ('Problem Solving','Other',15);
    exception when others then
      raise notice 'Starter skills not inserted: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from public.education) then
    begin
      insert into public.education (degree, field, is_current, display_order)
      values ('BS Computer Science', 'Computer Science', true, 1);
    exception when others then
      raise notice 'Starter education not inserted: %', sqlerrm;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Make your account the admin (email set at the top of this file)
--    (create the user first: Authentication → Users → Add user)
-- ---------------------------------------------------------------------
do $$
declare
  admin_email text := current_setting('zm.admin_email');
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(admin_email);
  if uid is null then
    raise notice 'No auth user with email % yet — create it, then re-run this file.', admin_email;
  else
    insert into public.admin_users (user_id) values (uid) on conflict do nothing;
    raise notice 'Admin access granted to %', admin_email;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Check: every row here should say anon can only SELECT
-- ---------------------------------------------------------------------
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles','projects','skills','education','certificates','social_links','experience','admin_users')
 order by tablename, cmd;
