# Football Coach AI

A responsive football coaching SaaS workspace built with Next.js 15, Supabase and Gemini.

## Included
- Supabase email sign-up/sign-in and player workspace
- Private video storage with user-scoped access
- Gemini AI football coaching chat
- Short-clip AI video analysis with structured reports
- Saved analysis history and training guidance
- Responsive dashboard for Android, tablet and desktop

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `GEMINI_API_KEY` (server-side only; required for AI features)

Install using `npm install`; run locally using `npm run dev`.

## Video-analysis limits
The first synchronous analysis flow accepts MP4, MOV or WebM clips up to 15 MB. Production-scale longer videos require asynchronous processing, retries and job monitoring. AI feedback is an estimate from visible footage, not a certified coaching assessment.
