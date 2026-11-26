# Boogie Board

Phone-first web app for running a 96×16 iPixel LED screen: build playlists of pictures and text,
send them over Bluetooth, and let the screen keep looping them on its own.

## How it works

- **Playlists** are stored on each phone. Playing one converts every item into a panel-safe GIF
  (or native text) in the browser, stores it in one of the screen's 100 slots, then tells the screen which
  slots to loop. Items already in a slot are not re-sent, so switching playlists is often instant.
- **Library** pictures and **saved texts** live on the server and are shared by everyone.
- **Offline**: the app installs like an app (Android Chrome / desktop "Install app") and keeps working with no or
  slow signal. A service worker (`public/sw.js`) saves the app and every library picture; if the network takes
  longer than 2.5 s the saved copy is used. Uploading, saving texts and deleting need signal.
- **Bluetooth** uses Web Bluetooth: Chrome/Edge on Android or desktop, or the Bluefy browser on iPhone. It needs HTTPS
  (or `localhost`).

Protocol notes (reverse engineered from the iPixel Color app and confirmed on the panel) are in
`../docs/rea-findings.md`, and the code in `lib/ipixel/`.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (the service worker only runs in production builds)
```

## Configuration

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Admin mode (tap the title 5 times) unlocks deleting pictures, folders and saved texts. **Set this for any deployment**; without it a built-in default is used. |
| `STORAGE_PATH` | Root folder for `data/` and `uploads/` (Docker: `/app/persistent`, a mounted volume). Defaults to `./data` and `./public/uploads`. |
| `PORT` | Server port (Docker uses 8080). |

## Deploying (Railway, Docker)

The image never touches existing data on the volume: on start it copies only *missing* uploads from the image,
and only seeds `db.json` if the volume has none (or an empty one). Saved texts (`text-library.json`) are created on
the volume the first time someone saves.

## Scripts

```bash
npm test             # protocol, text library, GIF encoder and playlist tests (node --test)
npx tsc --noEmit     # type check
npm run lint
npm run build
```

## Layout

- `app/`: page, server actions (`actions.ts`, `textLibraryActions.ts`), `/uploads/[filename]` route
- `components/app/`: shell, screen bar, library/offline providers
- `components/playlists/`, `components/library/`, `components/text/`: the three sections
- `components/led/LedMatrix.tsx`: dot-matrix previews
- `lib/ipixel/`: panel protocol, GIF encoder, colour reduction, image/text rasterising
- `lib/playlist/`: playlist model, slot planning, local storage, playback engine
- `lib/webBluetooth.ts`: Bluetooth connection and transfers
