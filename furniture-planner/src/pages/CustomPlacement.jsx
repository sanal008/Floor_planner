import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CATALOG, instantiate } from '../lib/models.js'

export default function CustomPlacement({ onBack }) {
  const mountRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const [items, setItems] = useState([])
  const [activeTool, setActiveTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [floorColor, setFloorColor] = useState('#ffffff')
  const [wallColor, setWallColor] = useState('#cfd6ea')
  const [selectedSurface, setSelectedSurface] = useState(null)
  const [surfaceColor, setSurfaceColor] = useState(null)
  const floorColorRef = useRef('#ffffff')
  const wallColorRef = useRef('#cfd6ea')
  floorColorRef.current = floorColor
  wallColorRef.current = wallColor
  const dragRef = useRef(null)
  const selectedRef = useRef(null)
  selectedRef.current = selectedId
  const rotateRef = useRef(() => {})
  rotateRef.current = (delta) => {
    setItems((prev) =>
      prev.map((i) => (i.id === selectedRef.current ? { ...i, rot: (i.rot || 0) + delta } : i))
    )
  }

  const stateRef = useRef({ items: [], active: 0 })
  stateRef.current.items = items
  stateRef.current.active = activeTool

  useEffect(() => {
    const mount = mountRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef1f8)

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(4, 4, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    const lockPolar = Math.acos(4 / Math.sqrt(4 * 4 + 4 * 4 + 5 * 5))
    controls.minPolarAngle = lockPolar
    controls.maxPolarAngle = lockPolar
    controls.enableDamping = true
    controls.update()
    cameraRef.current = camera
    controlsRef.current = controls

    const grid = new THREE.GridHelper(10, 10, 0x9aa3c2, 0xb9c1d9)
    scene.add(grid)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: floorColorRef.current, roughness: 0.95 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const HALF = 5
    const WALL_H = 2.5
    const surfaces = new Map()
    const addWall = (width, x, z, rotY = 0) => {
      const mat = new THREE.MeshStandardMaterial({
        color: wallColorRef.current,
        roughness: 0.85,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, WALL_H), mat)
      wall.position.set(x, WALL_H / 2, z)
      wall.rotation.y = rotY
      wall.castShadow = true
      wall.receiveShadow = true
      wall.userData.surfaceType = 'wall'
      scene.add(wall)
      surfaces.set(wall.uuid, wall)
      return wall
    }

    // Perimeter walls on 3 sides (back, left, right) - front stays open
    addWall(10, 0, -HALF)
    addWall(10, -HALF, 0, Math.PI / 2)
    addWall(10, HALF, 0, Math.PI / 2)

    // Internal walls dividing the floor into 4 rooms (5x5 each)
    addWall(10, 0, 0, Math.PI / 2)
    addWall(10, 0, 0)

    floor.userData.surfaceType = 'floor'
    surfaces.set(floor.uuid, floor)

    const ambient = new THREE.AmbientLight(0xffffff, 0.9)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 1.8)
    dir.position.set(4, 8, 4)
    dir.castShadow = true
    scene.add(dir)

    const point = new THREE.PointLight(0x8b5cf6, 1.2, 8)
    point.position.set(-3, 2, 2)
    scene.add(point)

    const groups = new Map()
    mount.__scene = scene
    mount.__floor = floor
    mount.__floorMat = floor.material
    mount.__wallMat = null
    mount.__surfaces = surfaces
    mount.__groups = groups

    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    const updateMouse = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const onPointerDown = (e) => {
      if (e.button !== 0) return
      updateMouse(e)
      ray.setFromCamera(mouse, camera)

      const hits = ray.intersectObjects([...groups.values()].map((r) => r.group), true)
      if (hits.length) {
        let obj = hits[0].object
        while (obj.parent && !groups.has(obj.userData.ownerId)) obj = obj.parent
        if (obj.userData.ownerId) {
          renderer.domElement.setPointerCapture(e.pointerId)
          setSelectedId(obj.userData.ownerId)
          setSelectedSurface(null)
          dragRef.current = obj.userData.ownerId
          controls.enabled = false
        }
        return
      }

      const hit = ray.intersectObject(floor)
      if (hit.length) {
        const kind = stateRef.current.active
        if (kind !== null) {
          setItems((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind, x: hit[0].point.x, z: hit[0].point.z, rot: 0, scale: 1 },
          ])
          return
        }
      }

      // Click an empty spot to pick the wall/floor surface under the cursor
      const sHits = ray.intersectObjects([...surfaces.values()])
      if (sHits.length) {
        const surf = sHits[0].object
        setSelectedId(null)
        setSelectedSurface(surf.uuid)
        setSurfaceColor('#' + surf.material.color.getHexString())
      } else {
        setSelectedSurface(null)
      }
    }

    const onPointerMove = (e) => {
      if (!dragRef.current) return
      updateMouse(e)
      ray.setFromCamera(mouse, camera)
      const pt = new THREE.Vector3()
      if (ray.ray.intersectPlane(floorPlane, pt)) {
        const id = dragRef.current
        const rec = groups.get(id)
        if (rec?.group) {
          rec.group.position.x = pt.x
          rec.group.position.z = pt.z
        }
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, x: pt.x, z: pt.z } : i))
        )
      }
    }

    const onPointerUp = () => {
      dragRef.current = null
      controls.enabled = true
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    const float = document.createElement('div')
    float.className = 'float-controls'
    const makeRotateBtn = (label, delta, title) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = label
      btn.title = title
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        rotateRef.current(delta)
      })
      float.appendChild(btn)
    }
    makeRotateBtn('⟲', -Math.PI / 6, 'Rotate left')
    makeRotateBtn('⟳', Math.PI / 6, 'Rotate right')
    mount.appendChild(float)

    const floatPos = new THREE.Vector3()
    const floatBox = new THREE.Box3()
    let raf
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)

      const rec = selectedRef.current && groups.get(selectedRef.current)
      if (rec && rec.group) {
        floatBox.setFromObject(rec.group)
        floatPos.copy(floatBox.max)
        floatPos.y = floatBox.max.y + 0.2
        floatPos.project(camera)
        float.style.display = 'block'
        float.style.left = `${(floatPos.x * 0.5 + 0.5) * renderer.domElement.clientWidth}px`
        float.style.top = `${(-floatPos.y * 0.5 + 0.5) * renderer.domElement.clientHeight}px`
      } else {
        float.style.display = 'none'
      }
      raf = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      controls.dispose()
      mount.removeChild(float)
      for (const rec of groups.values()) {
        scene.remove(rec.group)
        rec.group.traverse((o) => o.geometry && o.geometry.dispose())
      }
      groups.clear()
      for (const surf of surfaces.values()) {
        surf.material.dispose()
        surf.geometry.dispose()
      }
      surfaces.clear()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      delete mount.__scene
      delete mount.__floor
      delete mount.__floorMat
      delete mount.__wallMat
      delete mount.__surfaces
      delete mount.__groups
    }
  }, [])

  useEffect(() => {
    const scene = mountRef.current.__scene
    const groups = mountRef.current.__groups
    if (!scene) return
    let cancelled = false

    const wanted = new Set(items.map((i) => i.id))
    for (const [id, rec] of groups) {
      if (!wanted.has(id)) {
        scene.remove(rec.group)
        rec.group.traverse((o) => o.geometry && o.geometry.dispose())
        groups.delete(id)
      }
    }

    for (const item of items) {
      let rec = groups.get(item.id)
      if (!rec) {
        rec = { group: null, kind: item.kind }
        groups.set(item.id, rec)
        instantiate(CATALOG[item.kind]).then((group) => {
          if (cancelled || !groups.has(item.id)) return
          group.position.set(item.x, item.y || 0, item.z)
          group.rotation.y = item.rot
          group.scale.setScalar(item.scale || 1)
          group.traverse((o) => {
            o.userData.ownerId = item.id
          })
          rec.group = group
          scene.add(group)
        })
      } else if (rec.group) {
        rec.group.position.set(item.x, item.y || 0, item.z)
        rec.group.rotation.y = item.rot
        rec.group.scale.setScalar(item.scale || 1)
      }
    }

    return () => {
      cancelled = true
    }
  }, [items])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (mount.__floorMat) mount.__floorMat.color.set(floorColor)
    if (mount.__surfaces) {
      for (const surf of mount.__surfaces.values()) {
        if (surf.userData.surfaceType === 'wall') surf.material.color.set(wallColor)
      }
    }
  }, [floorColor, wallColor])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !mount.__surfaces) return
    for (const surf of mount.__surfaces.values()) {
      surf.material.emissive.setHex(0x000000)
      surf.material.emissiveIntensity = 0
    }
    if (selectedSurface && mount.__surfaces.has(selectedSurface)) {
      const surf = mount.__surfaces.get(selectedSurface)
      surf.material.emissive.setHex(0x8b5cf6)
      surf.material.emissiveIntensity = 0.25
    }
  }, [selectedSurface])

  const recolorSurface = (color) => {
    setSurfaceColor(color)
    const mount = mountRef.current
    if (!mount || !selectedSurface || !mount.__surfaces) return
    const surf = mount.__surfaces.get(selectedSurface)
    if (surf) surf.material.color.set(color)
  }

  const resizeSelected = (factor) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === selectedId
          ? { ...i, scale: Math.max(0.2, Math.min(5, (i.scale || 1) * factor)) }
          : i
      )
    )
  }

  const moveSelected = (delta) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === selectedId
          ? { ...i, y: Math.max(0, Math.min(3, (i.y || 0) + delta)) }
          : i
      )
    )
  }

  const deleteSelected = () => {
    setItems((prev) => prev.filter((i) => i.id !== selectedId))
    setSelectedId(null)
  }

  const selected = items.find((i) => i.id === selectedId)

  const setView = (view) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    controls.enabled = true
    if (view === 'top') {
      camera.position.set(0, 12, 0.01)
    } else {
      camera.position.set(4, 4, 5)
    }
    camera.lookAt(controls.target)
    controls.update()
    const offset = camera.position.clone().sub(controls.target)
    const polar = Math.acos(offset.y / Math.max(offset.length(), 1e-6))
    controls.minPolarAngle = polar
    controls.maxPolarAngle = polar
    controls.update()
  }

  const tiltView = (delta) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    controls.enabled = true
    const target = controls.target
    const offset = camera.position.clone().sub(target)
    const radius = offset.length()
    const polar = Math.acos(offset.y / Math.max(radius, 1e-6))
    const azimuth = Math.atan2(offset.x, offset.z)
    const next = THREE.MathUtils.clamp(polar + delta, 0.08, Math.PI / 2 - 0.05)
    camera.position.set(
      target.x + radius * Math.sin(next) * Math.sin(azimuth),
      target.y + radius * Math.cos(next),
      target.z + radius * Math.sin(next) * Math.cos(azimuth)
    )
    camera.lookAt(target)
    controls.update()
    controls.minPolarAngle = next
    controls.maxPolarAngle = next
    controls.update()
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <button className="back-btn" onClick={onBack}>← Home</button>
        <h1>Custom Placement</h1>
        <span className="item-count">{items.length} item{items.length === 1 ? '' : 's'} placed</span>
      </header>

      <div className="toolbar">
        {CATALOG.map((item, i) => (
          <button
            key={item.name}
            className={`tool ${activeTool === i ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === i ? null : i)}
          >
            <span className="tool-swatch" style={{ background: `#${item.color.toString(16).padStart(6, '0')}` }} />
            {item.name}
          </button>
        ))}

        <button
          className="tool"
          disabled={!selected}
          onClick={() => resizeSelected(0.9)}
          title="Make selected furniture smaller"
        >
          − Size
        </button>
        <button
          className="tool"
          disabled={!selected}
          onClick={() => resizeSelected(1.1)}
          title="Make selected furniture bigger"
        >
          + Size
        </button>
        <button
          className="tool"
          disabled={!selected}
          onClick={() => moveSelected(0.3)}
          title="Move selected furniture up"
        >
          ▲ Move up
        </button>
        <button
          className="tool"
          disabled={!selected}
          onClick={() => moveSelected(-0.3)}
          title="Move selected furniture down"
        >
          ▼ Move down
        </button>
        <button className="tool danger" disabled={!selected} onClick={deleteSelected}>
          Delete
        </button>
        <button className="tool danger" onClick={() => setItems([])}>Clear All</button>
        <button className="tool" onClick={() => setView('top')}>Top View</button>
        <button className="tool" onClick={() => setView('default')}>Default View</button>
        <button className="tool" onClick={() => tiltView(-0.15)} title="Tilt the view upward">Tilt Up</button>
        <button className="tool" onClick={() => tiltView(0.15)} title="Tilt the view downward">Tilt Down</button>
        <label className="tool color-tool">
          <input type="color" value={floorColor} onChange={(e) => setFloorColor(e.target.value)} />
          Floor
        </label>
        <label className="tool color-tool">
          <input type="color" value={wallColor} onChange={(e) => setWallColor(e.target.value)} />
          Wall
        </label>
        {selectedSurface && (
          <label className="tool color-tool active">
            <input type="color" value={surfaceColor || ''} onChange={(e) => recolorSurface(e.target.value)} />
            Selected Surface
          </label>
        )}
      </div>

      <div className="editor-canvas" ref={mountRef} />
      <div className="hint">
        {selected
          ? `Selected: ${CATALOG[selected.kind].name}. Use ⟲/⟳ above it to rotate, ▲/▼ to raise or lower it.`
          : selectedSurface
            ? 'This wall/floor is selected. Use the color picker to recolor it. Click another wall, floor, or empty space to change the selection.'
            : activeTool !== null
              ? 'Click the floor to place the selected furniture. Click the button again to deselect.'
              : 'Select a furniture button, then click the floor to place it. Drag placed furniture to move it. Click a wall or the floor to select it and recolor it.'}
      </div>
    </div>
  )
}