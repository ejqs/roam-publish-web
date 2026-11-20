# Tutorial videos

The clips on `/tutorials` (`public/tutorials/{id}.mp4`, `.webm` and a `.jpg` poster of the last frame) are recorded
by these scripts, so they can be recorded again when the UI changes. They're silent and show a pointer.

- **In Roam** (`clips.mjs`): the real built extension in a Roam-like page (`index.html`, `harness.js`) with a fake
  `roamAlphaAPI` and a fake roam.pub. Clips: `publish`, `visibility`, `status`, `pdf`, `collections`.
- **On roam.pub** (`webclips.mjs`): the site running locally with seeded data. Clips: `password`, `setup` (setup
  ends in the Roam-like page, pasting the key).

Each clip is a CDP screencast at 960×540, scale 2, encoded to 1920×1080 H.264 with ffmpeg (`rec.mjs`).

## Running them

1. In this folder: `npm i --no-save @blueprintjs/core@3.54.0 @blueprintjs/icons@3.33.0 @fontsource/inter@5.0.18`,
   then copy in the extension: in roam-publish, `npm run build`, copy `extension.js` here, and bundle
   `npx esbuild src/serialize.ts --bundle --format=esm --outfile=<here>/hasher.js`. Serve this folder:
   `python3 -m http.server 8766`.
2. For the roam.pub clips: Postgres on 5433 with `bun run db:migrate`; in `.env.local` set
   `BETTER_AUTH_SECRET=test-secret-test-secret-test-secret-1234` (the test preload's, so seeded cookies work),
   `ROAM_APPEND_API=http://127.0.0.1:4555` and `JOBS=off`; run `python3 append-standin.py` (accepts the graph
   check); `bun run dev`. Seed once: `TEST_DATABASE_URL=$DATABASE_URL bun test ./scripts/tutorial-videos/seed.ts`.
   Before each `setup` recording: `sh reseed.sh`.
3. `node clips.mjs publish visibility status pdf collections` and `node webclips.mjs password setup`
   (`PLAYWRIGHT=` points at Playwright if it isn't installed here). Then make the WebM copies and posters:

   ```sh
   cd public/tutorials
   for f in *.mp4; do ffmpeg -y -i $f -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 -an ${f%.mp4}.webm; done
   for f in *.jpg; do ffmpeg -y -i $f -vf scale=960:-1 -q:v 3 $f.tmp.jpg && mv $f.tmp.jpg $f; done
   ```

A new clip: add a function to `clips.mjs` or `webclips.mjs`, record it, and set `video: true` on its entry in
`src/lib/tutorials.ts`. If the extension starts a new request, add its route to `harness.js`.
