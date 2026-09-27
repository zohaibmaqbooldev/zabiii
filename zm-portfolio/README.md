# Zohaib Maqbool — Portfolio + CMS

A fast, custom-designed personal portfolio with a full admin dashboard, built with
**React 19 + TypeScript** and your existing **Supabase** project (database, auth, storage).

- Public site: `/` (single page) and `/projects/<slug>` (project detail pages)
- Admin: `/admin/login` → `/admin/dashboard`

Everything visitors see — profile, projects, skills, education, certificates, social links and
images — comes from Supabase and is editable in the admin. Nothing needs code changes.

---

## 1. One-time Supabase setup (≈ 3 minutes)

1. **Create your admin login** — Supabase Dashboard → *Authentication → Users → Add user*
   → email `zohaibmaqbool313@gmail.com`, choose a strong password, tick *Auto Confirm User*.
2. **Run the setup SQL** — *SQL Editor → New query* → paste all of `supabase/setup.sql` → *Run*.
   - Adds the few missing columns to your existing tables (nothing is dropped),
     creates `admin_users`, locks down Row Level Security (public = read-only,
     only your account can write), secures the `portfolio-images` bucket and
     inserts the starter content into empty tables only.
   - Safe to run again at any time.
3. (Recommended) *Authentication → Sign In / Providers* → turn **off** “Allow new users to sign up”.
   Even if someone signs up, they get no access: only accounts listed in `admin_users` can edit.
4. *Authentication → URL Configuration*: set **Site URL** to your live address and add
   `https://your-domain/admin/reset-password` and `https://your-domain/admin/login` to **Redirect URLs**
   so “Forgot password” and “Change email” links come back to the site.

The last query in the file lists the policies so you can see that visitors can only `SELECT`.
Admin → **Settings → Security check** re-verifies this from the browser at any time.

## 2. Configure & build

```bash
cp .env.example .env          # already filled in for your project in .env.production
npm install
npm run build                 # → dist/
npm run dev                   # local dev server on http://localhost:5173
```

`.env` needs only the **public** values (never the service_role key — the build refuses it):

```
VITE_SUPABASE_URL=https://fectstagqsocxqlecqbb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
SITE_URL=https://your-domain.com
```

## 3. Deploy

`dist/` is a static site. Any static host works:

- **Netlify**: drag the `dist` folder onto app.netlify.com/drop (the `_redirects` file handles routes).
- **Vercel**: import the folder; build command `npm run build`, output `dist` (`vercel.json` included).
- **Cloudflare Pages / GitHub Pages**: output `dist`; `404.html` is generated for client-side routes.

Set `SITE_URL` to the final address and rebuild so social-preview tags point to it.

## Admin guide

| Area | What you can do |
| --- | --- |
| Projects | Add, edit, duplicate, delete (with confirmation), publish/hide, feature/unfeature, reorder, upload/replace image, technologies, category, GitHub & Live links (buttons hide when empty) |
| Skills | Add/edit/delete, category, proficiency 1–5 (optional), show/hide, reorder |
| Education / Certificates / Social Links | Add/edit/delete, show/hide, reorder; certificate images |
| Profile | Name, title, headline, bio, About text, contact details, WhatsApp (enables the floating button), GitHub/LinkedIn/website, profile photo, About photo, logo |
| Media | Everything in `portfolio-images`: upload, preview, replace everywhere it's used, delete when unused, “use as profile photo / logo”, and copy the four provided images into storage |
| Experience | Add/edit/delete, publish/hide, reorder (company, position, dates, technologies, company URL). The public Experience section appears only once a visible entry exists |
| Contact Info | Email, phone, location and the WhatsApp number used by the floating button (default +923456300129) |
| Settings | Account details (email, status, last login), change password (asks for the current one), change email (Supabase confirmation), session info, logout / log out everywhere, live security check |
| Sign-in | `/admin/login`, “Forgot password?” → `/admin/forgot-password` → email link → `/admin/reset-password` |

Images are resized and converted to WebP in the browser before upload (large + small
rendition for responsive loading). Replaced or deleted images are removed from storage
only when nothing else still uses them.

The contact form does not send email from a server: it opens the visitor's email app with
the message pre-filled (a real email backend can be added later).

## Project structure

```
src/
  lib/          supabase client (auth, REST, storage), data API, router, image processing
  components/   shared UI: SmartImage (responsive + fallback), dialogs, toasts, icons
  site/         public sections (Hero, About, Skills, Projects, Education, Certificates, Contact…)
  admin/        CMS screens (Projects, ProjectForm, Skills, Education, Certificates, Profile, Media, Settings)
  styles/       base (tokens), site, admin (loaded only on /admin)
supabase/setup.sql   schema + RLS + storage policies + starter data
test/                local Supabase-compatible test harness and the end-to-end test suite
```
