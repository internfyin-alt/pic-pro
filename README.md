# PIC PRO VIDEOGRAPHY — Next.js Website

Premium multi-page wedding photography website based on your requested design, using the uploaded original orange/white PIC PRO logo.

## AI photo-sharing platform

Start with [SETUP.md](SETUP.md) for the platform migration, AWS setup, admin bootstrap, scheduled worker, and verification. `/admin` is now platform administration. The original inquiry panel is at `/studio-inquiries`. The website instructions below describe the retained studio pages.

## Requirements
- Windows 10/11, macOS or Linux
- Node.js **20.9 or newer** (Node 22 recommended)
- Internet access for installing dependencies and loading the sample Unsplash wedding imagery
- VS Code (optional)

## Extract and run on Windows

1. Download `PIC_PRO_VIDEOGRAPHY_NEXTJS.zip`.
2. Right-click ZIP > **Extract All**. Extract to `C:\Users\YourName\Desktop\PIC_PRO_VIDEOGRAPHY` (or another directory).
3. Open the extracted **pic-pro-videography** folder in VS Code (**File > Open Folder**).
4. Open the VS Code terminal (**Terminal > New Terminal**).
5. Run:

```powershell
npm install
npm run dev
```

6. Open **http://localhost:3000** in your browser.
7. To stop the server, press `Ctrl + C`.

## Pages
- `/` — cinematic homepage
- `/about` — studio story
- `/services` — service overview
- `/services/[slug]` — nine individual service pages
- `/portfolio` — category-filtered gallery + full-screen lightbox
- `/wedding-films` — film showcase (demo stills)
- `/packages` — sample inquiry collections, no invented prices
- `/blog` — journal and three starter articles
- `/contact` — contact CTA
- `/book-now` — booking inquiry form
- `/admin` — Supabase-authenticated inquiry dashboard
- `/privacy`, `/terms` — starter legal copy to review

## Your logo
The exact uploaded logo is copied to `public/images/pic-pro-logo.png`. It appears in the header, footer and site favicon. Replace that file if you want an updated version.

## IMPORTANT: Demo pictures and film thumbnails
Wedding visuals are **external Unsplash sample images**, NOT PIC PRO client work. Images need internet access, and third-party URLs may eventually change. Replace them with your own authorized portfolio photos before launching. Update `src/lib/data.ts` and relevant page hero images. No videos are provided: the Wedding Films page explicitly shows placeholders until you add your licensed wedding films.

## Configure WhatsApp, Instagram and domain
Copy `.env.example` to `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SITE_URL` — live site URL when deployed
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — digits only, with country code, e.g. `91...`, no plus sign (leave blank if unknown)
- `NEXT_PUBLIC_INSTAGRAM_URL` — your verified Instagram profile URL (leave blank if unknown)

Restart the dev server after changing `.env.local`.

## Enable real booking inquiries and admin login (Supabase)
The public pages run **without** Supabase, but inquiry submissions return a clear setup message until configured.

1. Create a Supabase project in your own account.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. In Supabase > Project Settings > API / API Keys copy your project URL, public anon key, and secret service-role key.
4. Add these to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
ADMIN_EMAILS=admin@yourdomain.com
```

5. In Supabase Authentication > Users, create an admin user with the email listed in `ADMIN_EMAILS`. The dashboard does **not** automatically authorize every signed-in user.
6. Restart `npm run dev`.
7. Visit `/admin`, log in and review inquiries, update statuses or export CSV.
8. Test a real inquiry at `/book-now`.

**Security notes:** Never commit `.env.local`. The private inquiry table has RLS enabled with no public policies. Server-side submissions use a service-role key after validation. The in-memory rate limiter is a starting safeguard, not adequate across many serverless instances; add production-grade shared rate limiting and CAPTCHA before accepting public traffic at scale. The admin interface in this starter covers inquiries; full gallery/media/package/blog CMS and automatic email notifications require additional implementation.

## Production build

```powershell
npm run typecheck
npm run build
npm run start
```

## Deploy to Vercel
1. Push this directory to a **private or public GitHub repository** (do not include secrets).
2. Import repository in Vercel; framework should detect Next.js.
3. Set environment variables in Vercel project settings.
4. Deploy, add your own domain and set `NEXT_PUBLIC_SITE_URL` to that domain.
5. Test the booking form, auth, navigation and images on the actual domain.

## Customization
- Colors, layout: `src/app/globals.css` (logo uses orange, so the accent is warm orange-gold).
- Services, packages, portfolio images, blog articles: `src/lib/data.ts`.
- Homepage: `src/app/page.tsx`.
- Nav/footer: `src/components/Site.tsx`.
- Booking form: `src/components/BookingForm.tsx`.
- Booking API: `src/app/api/inquiries/route.ts`.

## Limits and pre-launch checklist
This is a substantial frontend website + Supabase-powered inquiry workflow starter, **not** a fully completed proprietary studio CMS. Before production: upload real licensed photos and videos, verify all offered services and package terms, provide real contact info, configure Supabase, add a persistent rate limiter, review privacy and booking policies, test mobile and accessibility, and test `npm run build` with installed dependencies.
