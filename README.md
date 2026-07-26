# 🌸 Flower Bloom — Hand Gesture Control

Control a whole field of growing, blooming flowers with your fingertips using your webcam.

- **Right hand pinch** (thumb + index finger) → controls **growth** (stem height)
- **Left hand pinch** → controls **bloom** (how open the petals are)
- **Sway your hands side to side** → creates a wind effect that bends the stem and flower head

If the camera is unavailable or permission is denied, it automatically falls back to mouse/touch control (drag horizontally for growth, vertically for bloom).

## How it works

- **Hand tracking**: [MediaPipe Hands](https://developers.google.com/mediapipe) (loaded from CDN, no build step needed) detects up to two hands and their 21 landmarks each frame.
- **Pinch detection**: the distance between the thumb tip and index fingertip is measured and normalized against the palm size, so it works whether your hand is close to or far from the camera.
- **Rendering**: everything is drawn on an HTML5 `<canvas>` — no external art assets, no game engine. A field of 16–30 flowers is generated (count scales with screen width), each with its own depth (near/far), size, hue tint, sway phase, and growth/bloom delay, so the field fills in gradually and swishes non-uniformly in the wind rather than moving in lockstep. Each stem is a bezier curve, petals are gradient-filled ellipses arranged radially, and pollen particles drift upward from the larger foreground flowers once they're fully bloomed.

## Project structure

```
flower-bloom/
├── index.html   # page structure, loads MediaPipe from CDN
├── style.css    # layout + small camera preview styling
├── script.js    # hand tracking + canvas flower rendering
└── README.md
```

No build tools, no `npm install`, no bundler required — it's plain HTML/CSS/JS.

## Run locally

Because the camera API requires a secure context, just double-clicking `index.html` may not work in every browser. Serve it locally instead:

```bash
cd flower-bloom
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages

1. Create a new repo (or reuse an existing one) and push these files to it:
   ```bash
   git init
   git add .
   git commit -m "Flower Bloom"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose the `main` branch and `/ (root)` folder, then **Save**.
4. Your site will be live at:
   `https://<your-username>.github.io/<repo-name>/`

## Deploy on Vercel

1. Push the project to a GitHub repo (steps above).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: choose **Other** (it's a static site, no build command needed).
4. Leave the build command empty and the output directory as `./`.
5. Click **Deploy** — you'll get a live URL in under a minute.

You can also deploy straight from the CLI:
```bash
npm i -g vercel
cd flower-bloom
vercel
```

## Notes & tuning

- Camera access requires **HTTPS** (GitHub Pages and Vercel both provide this automatically). It will **not** work over plain `http://` except on `localhost`.
- All tunable constants live near the top of `script.js` (`BASE_PETAL_COUNT`, `MAX_STEM_HEIGHT_RATIO`, the flower `count` formula inside `generateFlowers`, pinch sensitivity in `pinchStrength`, wind sensitivity in `handleHandResults`) — tweak freely. To force more/fewer flowers regardless of screen size, edit the `Math.max(16, Math.min(30, ...))` line in `generateFlowers`.
- Works on mobile too, using the front-facing camera, though hand tracking performance depends on the device.
