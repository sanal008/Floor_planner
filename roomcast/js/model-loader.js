import * as THREE from './lib/three.module.js';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map(); // file -> parsed gltf.scene (cloned per use)

function loadRaw(file) {
  if (cache.has(file)) return cache.get(file);
  const promise = new Promise((resolve, reject) => {
    loader.load(file, gltf => resolve(gltf.scene), undefined, reject);
  });
  cache.set(file, promise);
  return promise;
}

// A visible placeholder shown if a .glb is missing or fails to load,
// so the app still runs before every model file is in place.
function placeholder(label) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xB5426B, roughness: 0.7, transparent: true, opacity: 0.85 })
  );
  box.position.y = 0.25;
  g.add(box);
  g.userData.label = label + ' (missing model)';
  g.userData.footprint = 0.4;
  g.userData.isPlaceholder = true;
  return g;
}

/**
 * Loads (or clones a cached copy of) a catalog item, centers it in X/Z,
 * drops it so its base sits on y = 0, applies the catalog scale, and
 * returns a group plus the footprint radius used for room-bounds clamping.
 */
export async function instantiate(item) {
  let scene;
  try {
    const raw = await loadRaw(item.file);
    scene = raw.clone(true);
  } catch (err) {
    console.warn(`Could not load ${item.file}:`, err);
    const ph = placeholder(item.label);
    return ph;
  }

  scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const group = new THREE.Group();
  scene.scale.setScalar(item.scale || 1);
  group.add(scene);

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // re-center on X/Z and drop the base to the floor
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;

  group.userData.label = item.label;
  group.userData.footprint = Math.max(size.x, size.z) / 2 || 0.4;
  return group;
}
