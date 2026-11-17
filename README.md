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

## Not yet built

- Accounts and sync between devices (everything is stored in the browser on each device for now).
- Browser extension, RSS, newsletters, PDFs, offline app shell, and the Kokoro voice.

## Where things live

- `lib/store.ts` is the only file that reads or writes saved data. Cloud sync goes behind it.
- `lib/text.ts` holds the word and sentence model shared by the reader, RSVP and listening.
- `app/api/extract/route.ts` fetches a page and reduces it to plain text blocks.
