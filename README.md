# The Button Story

A standalone, text-only novella edition of **The Button** for mobile reading and GitHub Pages.

## Files

- `index.html`
- `style.css`
- `app.js`
- `story.js`
- `manifest.webmanifest`
- `service-worker.js`

The reader does not depend on React, Vite, the existing game runtime, or any root-relative paths.

## Hidden Ending Timer

The hidden `Found` ending wait is configured for production in one place near the top of `app.js`:

```js
const FOUND_ENDING_WAIT_SECONDS = 90;
```

## GitHub Pages

Deploy this folder as static files. It works from repository subpaths such as:

```text
https://username.github.io/repository-name/The-Button-Story/
```

All app references use `./` relative paths, including the manifest, service worker, scripts, and styles.

## iPhone Install

1. Open the deployed GitHub Pages URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Launch from the home screen once online; after the first load, the service worker caches the reader for offline use.

## Local Test

From this repository root:

```powershell
python -m http.server 4173
```

Then open:

```text
http://localhost:4173/The-Button-Story/
```
