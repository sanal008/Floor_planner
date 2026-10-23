import * as THREE from 'three'

const WALL_HEIGHT = 2.7
const FLOOR_HEIGHT = 0.1

const FLOOR_PALETTE = [
  0xcdd6f4, 0xc8d5f7, 0xd7c8f0, 0xc3e5d8,
  0xf2e0c8, 0xd8e0c8, 0xe8c8d8, 0xc8d8e8,
]

const floorMat = (i) =>
  new THREE.MeshStandardMaterial({
    color: FLOOR_PALETTE[i % FLOOR_PALETTE.length],
    roughness: 0.92,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })

const wallMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.85,
  metalness: 0.05,
})

const frameMat = new THREE.MeshStandardMaterial({
  color: 0xcfd3e2,
  roughness: 0.6,
  metalness: 0.15,
})

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xbfe3f2,
  transparent: true,
  opacity: 0.4,
  roughness: 0.1,
  metalness: 0,
})

const doorMat = new THREE.MeshStandardMaterial({
  color: 0x8b5cf6,
  roughness: 0.55,
  metalness: 0.15,
})

function buildFloors(group, rooms) {
  rooms.forEach((room, i) => {
    const pts = room.polygon
    if (!pts || pts.length < 3) return
    const shape = new THREE.Shape()
    pts.forEach(([x, z], j) => {
      if (j === 0) shape.moveTo(x, z)
      else shape.lineTo(x, z)
    })
    shape.closePath()
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: FLOOR_HEIGHT,
      bevelEnabled: false,
    })
    geom.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geom, floorMat(i))
    mesh.receiveShadow = true
    mesh.userData.isFloor = true
    group.add(mesh)
  })
}

function buildWalls(group, json) {
  const { walls, doors = [], windows = [] } = json
  const openingsByWall = new Map()
  for (const o of [...doors, ...windows]) {
    if (!openingsByWall.has(o.wall)) openingsByWall.set(o.wall, [])
    openingsByWall.get(o.wall).push(o)
  }

  walls.forEach((w, wi) => {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1)
    // Floors (ExtrudeGeometry + rotateX) map shape y to world -z, so walls must
    // mirror the z axis too, otherwise walls and floors end up on opposite sides.
    const ang = Math.atan2(-(w.z2 - w.z1), w.x2 - w.x1)
    const t = w.thickness || 0.15
    const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang))

    const openings = (openingsByWall.get(wi) || [])
      .map((o) => ({ ...o, pos: Math.min(Math.max(o.offset, 0.05), len - 0.05) }))
      .sort((a, b) => a.pos - b.pos)

    // Wall boxes: the wall split into segments that skip the openings.
    const segs = []
    let cursor = 0
    for (const o of openings) {
      const start = o.pos - o.width / 2
      const end = o.pos + o.width / 2
      if (start > cursor + 0.01) segs.push([cursor, start])
      cursor = Math.max(cursor, end)
    }
    if (len - cursor > 0.01) segs.push([cursor, len])

    for (const [s0, s1] of segs) {
      const segLen = s1 - s0
      const mid = (s0 + s1) / 2
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, WALL_HEIGHT, t), wallMat)
      mesh.position.set(w.x1 + dir.x * mid, WALL_HEIGHT / 2, -w.z1 + dir.y * mid)
      mesh.rotation.y = ang
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
    }

    for (const o of openings) {
      const cx = w.x1 + dir.x * o.pos
      const cz = -w.z1 + dir.y * o.pos
      if (o.kind === 'window') {
        buildWindow(group, dir, ang, cx, cz, o, t)
      } else {
        buildDoor(group, dir, ang, cx, cz, o, t)
      }
    }
  })
}

function buildWindow(group, dir, ang, cx, cz, o, t) {
  const h = o.height || 1.2
  const sill = o.sill || 0.9
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(o.width, h, Math.max(0.02, t * 0.25)),
    glassMat
  )
  glass.position.set(cx, sill + h / 2, cz)
  glass.rotation.y = ang
  glass.castShadow = true
  group.add(glass)

  const header = new THREE.Mesh(new THREE.BoxGeometry(o.width + 0.12, 0.08, t + 0.1), frameMat)
  header.position.set(cx, sill + h + 0.04, cz)
  header.rotation.y = ang
  group.add(header)

  const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(o.width + 0.12, 0.06, t + 0.1), frameMat)
  sillMesh.position.set(cx, sill - 0.03, cz)
  sillMesh.rotation.y = ang
  group.add(sillMesh)
}

function buildDoor(group, dir, ang, cx, cz, o, t) {
  const h = o.height || 2.1
  // Hinge on the opening start; the panel swings open ~55 degrees.
  const hingeX = cx - dir.x * (o.width / 2)
  const hingeZ = cz - dir.y * (o.width / 2)
  const pivot = new THREE.Group()
  pivot.position.set(hingeX, 0, hingeZ)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(o.width * 0.95, h, Math.max(0.04, t * 0.8)),
    doorMat
  )
  panel.position.set(o.width / 2, h / 2, 0)
  panel.castShadow = true
  pivot.add(panel)
  pivot.rotation.y = ang + 0.6
  group.add(pivot)

  // Door frame: two jambs + lintel
  const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, Math.max(0.05, t * 1.1)), frameMat)
  const j1 = jamb.clone()
  j1.position.set(cx - dir.x * (o.width / 2 - 0.03), h / 2, cz - dir.y * (o.width / 2 - 0.03))
  j1.rotation.y = ang
  group.add(j1)
  const j2 = jamb.clone()
  j2.position.set(cx + dir.x * (o.width / 2 - 0.03), h / 2, cz + dir.y * (o.width / 2 - 0.03))
  j2.rotation.y = ang
  group.add(j2)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(o.width + 0.06, 0.08, Math.max(0.05, t * 1.1)), frameMat)
  lintel.position.set(cx, h - 0.04, cz)
  lintel.rotation.y = ang
  group.add(lintel)
}

/**
 * Build a THREE.Group from a Building JSON (floor plan -> 3D).
 * The group is centered on X/Z, dropped to y=0, and normalized so its
 * largest dimension is ~8 world units.
 */
export function buildBuilding(json) {
  const group = new THREE.Group()
  buildFloors(group, json.rooms || [])
  buildWalls(group, json)

  const box = new THREE.Box3().setFromObject(group)
  const size = new THREE.Vector3()
  box.getSize(size)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  let s = 1
  if (maxDim > 1e-6) {
    s = 8 / maxDim
    group.scale.setScalar(s)
  }
  const bb = new THREE.Box3().setFromObject(group)
  const c = new THREE.Vector3()
  bb.getCenter(c)
  group.position.set(-c.x, 0, -c.z)

  group.userData.json = json
  group.userData.scaleFactor = s
  return group
}

/** Fit the camera + controls to frame a building group. */
export function frameGroup(camera, controls, group) {
  if (!group) return
  const box = new THREE.Box3().setFromObject(group)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 1)
  const target = new THREE.Vector3()
  box.getCenter(target)
  controls.target.copy(target)
  camera.position.copy(target)
  camera.position.y += radius * 1.1
  camera.position.z += radius * 2.2
  camera.near = radius / 100
  camera.far = radius * 100
  camera.updateProjectionMatrix()
  controls.update()
}
