import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildBuilding, frameGroup } from '../lib/building.js'
import { CATALOG, instantiate } from '../lib/models.js'

const toDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(blob)
  })

export default function FloorPlan3D({ onBack }) {
  const mountRef = useRef(null)
  const groupRef = useRef(null)
  const pivotRef = useRef(null)

  const [image, setImage] = useState(null) // { dataUrl, name }
  const [metersPerPixel, setMetersPerPixel] = useState(0.05)
  const [status, setStatus] = useState('idle') // idle|working|done|error
  const [message, setMessage] = useState('Upload a floor-plan image to get started.')
  const [info, setInfo] = useState(null)
  const [showDebug, setShowDebug] = useState(false)
  const [debugUrl, setDebugUrl] = useState(null)

  const [items, setItems] = useState([])
  const [activeTool, setActiveTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [scaleFactor, setScaleFactor] = useState(1)

  const groupsRef = useRef(new Map())
  const dragRef = useRef(null)
  const selectedRef = useRef(null)
  selectedRef.current = selectedId
  const activeRef = useRef(null)
  activeRef.current = activeTool
  const sfRef = useRef(1)
  sfRef.current = scaleFactor

  const rotateRef = useRef(() => {})
  rotateRef.current = (delta) => {
    setItems((prev) =>
      prev.map((i) => (i.id === selectedRef.current ? { ...i, rot: (i.rot || 0) + delta } : i))
    )
  }

  // Tilt the camera view around the scene target, exactly like the Tilt Up/Down
  // buttons on the Custom Placement page.
  const tiltView = (delta) => {
    const mount = mountRef.current
    const camera = mount?.__camera
    const controls = mount?.__controls
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

  // ---- static three.js scene ----
  useEffect(() => {
    const mount = mountRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef1f8)

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 500)
    camera.position.set(6, 6, 8)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 1, 0)

    const grid = new THREE.GridHelper(12, 24, 0x9aa3c2, 0xb9c1d9)
    scene.add(grid)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0xf2f4fb, roughness: 0.95 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    floor.receiveShadow = true
    scene.add(floor)

    const ambient = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 1.6)
    dir.position.set(5, 10, 6)
    dir.castShadow = true
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0xcdd6ff, 0.6)
    fill.position.set(-6, 4, -4)
    scene.add(fill)

    mount.__scene = scene
    mount.__camera = camera
    mount.__controls = controls
    mount.__renderer = renderer

    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const updateMouse = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const floorMeshes = () => {
      const meshes = []
      groupRef.current?.traverse((o) => {
        if (o.userData.isFloor) meshes.push(o)
      })
      return meshes
    }

    const buildingMeshes = () => {
      const meshes = []
      groupRef.current?.traverse((o) => {
        if (o.isMesh) meshes.push(o)
      })
      return meshes
    }

    // Convert a world-space point into the pivot's local space, so furniture
    // placed/dragged on the ground stays glued to the tilted model.
    const toLocal = (v) => {
      const pivot = pivotRef.current
      if (!pivot) return v.clone()
      pivot.updateWorldMatrix(true, false)
      return pivot.worldToLocal(v.clone())
    }

    const addItem = (kind, x, z) => {
      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind,
          x,
          z,
          rot: 0,
          scale: 1,
          y: 0,
        },
      ])
    }

    const onPointerDown = (e) => {
      if (e.button !== 0) return
      updateMouse(e)
      ray.setFromCamera(mouse, camera)

      const placed = [...groupsRef.current.values()].map((r) => r.group).filter(Boolean)
      const hits = ray.intersectObjects(placed, true)
      if (hits.length) {
        let obj = hits[0].object
        while (obj.parent && !obj.userData.ownerId) obj = obj.parent
        if (obj.userData.ownerId) {
          renderer.domElement.setPointerCapture(e.pointerId)
          setSelectedId(obj.userData.ownerId)
          dragRef.current = obj.userData.ownerId
          controls.enabled = false
        }
        return
      }

      const kind = activeRef.current
      if (kind !== null && groupRef.current) {
        const fh = ray.intersectObjects(floorMeshes(), false)
        const pt = new THREE.Vector3()
        if (fh.length) {
          const local = toLocal(fh[0].point)
          addItem(kind, local.x, local.z)
        } else if (
          ray.intersectObjects(buildingMeshes(), false).length &&
          ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)
        ) {
          // Clicked a wall: snap the placement to the floor under the cursor.
          const local = toLocal(pt)
          addItem(kind, local.x, local.z)
        }
        return
      }

      setSelectedId(null)
    }

    const onPointerMove = (e) => {
      if (!dragRef.current) return
      updateMouse(e)
      ray.setFromCamera(mouse, camera)
      const pt = new THREE.Vector3()
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      if (ray.ray.intersectPlane(plane, pt)) {
        const id = dragRef.current
        const rec = groupsRef.current.get(id)
        if (rec?.group) {
          const local = toLocal(pt)
          rec.group.position.x = local.x
          rec.group.position.z = local.z
          setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, x: local.x, z: local.z } : i))
          )
        }
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

    let raf
    const floatPos = new THREE.Vector3()
    const floatBox = new THREE.Box3()
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)

      const rec = selectedRef.current && groupsRef.current.get(selectedRef.current)
      if (rec?.group) {
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
      for (const rec of groupsRef.current.values()) {
        scene.remove(rec.group)
        rec.group?.traverse((o) => o.geometry && o.geometry.dispose())
      }
      groupsRef.current.clear()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      delete mount.__scene
      delete mount.__camera
      delete mount.__controls
      delete mount.__renderer
    }
  }, [])

  // ---- instantiate / update / remove placed furniture ----
  useEffect(() => {
    const scene = mountRef.current?.__scene
    if (!scene) return
    let cancelled = false
    const groups = groupsRef.current
    // Furniture lives under the pivot so it rotates with the model (fall back to the scene).
    const host = pivotRef.current || scene

    const wanted = new Set(items.map((i) => i.id))
    for (const [id, rec] of groups) {
      if (!wanted.has(id) && rec.group) {
        host.remove(rec.group)
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
          group.scale.multiplyScalar(sfRef.current)
          group.position.set(item.x, item.y || 0, item.z)
          group.rotation.y = item.rot || 0
          group.traverse((o) => {
            o.userData.ownerId = item.id
          })
          rec.group = group
          host.add(group)
        })
      } else if (rec.group) {
        rec.group.position.set(item.x, item.y || 0, item.z)
        rec.group.rotation.y = item.rot || 0
        rec.group.scale.setScalar((item.scale || 1) * sfRef.current)
      }
    }

    return () => {
      cancelled = true
    }
  }, [items, scaleFactor])

  const clearBuilding = () => {
    const mount = mountRef.current
    const top = pivotRef.current || groupRef.current
    if (!mount || !top) return
    mount.__scene.remove(top)
    top.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
        else o.material.dispose()
      }
    })
    pivotRef.current = null
    groupRef.current = null
  }

  const processImage = async (dataUrl) => {
    const mount = mountRef.current
    if (!mount) return
    setStatus('working')
    setMessage('Detecting walls, rooms and openings…')
    setDebugUrl(null)
    try {
      const res = await fetch('/api/floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, meters_per_pixel: metersPerPixel }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Request failed')

      clearBuilding()
      setItems([])
      setSelectedId(null)
      setScaleFactor(1)
      const building = buildBuilding(payload.model)
      groupRef.current = building
      const scene = mount.__scene
      scene.add(building)

      // Host the building under a pivot group so placed furniture can share its
      // coordinate space; Floor Up/Down tilt the camera view (see tiltView).
      const box = new THREE.Box3().setFromObject(building)
      const center = new THREE.Vector3()
      box.getCenter(center)
      const toCam = new THREE.Vector3().subVectors(mount.__camera.position, center)
      toCam.y = 0
      if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1)
      toCam.normalize()
      const pivot = new THREE.Group()
      pivot.position.set(center.x, box.min.y, toCam.z >= 0 ? box.max.z : box.min.z)
      scene.remove(building)
      building.position.set(
        building.position.x - pivot.position.x,
        building.position.y - pivot.position.y,
        building.position.z - pivot.position.z
      )
      pivot.add(building)
      scene.add(pivot)
      pivotRef.current = pivot

      frameGroup(mount.__camera, mount.__controls, building)
      setScaleFactor(building.userData.scaleFactor || 1)

      setDebugUrl(payload.debug)
      setInfo(payload.info)
      setStatus('done')
      const { walls, rooms, doors, windows, scaleSource } = payload.info
      setMessage(
        `Rendered ${walls} walls, ${rooms} rooms, ${doors} doors, ${windows} windows ` +
          `(scale: ${scaleSource}, ${payload.info.metersPerPixel} m/px). ` +
          'Pick a furniture below, then click inside the building to place it.'
      )
    } catch (err) {
      setStatus('error')
      setMessage(`Failed to build 3D model: ${err.message}`)
    }
  }

  const onFile = async (file) => {
    if (!file) return
    const dataUrl = await toDataURL(file)
    setImage({ dataUrl, name: file.name })
    setStatus('idle')
    setMessage(`${file.name} loaded — choose a scale, then click Build 3D.`)
    setInfo(null)
    setDebugUrl(null)
  }

  const onSample = async () => {
    try {
      const res = await fetch('/sample_floorplan.png')
      if (!res.ok) throw new Error('Sample image missing')
      const blob = await res.blob()
      const dataUrl = await toDataURL(blob)
      setImage({ dataUrl, name: 'sample_floorplan.png' })
      setStatus('idle')
      setMessage('Sample floor plan loaded — click Build 3D.')
      setInfo(null)
      setDebugUrl(null)
    } catch (err) {
      setStatus('error')
      setMessage(`Could not load sample: ${err.message}`)
    }
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

  return (
    <div className="editor floorplan">
      <header className="editor-header">
        <button className="back-btn" onClick={onBack}>← Home</button>
        <h1>Floor Plan → 3D</h1>
        <span className="item-count">
          {info
            ? `${info.rooms} rooms · ${info.doors} doors · ${info.windows} windows · ${items.length} furnitures`
            : status === 'working' ? 'Processing…' : ''}
        </span>
      </header>

      <div className="toolbar">
        {CATALOG.map((item, i) => (
          <button
            key={item.name}
            className={`tool ${activeTool === i ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === i ? null : i)}
            disabled={status !== 'done'}
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
          ▲ Up
        </button>
        <button
          className="tool"
          disabled={!selected}
          onClick={() => moveSelected(-0.3)}
          title="Move selected furniture down"
        >
          ▼ Down
        </button>
        <button className="tool danger" disabled={!selected} onClick={deleteSelected}>
          Delete
        </button>
        <button className="tool danger" disabled={items.length === 0} onClick={() => setItems([])}>
          Clear Furniture
        </button>
        <button className="tool" onClick={() => tiltView(-0.15)} title="Tilt the view upward">
          ⬆ Floor Up
        </button>
        <button className="tool" onClick={() => tiltView(0.15)} title="Tilt the view downward">
          ⬇ Floor Down
        </button>
      </div>

      <div className="fp-layout">
        <aside className="fp-panel">
          <label className="fp-upload">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <span className="fp-upload-icon">⬆</span>
            <span>Upload floor plan</span>
            <small>PNG / JPG</small>
          </label>

          <button className="tool fp-sample" onClick={onSample}>Load sample plan</button>

          {image && <img className="fp-preview" src={image.dataUrl} alt={image.name} />}

          <label className="fp-field">
            <span>Scale (meters per pixel)</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={metersPerPixel}
              onChange={(e) => setMetersPerPixel(parseFloat(e.target.value) || 0.05)}
            />
          </label>

          <button
            className="primary-btn fp-build"
            disabled={!image || status === 'working'}
            onClick={() => image && processImage(image.dataUrl)}
          >
            {status === 'working' ? 'Building…' : 'Build 3D'}
          </button>

          <div className={`fp-status ${status}`}>
            {status === 'working' && <div className="spinner" />}
            <p>{message}</p>
          </div>

          {debugUrl && (
            <label className="fp-check">
              <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />
              <span>Show detection overlay</span>
            </label>
          )}
        </aside>

        <div className="editor-canvas fp-canvas" ref={mountRef}>
          {showDebug && debugUrl && <img className="fp-debug" src={debugUrl} alt="Detection overlay" />}
        </div>
      </div>

      <div className="hint">
        {selected
          ? `Selected: ${CATALOG[selected.kind].name}. Drag it to move, use ⟲/⟳ above it to rotate, or use the toolbar to resize, raise, lower or delete it.`
          : activeTool !== null
            ? `Placing: ${CATALOG[activeTool].name}. Click inside the building to drop it. Click the button again to deselect.`
            : 'Upload a floor plan, click Build 3D, then pick a furniture from the toolbar and click inside the building to place it. Drag placed furniture to move it.'}
      </div>
    </div>
  )
}