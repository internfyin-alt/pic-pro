# PICPRO VIDEOGRAPHY platform setup

The application runs locally in this existing Next.js project. Accounts, storage, and matching require your Supabase project and AWS account. No credentials or default administrator passwords are included. This is not deployed or certified production-ready merely by passing a build.

## 1. Environment and database

Use Node.js 22 or newer. In PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
```

Fill `.env.local` with your project URL, public anon key, service-role key, site URL, AWS region, AWS credentials (or an IAM runtime role), and a random `CRON_SECRET`. Never paste secret keys into chat or commit them. The site URL must be the actual HTTPS origin for deployed QR codes, and `http://localhost:3000` during development.

In Supabase SQL Editor, run `supabase/schema.sql`, then `supabase/platform.sql`, once in that order. `platform.sql` is an initial migration, not an idempotent script. Back up the database before applying migrations. All new tables have RLS enabled and no browser-access policies; the server uses the service role after checking authentication and ownership. The `event-photos` bucket is private. Do not add public bucket policies.

In Supabase Authentication, configure your Site URL and allow `/auth` as a redirect URL on your trusted domain. Enable email confirmation and configure production SMTP. Set the password policy to at least 12 characters. Browser sign-in and password reset use Supabase Auth.

## 2. Create your first administrator

Open `/auth`, create your account, and confirm your email. Then run this SQL with your own address:

```sql
update public.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Roles cannot be assigned through signup metadata. `/admin` and `/platform-admin` are the platform admin. `/dashboard` is the photographer studio. `/studio-inquiries` preserves the original booking-inquiry panel, which separately uses `ADMIN_EMAILS`. Guests enter through `/e/<random-event-slug>`.

For invite-only operation disable sign-ups in Supabase Auth as well as in the application settings. The application setting alone cannot disable Supabase's public signup endpoint. Suspension is checked on every platform request, and guest access checks the event owner's suspension.

## 3. Amazon Rekognition

Choose a region supporting Rekognition Image and make sure your credentials belong to that region/account. Server-side AWS SDK credentials support environment variables, session tokens, and runtime IAM roles. The application creates one collection named `picpro-<event UUID>` per event.

Apply an IAM policy like this, replacing REGION and ACCOUNT_ID:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rekognition:CreateCollection", "rekognition:DeleteCollection", "rekognition:IndexFaces", "rekognition:SearchFacesByImage", "rekognition:DeleteFaces"],
      "Resource": "arn:aws:rekognition:REGION:ACCOUNT_ID:collection/picpro-*"
    },
    {"Effect": "Allow", "Action": "rekognition:DetectFaces", "Resource": "*"}
  ]
}
```

Original images are uploaded directly to private Supabase Storage using signed upload tokens; application servers do not handle the original upload body. Only JPEG/PNG up to 25 MB are accepted. Sharp auto-rotates and resizes an image before passing JPEG bytes to Rekognition. Originals remain unchanged. At most 100 faces per photograph are indexed. No-face images are marked ready with zero faces. Matching requires exactly one face and uses a 97% similarity threshold; this is not proof of identity. Rekognition returns at most 4,096 matching faces per search, so particularly large collections can require a different search strategy.

Review AWS's service/data-use terms and applicable account opt-out policies before using real biometric data. Our application does not persist guest selfies. Rekognition stores event face vectors until deletion. Set provider data handling and region according to your business requirements; do not interpret the application privacy notice as a guarantee of AWS retention behavior.

## 4. Durable processing and cleanup

New uploads reserve a database row atomically, upload directly to Storage, and become `queued` only after server confirmation of object size. The dashboard automatically starts processing after a batch. A database function claims work with `FOR UPDATE SKIP LOCKED`; processing survives closing the browser when the scheduled worker runs. Stale processing locks are eligible for retry after five minutes, up to five claims. Failed images can be retried explicitly from the dashboard.

Deploy to a Node.js host with Sharp support (for example Vercel or a container), with a 60-second request budget and an external scheduler. Every minute send an HTTPS POST to:

```text
POST https://YOUR_DOMAIN/api/platform/jobs
Authorization: Bearer YOUR_CRON_SECRET
```

Use your scheduler's secure secret configuration rather than putting the token in a public URL. Each call handles up to three photos and removes expired sessions, expired rate limits, and abandoned upload records older than three hours. Schedule must continue running even with no browser open. Database rate limits are durable, but configure a trusted ingress that overwrites `X-Forwarded-For` and applies request body limits (5 MB guest matching, 64 KB JSON), connection throttling, and provider budgets. An untrusted forwarding header can weaken IP-based limits.

Published events may have an access code and expiry. Expiry or unpublishing immediately prevents new guest access but does not delete event images/vectors. Photographer deletion removes storage objects and face vectors before deleting records. A deletion interrupted by a service error is left resumable; retry deletion. Wait for in-flight processing before deleting. Configure database backups and separately define your business retention/deletion schedule.

Guest sessions use hashed, random tokens in HttpOnly, SameSite=Strict cookies. They expire after one hour and can be deleted early. Preview links expire after 60 seconds and refresh while the page is open. Already-issued signed URLs may remain valid until their short expiry; downloaded files cannot be revoked. Disabling downloads removes the supported download endpoints/buttons; previews can still be saved by a viewer, so this is not DRM.

## 5. Run and verify

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

Use HTTPS on real phones for a secure camera experience. The mobile capture control invokes the system camera/file picker; desktop browsers may offer a file picker. ZIP downloads are split into ten-photo batches to limit browser memory usage. Refresh results before downloading if a session expires.

Before public launch, verify against your real services:

1. Register two photographers; verify that neither can read or change the other's event or photos, even with copied IDs.
2. Upload real consented sample photos, including a no-face image and invalid image. Verify ready/failed states, original downloads, retry, and recovery after interrupting processing.
3. Scan a QR from a phone; test correct/incorrect access codes, explicit consent, multi-face selfie rejection, matching accuracy, no matches, selection, individual downloads, and ZIP batches.
4. Test session deletion/expiry, unpublishing, gallery expiry, downloads disabled, account suspension, and event/photo deletion in both Supabase and Rekognition.
5. Verify scheduled processing and cleanup with the browser closed, unauthorized worker rejection, and provider failure recovery.
6. Test email confirmation/reset using the deployed domain, browser accessibility, mobile layouts, load/cost limits, backup restoration, and audit logs.

Replace editorial sample images with licensed brand photography. Set verified business/privacy contacts and approved notices before collecting real biometric data. Billing/plans are not enabled; payment collection and subscription enforcement are not included. Provider-cost accounting uses AWS billing; dashboard counts record successful application operations only. The automated tests mock external services and cannot replace live integration validation.
