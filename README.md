# WARDEN

Unofficial live tower-code board for WARDOGS.

Repo: https://github.com/nottherealtar/warden

## Run locally

```bash
git clone https://github.com/nottherealtar/warden.git
cd warden
npm install
npm start
```

Open http://localhost:8787

Map terrain plates (`maps/*-z2.jpg`) are not in git yet. Copy them from the project zip into `maps/` if you want the overhead imagery. Without them the board still runs: grid, towers, codes, pins.

## Host as a PWA (Vercel)

1. [vercel.com/new](https://vercel.com/new) → Import `nottherealtar/warden`
2. Framework: Other. Build command empty. Output: `.`
3. Deploy. Open the HTTPS URL on your phone → Add to Home Screen.

Vercel serves the UI. Cross-device rooms need `npm start` (WebSocket) on a box that stays up.

## Use

- NEW ROOM — share the six-character code or `#CODE` URL
- Tap a strip cell to enter a digit
- PIN then tap the map
- CALL posts a one-line order
- Paste a screenshot of the in-game map to trace the zone

Not affiliated with Bulkhead or Team17. Map coordinates: 1 unit = 100 m.
