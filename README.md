# Cardverse

Cardverse is a visual browser for popular US consumer credit cards. The interface follows the approved Editorial Observatory Paper designs: a restrained landing page leads into a seamless, star-filled card canvas with predefined filters and focused card education.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## CardAPI

The editorial launch catalog ranks 28 popular cards. With CardAPI configured, the app requests current full details for each published entry and isolates individual provider failures. Without a key, it remains usable with nine issuer-verified fallback cards and issuer-hosted artwork. To enable CardAPI, copy `.env.example` to `.env.local` and provide:

```bash
CARDAPI_API_KEY=your_key
```

The API key is used only by CardAPI's official server-side client in `lib/cardapi.ts`; it is never exposed to the browser or sent to a caller-configurable origin.

## Checks

```bash
npm run typecheck
npm run build
```

## Interaction

- Drag, scroll, swipe, or use the arrow keys to move around the repeating canvas.
- Use the predefined filters to narrow the field without entering personal information.
- Select a card to open its educational panel.
- Drag the selected card or use the arrow keys to rotate its 3D model; double-click or press Home to reset it.
