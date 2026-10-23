import * as THREE from './lib/three.module.js';
import { CATALOG } from './catalog.js';
import { instantiate } from './model-loader.js';

const ROOM = 3.4; // half-extent of the room, in meters
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ---------- Scene setup ----------
const canvasWrap = document.getElementById('canvasWrap');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171A);
scene.fog = new THREE.Fog(0x15171A, 10, 22);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const floorMat = new THREE.MeshStandardMaterial({ color: 0x24272B, roughness: 1 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(ROOM * 2, Math.round(ROOM * 2 / 0.5), 0x3A3F45, 0x2A2D31);
grid.position.y = 0.001;
scene.add(grid);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x2A2E33, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
const wallH = 2.4;
const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, wallH), wallMat);
wallBack.position.set(0, wallH / 2, -ROOM);
scene.add(wallBack);
const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, wallH), wallMat);
wallLeft.rotation.y = Math.PI / 2;
wallLeft.position.set(-ROOM, wallH / 2, 0);
scene.add(wallLeft);

scene.add(new THREE.HemisphereLight(0xC9C2B0, 0x1A1A1A, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(4, 6, 3);
dir.castShadow = true;
scene.add(dir);

// ---------- Manual orbit camera ----------
let camTheta = Math.PI * 0.28, camPhi = Math.PI * 0.32, camDist = 7.5;
const camTarget = new THREE.Vector3(0, 0.4, 0);
function updateCamera() {
  const p = camPhi, t = camTheta, d = camDist;
  camera.position.set(
    camTarget.x + d * Math.sin(p) * Math.sin(t),
    camTarget.y + d * Math.cos(p),
    camTarget.z + d * Math.sin(p) * Math.cos(t)
  );
  camera.lookAt(camTarget);
}
updateCamera();

function resize() {
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- Furniture state ----------
const furniture = []; // {group, footprint, label}
let selected = null;
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

function selectionRing(radius) {
  const geo = new THREE.RingGeometry(radius * 0.92, radius, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xC9A227, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.003;
  return ring;
}

async function addFurniture(item) {
  const group = await instantiate(item);
  const fp = group.userData.footprint || 0.5;
  const spawnX = clamp((Math.random() - 0.5) * 1.5, -(ROOM - fp), ROOM - fp);
  const spawnZ = clamp((Math.random() - 0.5) * 1.5, -(ROOM - fp), ROOM - fp);
  group.position.set(spawnX, 0, spawnZ);
  const ring = selectionRing(fp * 0.85);
  ring.visible = false;
  group.add(ring);
  group.userData.ring = ring;
  scene.add(group);
  const rec = { group, footprint: fp, label: group.userData.label };
  furniture.push(rec);
  select(rec);
}

function select(rec) {
  if (selected) selected.group.userData.ring.visible = false;
  selected = rec;
  const inspector = document.getElementById('inspector');
  const empty = document.getElementById('emptyState');
  if (selected) {
    selected.group.userData.ring.visible = true;
    inspector.classList.add('active');
    empty.style.display = 'none';
    document.getElementById('inspName').textContent = rec.label;
  } else {
    inspector.classList.remove('active');
    empty.style.display = 'block';
  }
}

function deleteSelected() {
  if (!selected) return;
  scene.remove(selected.group);
  const i = furniture.indexOf(selected);
  if (i >= 0) furniture.splice(i, 1);
  select(null);
}

// ---------- Catalog UI ----------
const catalogEl = document.getElementById('catalog');
CATALOG.forEach(item => {
  const btn = document.createElement('button');
  btn.className = 'catalog-btn';
  btn.innerHTML = `<span class="dot"></span>${item.label}`;
  btn.addEventListener('click', () => { btn.disabled = true; addFurniture(item).finally(() => btn.disabled = false); });
  catalogEl.appendChild(btn);
});

document.getElementById('rotL').addEventListener('click', () => { if (selected) selected.group.rotation.y -= Math.PI / 12; });
document.getElementById('rotR').addEventListener('click', () => { if (selected) selected.group.rotation.y += Math.PI / 12; });
document.getElementById('scaleUp').addEventListener('click', () => { if (selected) selected.group.scale.multiplyScalar(1.1); });
document.getElementById('scaleDown').addEventListener('click', () => { if (selected) selected.group.scale.multiplyScalar(0.9); });
document.getElementById('deleteBtn').addEventListener('click', deleteSelected);

// ---------- Pointer interaction: orbit vs tap-select/move ----------
const pointers = new Map();
let dragMode = null; // 'orbit' | 'pinch'
let lastDist = 0;
let downPos = null, moved = false;

function ndcFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
}

renderer.domElement.addEventListener('pointerdown', e => {
  renderer.domElement.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downPos = { x: e.clientX, y: e.clientY }; moved = false;
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    dragMode = 'pinch';
  } else {
    dragMode = 'orbit';
  }
});

renderer.domElement.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) moved = true;

  if (dragMode === 'pinch' && pointers.size === 2) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    camDist = clamp(camDist * (lastDist / Math.max(dist, 1)), 3, 16);
    lastDist = dist;
    updateCamera();
  } else if (dragMode === 'orbit' && pointers.size === 1) {
    const dx = e.movementX || 0, dy = e.movementY || 0;
    camTheta -= dx * 0.006;
    camPhi = clamp(camPhi - dy * 0.006, 0.15, Math.PI / 2 - 0.05);
    updateCamera();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (!moved) handleTap(downPos);
    dragMode = null;
  }
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);

renderer.domElement.addEventListener('wheel', e => {
  camDist = clamp(camDist + e.deltaY * 0.003, 3, 16);
  updateCamera();
  e.preventDefault();
}, { passive: false });

function handleTap(pos) {
  const ndc = ndcFromEvent({ clientX: pos.x, clientY: pos.y });
  raycaster.setFromCamera(ndc, camera);

  const meshes = furniture.map(f => f.group);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length) {
    let obj = hits[0].object;
    while (obj.parent && !furniture.find(f => f.group === obj)) obj = obj.parent;
    const rec = furniture.find(f => f.group === obj);
    if (rec) { select(rec); return; }
  }

  if (selected) {
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(floorPlane, pt);
    if (pt) {
      const fp = selected.footprint;
      selected.group.position.x = clamp(pt.x, -(ROOM - fp), ROOM - fp);
      selected.group.position.z = clamp(pt.z, -(ROOM - fp), ROOM - fp);
    }
  }
}

// ---------- Render loop ----------
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// seed the room with one piece so it doesn't look empty
addFurniture(CATALOG[0]);
