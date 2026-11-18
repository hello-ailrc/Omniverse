# Omniverse

A personal read-it-later app: save articles, mark them with a colour code, speed-read with RSVP, and listen.

## Run locally

    npm install
    npm run dev

Then open http://localhost:3000.

## What is in this version

- Save an article by link (server-side extraction) or by pasting text.
- Reader with four themes plus a custom theme, text size, and saved reading position.
- Mark bar (left edge on tablet and laptop, bottom edge on phone): five colours, underline or highlight, reference flag, pen mode, notes, copy, delete.
- Notebook grouped by tag, with one-tap copy of all marks as Markdown.
- Tap a mark for a pop-up: recolour, grow or shrink it word by word, flag, note, copy, delete.
- Highlights section in the library: every mark across all articles, with search and filters, each opening its article at that spot.
- RSVP with a context strip, focus letter, sentence and 10-word seek, speed and words-at-a-time controls, "mark this sentence", and an optional voice that reads along.
- Listening with the device's built-in voices, a Now Reading panel (sentence or RSVP view), sentence and 5-second seek, speed and voice controls.

## Sync between devices

Articles, marks, notes, flags and reading position sync through Supabase. Each device keeps a full copy and works offline; changes are sent when it is back online, and the most recent change wins. Appearance settings stay per device.

Setup, once:

1. In Supabase, run `supabase/schema.sql` in the SQL Editor.
2. In Supabase, set Authentication > URL Configuration > Site URL to the app's address.
3. In Vercel, add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the names shown in Supabase's Connect dialog for Next.js also work: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), then redeploy.
4. In the app, tap Sign in in the library, create an account, confirm the email, and sign in on each device.
5. In Supabase, turn off new sign-ups so nobody else can create an account.

Without the environment variables the app works as before, on one device only.

## Not yet built

- Browser extension, RSS, newsletters, PDFs, offline app shell, and the Kokoro voice.

## Where things live

- `lib/store.ts` is the only file that reads or writes saved data on the device, and keeps the outbox of changes to send.
- `lib/sync.ts` sends the outbox to Supabase, brings in changes from other devices, and handles sign-in.
- `supabase/schema.sql` creates the tables, per-user access rules and the newest-change-wins rule.
- `lib/text.ts` holds the word and sentence model shared by the reader, RSVP and listening.
- `app/api/extract/route.ts` fetches a page and reduces it to plain text blocks.
