import * as THREE from './lib/three.module.js';
import { CATALOG } from './catalog.js';
import { instantiate } from './model-loader.js';

const canvasWrap = document.getElementById('canvasWrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
renderer.xr.enabled = true;
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, canvasWrap.clientWidth / canvasWrap.clientHeight, 0.01, 20);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(2, 4, 2);
scene.add(dir);

// reticle: shows where furniture will land
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xC9A227 })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

window.addEventListener('resize', () => {
  camera.aspect = canvasWrap.clientWidth / canvasWrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
});

// ---------- placed furniture state ----------
const placed = []; // {group, footprint}
let selected = null;
let activeItem = CATALOG[0];
let moveMode = false;
let placing = false; // guards against double-taps while a model is still loading

function selectionRing(radius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.9, radius, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xC9A227, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.position.y = 0.003;
  return ring;
}
function selectRec(rec) {
  if (selected) selected.group.userData.ring.visible = false;
  selected = rec;
  if (selected) selected.group.userData.ring.visible = true;
}
async function placeAt(matrix) {
  if (placing) return;
  placing = true;
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  matrix.decompose(pos, quat, scl);
  try {
    const group = await instantiate(activeItem);
    const fp = group.userData.footprint || 0.4;
    group.position.copy(pos);
    const ring = selectionRing(fp * 0.85);
    ring.visible = false;
    group.add(ring);
    group.userData.ring = ring;
    scene.add(group);
    const rec = { group, footprint: fp };
    placed.push(rec);
    selectRec(rec);
  } finally {
    placing = false;
  }
}
function moveSelectedTo(matrix) {
  if (!selected) return;
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  matrix.decompose(pos, quat, scl);
  selected.group.position.copy(pos);
}

// ---------- overlay UI ----------
const catalogRow = document.getElementById('catalogRow');
CATALOG.forEach((item, idx) => {
  const btn = document.createElement('button');
  btn.textContent = item.label;
  if (idx === 0) btn.classList.add('active');
  btn.addEventListener('click', () => {
    activeItem = item;
    [...catalogRow.children].forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    moveMode = false;
    document.getElementById('moveBtn').classList.remove('active');
  });
  catalogRow.appendChild(btn);
});
document.getElementById('rotL').addEventListener('click', () => { if (selected) selected.group.rotation.y -= Math.PI / 12; });
document.getElementById('rotR').addEventListener('click', () => { if (selected) selected.group.rotation.y += Math.PI / 12; });
document.getElementById('scaleUp').addEventListener('click', () => { if (selected) selected.group.scale.multiplyScalar(1.1); });
document.getElementById('scaleDown').addEventListener('click', () => { if (selected) selected.group.scale.multiplyScalar(0.9); });
document.getElementById('removeBtn').addEventListener('click', () => {
  if (!selected) return;
  scene.remove(selected.group);
  const i = placed.indexOf(selected);
  if (i >= 0) placed.splice(i, 1);
  selected = null;
});
const moveBtn = document.getElementById('moveBtn');
moveBtn.addEventListener('click', () => {
  moveMode = !moveMode;
  moveBtn.classList.toggle('active', moveMode);
});

// ---------- WebXR session ----------
let hitTestSource = null;
let hitTestSourceRequested = false;
let xrSession = null;

const enterBtn = document.getElementById('enterBtn');
const statusEl = document.getElementById('status');
const landing = document.getElementById('landing');
const overlay = document.getElementById('overlay');

async function checkSupport() {
  if (!navigator.xr) { statusEl.textContent = 'WebXR isn\u2019t available in this browser.'; enterBtn.disabled = true; return; }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-ar');
    if (!ok) { statusEl.textContent = 'This browser/device doesn\u2019t support AR sessions. Try Chrome on an ARCore-capable Android phone.'; enterBtn.disabled = true; }
  } catch (e) { statusEl.textContent = 'Could not check AR support.'; }
}
checkSupport();

enterBtn.addEventListener('click', async () => {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay }
    });
    landing.style.display = 'none';
    overlay.classList.add('active');
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(xrSession);
    xrSession.addEventListener('end', onSessionEnd);
    xrSession.addEventListener('select', onSelect);
    renderer.setAnimationLoop(onXRFrame);
  } catch (e) {
    statusEl.textContent = 'Could not start AR: ' + e.message;
  }
});
document.getElementById('exitBtn').addEventListener('click', () => { if (xrSession) xrSession.end(); });

function onSessionEnd() {
  hitTestSource = null; hitTestSourceRequested = false;
  overlay.classList.remove('active');
  landing.style.display = 'flex';
  renderer.setAnimationLoop(null);
}

function onSelect() {
  if (!reticle.visible) return;
  if (moveMode && selected) {
    moveSelectedTo(reticle.matrix);
  } else {
    placeAt(reticle.matrix);
  }
}

function onXRFrame(timestamp, frame) {
  const session = frame.session;
  const refSpace = renderer.xr.getReferenceSpace();

  if (!hitTestSourceRequested) {
    session.requestReferenceSpace('viewer').then(viewerSpace => {
      session.requestHitTestSource({ space: viewerSpace }).then(source => {
        hitTestSource = source;
      });
    });
    hitTestSourceRequested = true;
  }

  if (hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}
