# Sound assets

Drop short UI sound effects here. They are served from the site root, so a file
at `public/sounds/copy-success.mp3` is reachable at `/sounds/copy-success.mp3`.

- **copy-success.mp3** — played when "Copy owner details" succeeds
  (see `playCopySuccess()` in `src/lib/sounds.ts`).

If a file is missing, the app falls back to the built-in Web Audio synth chime,
so the UI always has audible feedback even before an asset is added.
