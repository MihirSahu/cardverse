# Cardverse

Cardverse is a visual browser for popular US consumer credit cards. The interface follows the approved Editorial Observatory Paper designs: a restrained landing page leads into a bounded, star-filled card canvas with predefined filters and focused card education.

## Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app uses the editorial catalog without a CardAPI key. The optional refresh command is documented below.

## Card data and refreshes

The editorial launch catalog ranks 53 U.S. consumer cards. Cardverse pages read normalized snapshots from a local SQLite database through Drizzle ORM; page views never call CardAPI. Without a populated database, the app remains usable with the complete issuer-reviewed editorial catalog. Every curated card has an issuer-hosted artwork URL, with a local placeholder used if an image fails to load.

To enable refreshes, copy `.env.example` to `.env.local` and provide:

```bash
CARDAPI_API_KEY=your_key
```

Apply the checked-in migrations and request a snapshot manually:

```bash
npm run db:migrate
npm run cards:refresh
npm run cards:list
```

The refresh worker pages through CardAPI's US catalog with a default page size of 100, retrieves full details for matched editorial entries, and atomically replaces the normalized snapshots and provider-availability suppressions. At read time, stored provider payloads are merged with the current per-card editorial records, so cards without a CardAPI mapping remain visible and editorial corrections do not wait for another provider refresh. Mapped cards reported missing, unavailable, or unusable stay suppressed until a later successful refresh. The refresh log reports these states and pending artwork. Its default maximum is 30 API requests per run, including list pages and detail lookups. A failed refresh preserves the entire previously successful state and is recorded in `refresh_runs`.

When the Next.js Node server starts, its local scheduler checks whether the last successful refresh is at least 24 hours old. Failed attempts back off for six hours. These values, the startup delay, page size, request cap, database path, and scheduler toggle can be configured through the variables documented in `.env.example`.

The in-process scheduler is intended for a single local Node server. When the database moves to shared hosting, replace it with one external cron worker or add a distributed refresh lease so multiple app instances cannot refresh simultaneously.

The API key is used only by the server-side refresh worker; it is never exposed to the browser or used during page rendering.

### Drizzle files

- `lib/db/schema.ts` defines snapshots, provider-availability suppressions, and refresh history.
- `drizzle/` contains versioned SQL migrations.
- `data/cardverse.db` is the ignored local SQLite database.
- `npm run db:generate` creates a migration after schema changes.
- `npm run db:migrate` applies pending migrations.

## Checks

```bash
npm run typecheck
npm run test:card-cache
npm run build
```

## Interaction

- Drag, scroll, swipe, or use the arrow keys to move around the bounded canvas.
- Use the zoom controls, plus/minus keys, or Control/Command plus scroll to zoom.
- Use the predefined filters to narrow the field without entering personal information.
- Select a card to open its educational panel.
- Drag the selected card or use the arrow keys to rotate its 3D model; double-click or press Home to reset it.
