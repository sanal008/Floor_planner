# Roomcast

## Folder structure

```
roomcast/
├── index.html          mode picker (AR vs room editor)
├── custom.html          room editor page shell
├── ar.html               AR placement page shell
├── css/
│   └── base.css          shared colors, buttons, layout tokens
├── js/
│   ├── catalog.js         the furniture list — id, label, .glb path, scale
│   ├── model-loader.js    loads a .glb, centers it, drops it to the floor,
│   │                      returns a fallback placeholder if the file is missing
│   ├── custom.js          room editor scene, camera, selection, drag-to-move
│   ├── ar.js              WebXR hit-test session, reticle, placement, gestures
│   └── lib/                three.js, vendored locally (no CDN dependency)
│       ├── three.module.js
│       └── loaders/GLTFLoader.js
└── models/                 your .glb files go here (see models/README.txt)
```

## Adding your furniture

Drop your seven `.glb` files into `models/` using the filenames listed in
`models/README.txt`. That's it — both `custom.html` and `ar.html` read the
same `js/catalog.js`, so a model you add shows up in both modes at once.

To add an eighth piece later, add one line to `js/catalog.js`:

```js
{ id: 'rug', label: 'Rug', file: 'models/rug.glb', scale: 1 }
```

If a model looks huge or tiny in the scene, adjust its `scale` number rather
than re-exporting the file.

## Running it

Because the pages use ES module imports and `fetch()` for the `.glb` files,
opening `index.html` directly from disk (`file://`) will fail — browsers
block module imports and local fetches under that protocol. Serve the folder
instead:

```bash
cd roomcast
python3 -m http.server 8080
# then open http://localhost:8080
```

AR mode additionally needs a **secure context** (HTTPS, or `localhost`
during development) and a WebXR-capable browser — in practice, Chrome on an
ARCore-capable Android phone. If you deploy this, put it behind HTTPS.
