# Jhimai Express: Dhaka Metro Line 6

An endless browser experience: a six-car Line 6 train crossing a procedurally generated, isometric, grey Dhaka. Only the train has colour. Recreates the structure of `~/Downloads/train of thought.mp4`.

## Rules from the owner
- No stops or stations. The train runs forever. No film output.
- Everything except the train is neutral grey, people included.
- No on-screen controls. Mouse only: wheel zooms, hover names a coach (it does not open it), click opens a coach and zooms in, a click on empty space inside the open coach goes back to the default view, left-drag turns the camera within limits.
- Thought and name cards lie in the coach's plane, as in the film, with soft corners.
- Empty plots are walled (brick or plaster) and gated; playing fields get a low wall and a grille.
- Prefer downloaded assets with a licence that allows it, then adapt them. Credit them in `public/credits.txt`.
- Thoughts only ever happen inside the metro, right now: the smell of the man beside you, a seat about to free up, forgotten headphones, a nap. Everyday Dhaka talk, never musings on life. Women think women's lines and men men's, and a line must suit how they are riding (seated, standing, on a phone).
- The operator's cabin opens apart from the women's coach.
- Commit locally. Push only when the owner asks: `main` on `nadidazwad/jhimai-express` deploys to Vercel.

## Map
- `src/main.ts`: wiring, camera aim, mouse, idle tour, adaptive quality.
- `src/world/`: chunked generation in workers (`generate.ts`, `stream.ts`); `plan.ts` places side streets, signals and foot bridges as a pure function of seed and chunk, shared with the traffic; buildings, `shopfront.ts`, street, `pavement.ts` (footpath clutter), `lot.ts` (walled plots), viaduct, landmarks, nature.
- `src/train/`: `layout.ts` holds every measurement; `geometry.ts` (detail built lazily), `train.ts`, `riders.ts` (passengers who sway, glance and walk the aisle, and click picking).
- `src/traffic/`: `flow.ts` simulates the road (car following, lane changes, signals, crossers), `traffic.ts` draws it. `src/thoughts/`: `corpus.ts` (the lines), `roster.ts`.
- `src/render/`: sun shadows (`shadow.ts`: the city in a map pinned to the line, moving things in one redrawn each frame), a colour plus geometry buffer pass with per-surface weathering, then an ink and haze composite, then thin parts as antialiased ribbons in a line pass. Detail finer than a pixel belongs in the shader or the line pass, or it flickers.
- `src/assets/`: loads baked `public/people` and `public/props`. `src/ui/`: thought bubbles and labels.
- `tools/`: `bake-people.mjs`, `garments.mjs` (clothes lofted round each pose's skeleton), `bake-props.mjs`, `props.config.json`. `tools/dev/`: `shot.mjs`, `sheet.mjs`, `perf.mjs` (UNCAPPED=1 for GPU-bound timing), `film.mjs` (real-GPU frames for motion), `flicker.mjs` (scores shimmer, with a focus region), `walk-sheet.mjs`, `inspect-glb.mjs`.
- `asset-src/` (gitignored, about 800 MB): downloaded source models.

## Run
- `pnpm dev` serves on 127.0.0.1:5180. `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Rebake: `node tools/bake-props.mjs tools/props.config.json public/props`; `node tools/bake-people.mjs asset-src/rocketbox public/people`.
- Dev URL params: `seed at az el w fx fy fz pr msaa notour freeze hold shadow gputime noweather`. `window.__metro` exists in dev only.
