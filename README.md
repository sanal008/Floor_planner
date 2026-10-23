# Floor Planner — 3D Interior Design Studio

Turn a 2D floor-plan image into an interactive 3D building, then furnish it —
manually, on top of your live camera feed, or in AR on a phone.

Built with **React + Vite + three.js** on the front end, a **Flask / OpenCV**
vision pipeline on the back end, and a standalone **WebXR** app for AR.

---

## Demo

**[▶ Watch the walkthrough](https://github.com/sanal008/Floor_planner/raw/main/docs/floor-planner-demo.mp4)**
([file in repo](docs/floor-planner-demo.mp4) · MP4 · ~105 MB)

A screen recording of the app running end to end:

1. **Floor Plan → 3D** — the plan image is uploaded, the Flask/OpenCV pipeline
   returns walls, rooms, doors and windows as Building JSON, and the frontend
   extrudes it into a 3D building with real wall thickness, door swings and
   glazed windows. The debug overlay (detected walls in red, rooms in green,
   doors in cyan, windows in orange) shows what the detector found before the
   furniture is clicked into place on the generated floors.

2. **Custom Placement** — the empty room editor: furniture is dropped from the
   catalog, then dragged to move, rotated, scaled up/down and deleted; the
   floor and wall colours are changed and the camera is orbited, panned and
   tilted around the room.

> The video is stored with [Git LFS](https://git-lfs.com) because it exceeds
> GitHub's 100 MB per-file limit. Clones need `git lfs install` before
> cloning, or a `git lfs pull` afterwards, to fetch it.

---

## Modes

| Mode | Where | What it does |
| --- | --- | --- |
| **Custom Placement** | `furniture-planner` → *Custom Placement* | Empty room editor: drag, rotate, resize and recolor furniture and surfaces with orbit/pan/zoom controls. |
| **Real-time Camera Placement** | `furniture-planner` → *Real-time Camera Placement* | Opens your webcam and composites furniture onto the live video feed; move and rotate pieces with touch/mouse gestures. |
| **Floor Plan → 3D** | `furniture-planner` → *Floor Plan → 3D* | Upload a 2D plan, get walls, rooms, doors and windows reconstructed as 3D geometry — then place furniture inside it. |
| **Roomcast AR** | `roomcast/` | Standalone WebXR app: place furniture on real floors with hit-testing, reticle, and gesture controls. Also has a plain 3D room editor. |

---

## Repository layout

```
.
├── README.md
├── docs/
│   └── floor-planner-demo.mp4         # screen recording of the app (Git LFS)
├── sample_floorplan.png               # synthetic test plan (4 rooms, doors, windows)
├── sample_floorplan_hand_drawn.jpeg   # hand-drawn plans for pipeline testing
├── sample_floorplan_hand_drawn2.jpg
│
├── flask/                             # backend: floor-plan → Building JSON
│   ├── app.py                         # Flask app: static hosting + /api/floorplan
│   ├── requirements.txt
│   └── floorplan/
│       ├── pipeline.py                # end-to-end orchestration + debug overlay
│       ├── preprocess.py              # decode + binarize
│       ├── walls.py                   # wall detection, merging, junction snapping
│       ├── rooms.py                   # room detection (flood fill / labeling)
│       ├── openings.py                # door + window detection
│       ├── scale.py                   # pixels → meters
│       ├── model.py                   # assemble Building JSON
│       └── generate_sample.py         # regenerate the synthetic floor plan
│
├── furniture-planner/                 # frontend: React + Vite + three.js
│   ├── src/
│   │   ├── pages/                     # Home, CustomPlacement, RealtimePlacement, FloorPlan3D
│   │   ├── components/                # animated three.js background
│   │   └── lib/
│   │       ├── building.js            # Building JSON → three.js meshes
│   │       └── models.js              # furniture catalog + normalised loading
│   ├── models/                        # .glb furniture assets served by Flask
│   └── public/                        # static assets copied into dist/
│
└── roomcast/                          # standalone WebXR AR app (no build step)
    ├── index.html                     # mode picker
    ├── custom.html / ar.html          # room editor / AR placement
    ├── js/                            # catalog, model loader, scenes (+ vendored three.js)
    └── models/                        # drop your .glb files here
```

---

## Getting started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ (npm 9+)
- **Git LFS** — only for the demo video (`git lfs install`, then
  `git lfs pull` after cloning)
- A Chromium-based browser for the WebXR / camera modes

### 1. Backend (Flask + OpenCV)

```bash
cd flask
python -m venv .venv
.\.venv\Scripts\activate        # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python app.py                   # http://localhost:5000
```

### 2. Frontend (Vite dev server)

In a second terminal:

```bash
cd furniture-planner
npm install
npm run dev                     # http://localhost:5173  (proxies /api → :5000)
```

For production, build once and let Flask serve it:

```bash
cd furniture-planner
npm run build                   # outputs to furniture-planner/dist
```

Then run `python flask/app.py` and open **http://localhost:5000** — it serves
`furniture-planner/dist` plus the `.glb` assets in `furniture-planner/models`.

### 3. Roomcast (AR)

Roomcast is static files only — no install step:

```bash
cd roomcast
python -m http.server 8080       # http://localhost:8080
```

Opening `roomcast/*.html` over `file://` will not work (ES modules and
`fetch()` are blocked there). AR mode additionally needs **HTTPS or
`localhost`** and a WebXR-capable browser — in practice Chrome on an
ARCore-capable Android phone. See [`roomcast/README.md`](roomcast/README.md).

---

## API

### `POST /api/floorplan`

Request:

```json
{
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "meters_per_pixel": 0.05
}
```

- `image` — **required**, a base64 data URL (or raw base64) of the plan.
- `meters_per_pixel` — optional real-world scale. Defaults to `0.05`.

Response:

```json
{
  "model": {
    "scale": { "metersPerPixel": 0.05 },
    "walls":  [ { "x1": 0.0, "z1": 0.0, "x2": 4.2, "z2": 0.0, "thickness": 0.15 } ],
    "rooms":  [ { "name": "Room 1", "polygon": [[0,0],[4.2,0],[4.2,3.1]], "area": 13.0 } ],
    "doors":  [ { "wall": 0, "offset": 1.0, "width": 0.9, "kind": "door", "height": 2.1 } ],
    "windows":[ { "wall": 3, "offset": 2.0, "width": 1.2, "kind": "window", "height": 1.2, "sill": 0.9 } ]
  },
  "debug": "data:image/png;base64,...",
  "info":  { "walls": 9, "rooms": 4, "doors": 3, "windows": 4, "scaleSource": "user", "metersPerPixel": 0.05 }
}
```

- `model` — the Building JSON consumed by `src/lib/building.js`.
- `debug` — an overlay image: walls in red, rooms in green, doors in cyan,
  windows in orange. Handy for tuning detection.
- `info` — detection counters + which scale source was used.

Errors return `{ "error": "..." }` with `400` (bad input) or `500`.

### Run the pipeline standalone

```bash
cd flask
python -m floorplan.pipeline ../sample_floorplan.png 0.05
# writes ../sample_floorplan.png.debug.png and prints the JSON
```

Generate a fresh synthetic plan to test against:

```bash
cd flask
python -m floorplan.generate_sample ../sample_floorplan.png
```

---

## Furniture catalog

Each piece of furniture is one entry in `furniture-planner/src/lib/models.js`:

```js
{
  name: 'Sofa',
  file: '/models/sofa.glb',
  scale: 1,
  targetSize: 1.8,   // normalise the model's largest dimension to 1.8 m
  color: 0x8b5cf6,   // placeholder colour if the .glb is missing
  h: 0.25,           // raycast height for click-to-place
  build: () => new THREE.BoxGeometry(1.6, 0.5, 0.8),  // placeholder mesh
}
```

Drop `.glb` files into `furniture-planner/models/` using the filenames already
listed in the catalog. If a file is missing the app shows a coloured
placeholder box instead of crashing, so a typo is immediately visible.
`targetSize` normalises every model at load time, so assets from different
sources end up at a consistent real-world scale.

The same catalog drives `roomcast/js/catalog.js` (see
[`roomcast/README.md`](roomcast/README.md) for adding pieces there).

---

## How floor-plan detection works

1. **Preprocess** — decode the image, grayscale, adaptive binarize.
2. **Walls** — directional morphology to isolate wall strokes, extract thin
   rectangles, merge collinear segments, group into walls, compute junctions
   and snap endpoints, drop isolated fragments.
3. **Rooms** — rasterize the wall mask, flood-fill the exterior, label the
   enclosed regions; each label becomes a room polygon with an area.
4. **Openings** — scan each wall centerline for gaps and classify them as
   door or window from the local geometry.
5. **Scale** — convert pixels to meters using the supplied `meters_per_pixel`
   (or the `0.05` default).
6. **Assemble** — emit the Building JSON, plus a debug overlay image.

The front end then extrudes floors from the room polygons, splits each wall
around its openings, and renders doors (with frames and swing) and windows
(glass + sill + header) as real geometry.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run dev` → `ECONNREFUSED` on `/api/floorplan` | Flask isn't running — start `python flask/app.py` on port 5000. |
| Blank page / 404 at `localhost:5000` | Run `npm run build` in `furniture-planner/` first; Flask serves `dist/`. |
| Furniture shows up as a coloured box | The `.glb` filename doesn't match the catalog entry in `src/lib/models.js`. |
| Plan detected but wrongly sized | Adjust **meters per pixel** in the Floor Plan → 3D view (`info.scaleSource` tells you which value was used). |
| Detection looks wrong | Toggle the debug overlay in the UI, or run the pipeline standalone to inspect the `.debug.png`. |
| AR page fails to load models | Serve over HTTPS/`localhost`, not `file://`; check `roomcast/models/` for the `.glb` files. |

---

## Tech stack

- **Frontend** — React 19, Vite, three.js
- **Backend** — Flask, OpenCV (`opencv-python-headless`), NumPy
- **AR** — WebXR Device API + three.js (vendored, no CDN dependency)
- **Assets** — glTF/GLB furniture models
