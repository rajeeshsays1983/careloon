This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Data storage

Application records are persisted as JSON files in the `data/` directory, with a separate file per dataset:

- `data/patients.json`
- `data/team-members.json`
- `data/staff-reports.json`
- `data/chat-messages.json`

The files are created automatically with `[]` if missing. Server Actions in `src/app/actions.ts` read and update them; the browser keeps a mirrored client store so pages stay responsive.

### Hosting on Vercel

Vercel's serverless filesystem is read-only, so the app switches to **Vercel Blob** automatically whenever `BLOB_READ_WRITE_TOKEN` is set (locally it keeps using the JSON files).

1. In the Vercel dashboard, open your project → **Storage** → **Create Database** → **Blob**, and create a **private** store.
2. Vercel automatically adds `BLOB_READ_WRITE_TOKEN` to the project's environment variables. (If you use the Blob CLI instead, copy the token into Vercel → Settings → Environment Variables.)
3. Import the GitHub repository into Vercel and deploy — no build command overrides are needed.

On first access, the bundled `data/*.json` files seed the Blob store; from then on Blob is the source of truth. Media uploads are also written to Blob and served through `/api/uploads`, so existing attachment URLs keep working. See `.env.example` for the local variable name.

Because Blob has no cross-instance locking, concurrent writes from multiple serverless instances are last-write-wins. This is fine for a demo; use a database if you need strict consistency.

PMR Doctors are on the care team by default and appear in the Team roster as the team lead. Duty Doctors need Team In before health care staff can be assigned to them. When a patient is approved in Patient onboarding, the approver must assign a Duty Doctor or health care staff member from the Team; that assignment is stored on the patient record and shown in the patient list and Treatment channels.

## Treatment visibility

The signed-in team member determines what is shown in Treatment and the review dashboard:

- Health care staff see only their own treatment updates and reports.
- A Duty Doctor sees their own updates plus those from health care staff assigned to them in Team onboarding.
- PMR Doctors and Admin see all team members' activity.

Nobody can review their own report. Staff must be assigned to a Duty Doctor who is in Team before their updates appear in that Duty Doctor's view.

A treatment recorded by the PMR Doctor is approved by default, so it does not sit in Awaiting review with nobody eligible to approve it. Editing that treatment keeps it approved.

When a PMR Doctor requests changes, the report stays visible to the author with the reviewer's note. The staff member can add an acknowledgement note on the report card; the acknowledgement and timestamp are saved with the report. Staff can also choose **Edit care record & add media** to correct the treatment note and add or remove pictures, videos and audio on that report, then resubmit it for review. A new review decision clears the previous acknowledgement.

## Assessment media

Health care staff can attach pictures, videos and audio to treatment updates in the Treatment section. Files are uploaded through `src/app/api/uploads/route.ts` — stored in `data/uploads/` locally (git-ignored) or in Vercel Blob when deployed; the JSON records keep only the attachment metadata and URL. The same media is carried into the doctor review dashboard when an update is logged as a report. Files are limited to 100 MB each.

## Sign-in

The built-in admin account:

- Username: `Admin`
- Password: `Admin@123`

Approved care team members (staff, Duty Doctors and PMR Doctors) can also sign in:

- Username: the `username` field if set (PMR Doctor uses `PMRDoctor`), otherwise the email or full name from `data/team-members.json` (for example `vaibhavi` or `vaibhavi@careloon.local`)
- Shared demo password: `Careloon@123`

The credentials are defined in `src/lib/auth.ts` and shown on the login page. The session is stored locally in the browser; the signed-in member determines which treatment reports and dashboard they can see.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
