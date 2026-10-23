import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Drop your .glb files into public/models with these exact names.
// If a file is missing, a colored placeholder box is shown instead,
// so you can immediately spot which model is missing.
//
// targetSize: the real-world size (in meters) of the model's largest
// dimension. Every model is normalized to this at load time, so all
// furniture appears at a consistent, comparable scale no matter how big
// or small the raw .glb export was. Use +/- Size to adjust from there.
export const CATALOG = [
  {
    name: 'Sofa',
    file: '/models/sofa.glb',
    scale: 1,
    targetSize: 1.8,
    color: 0x8b5cf6,
    h: 0.25,
    build: () => new THREE.BoxGeometry(1.6, 0.5, 0.8),
  },
  {
    name: 'Armchair',
    file: '/models/sofa_chair.glb',
    scale: 1,
    targetSize: 0.9,
    color: 0xa78bfa,
    h: 0.25,
    build: () => new THREE.BoxGeometry(0.7, 0.5, 0.7),
  },
  {
    name: 'Office Table',
    file: '/models/simple_office_table.glb',
    scale: 1,
    targetSize: 1.4,
    color: 0xf59e0b,
    h: 0.03,
    build: () => new THREE.BoxGeometry(1.0, 0.06, 0.6),
  },
  {
    name: 'Bed',
    file: '/models/bed.glb',
    scale: 1,
    targetSize: 2.0,
    color: 0xec4899,
    h: 0.15,
    build: () => new THREE.BoxGeometry(1.6, 0.3, 2.0),
  },
  {
    name: 'Bookshelf',
    file: '/models/wooden_book_shelf.glb',
    scale: 1,
    targetSize: 1.6,
    color: 0x10b981,
    h: 0.9,
    build: () => new THREE.BoxGeometry(1.2, 1.8, 0.4),
  },
  {
    name: 'Floor Lamp',
    file: '/models/floor_lamp.glb',
    scale: 1,
    targetSize: 1.5,
    color: 0x6366f1,
    h: 0.5,
    build: () => new THREE.CylinderGeometry(0.08, 0.12, 1.0, 16),
  },
  {
    name: 'Flower Pot',
    file: '/models/flowerpot.glb',
    scale: 1,
    targetSize: 0.4,
    color: 0x22d3ee,
    h: 0.2,
    build: () => new THREE.CylinderGeometry(0.15, 0.25, 0.4, 16),
  },
]

const loader = new GLTFLoader()
const cache = new Map()

function placeholder(item) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(
    item.build(),
    new THREE.MeshStandardMaterial({
      color: item.color,
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
    })
  )
  mesh.position.y = item.h
  mesh.castShadow = true
  group.add(mesh)

  const box = new THREE.Box3().setFromObject(group)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z)
  const s = item.targetSize ? item.targetSize / Math.max(maxDim, 1e-6) : 1
  group.scale.setScalar(s)

  group.userData.label = item.name + ' (missing model)'
  group.userData.footprint = (item.targetSize || 0.4) / 2
  return group
}

/**
 * Loads (or clones a cached copy of) a catalog item, normalizes it so its
 * largest dimension matches item.targetSize, centers it on X/Z, drops its
 * base onto y = 0, applies the catalog scale, and returns a group.
 */
export async function instantiate(item) {
  let scene
  try {
    if (!cache.has(item.file)) {
      cache.set(item.file, loader.loadAsync(item.file).then((gltf) => gltf.scene))
    }
    const raw = await cache.get(item.file)
    scene = raw.clone(true)
  } catch (err) {
    console.warn(`Could not load ${item.file}:`, err)
    return placeholder(item)
  }

  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })

  const group = new THREE.Group()
  group.add(scene)

  const rawBox = new THREE.Box3().setFromObject(group)
  const rawSize = new THREE.Vector3()
  rawBox.getSize(rawSize)
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z)
  const normalize = item.targetSize ? item.targetSize / Math.max(maxDim, 1e-6) : 1
  scene.scale.setScalar((item.scale || 1) * normalize)

  const box = new THREE.Box3().setFromObject(group)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= box.min.y

  group.userData.label = item.name
  group.userData.footprint = Math.max(size.x, size.z) / 2 || 0.4
  return group
}