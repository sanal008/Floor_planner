import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CATALOG, instantiate } from '../lib/models.js'

const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export default function RealtimePlacement({ onBack }) {
  const videoRef = useRef(null)
  const canvasWrapRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [activeTool, setActiveTool] = useState(null)
  const activeToolRef = useRef(null)
  activeToolRef.current = activeTool

  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const groupsRef = useRef(new Map())
  const dragRef = useRef(null)
  const selectedRef = useRef(null)
  selectedRef.current = selectedId
  const rotateRef = useRef(() => {})
  rotateRef.current = (delta) => {
    setItems((prev) =>
      prev.map((i) => (i.id === selectedRef.current ? { ...i, rot: (i.rot || 0) + delta } : i))
    )
  }

  const startCamera = async () => {
    setStatus('starting')
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera access is not available here. Open the app via HTTPS or http://localhost.'
        )
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      const video = videoRef.current
      if (!video) return
      video.muted = true
      video.srcObject = stream
      await video.play()
      setStatus('live')
    } catch (err) {
      console.error('Camera error:', err)
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera permission for this site, then try again.'
          : `Camera could not be started: ${err?.message || 'Unknown error'}`
      )
      setStatus('error')
    }
  }

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop())
    videoRef.current.srcObject = null
    setItems([])
    setSelectedId(null)
    setStatus('idle')
  }

  // Build the transparent 3D overlay once
  useEffect(() => {
    const wrap = canvasWrapRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(65, wrap.clientWidth / wrap.clientHeight, 0.01, 20)
    camera.position.set(0, 1.6, 0)
    camera.lookAt(0, 0, -3)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.className = 'realtime-canvas'
    wrap.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(1, 2, 1)
    scene.add(dir)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    const clampFloor = (point) => {
      point.x = Math.max(-9, Math.min(9, point.x))
      point.z = Math.max(-14, Math.min(-0.8, point.z))
      return point
    }

    const activePointers = new Map()

    const itemScreenAngle = (e, group) => {
      const rect = renderer.domElement.getBoundingClientRect()
      const base = group.getWorldPosition(new THREE.Vector3())
      base.project(camera)
      const sx = (base.x * 0.5 + 0.5) * renderer.domElement.clientWidth
      const sy = (-base.y * 0.5 + 0.5) * renderer.domElement.clientHeight
      return Math.atan2(e.clientY - rect.top - sy, e.clientX - rect.left - sx)
    }

    const fingerAngle = () => {
      const [a, b] = [...activePointers.values()]
      return Math.atan2(b.y - a.y, b.x - a.x)
    }

    const onPointerDown = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      renderer.domElement.setPointerCapture(e.pointerId)
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      const groups = groupsRef.current
      const hits = raycaster.intersectObjects([...groups.values()].map((r) => r.group), true)
      if (hits.length) {
        let obj = hits[0].object
        while (obj.parent && !groups.has(obj.userData.ownerId)) obj = obj.parent
        if (groups.has(obj.userData.ownerId)) {
          const id = obj.userData.ownerId
          const rec = groups.get(id)
          setSelectedId(id)
          if (e.button === 2 || activePointers.size === 2) {
            // Right-button drag, or two-finger touch, rotates only.
            dragRef.current = rec?.group
              ? {
                  type: 'rotate',
                  id,
                  lastAngle:
                    activePointers.size === 2 ? fingerAngle() : itemScreenAngle(e, rec.group),
                }
              : { type: 'rotate', id, lastAngle: 0 }
          } else {
            // Left-drag: no drag-move. Moving the mouse right/left spins the
            // piece around Y and up/down tilts it around X. Use the Move
            // buttons to reposition it.
            dragRef.current = rec?.group
              ? { type: 'move', id, lastX: e.clientX, lastY: e.clientY }
              : null
          }
          return
        }
      }

      if (activeToolRef.current === null) {
        setSelectedId(null)
        return
      }
      const floorPoint = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(DRAG_PLANE, floorPoint)) return
      clampFloor(floorPoint)
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: activeToolRef.current, x: floorPoint.x, z: floorPoint.z, rot: 0, scale: 1 },
      ])
      setSelectedId(null)
    }

    const onPointerMove = (e) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!dragRef.current) return
      const drag = dragRef.current
      const rec = groupsRef.current.get(drag.id)
      if (!rec?.group) return

      if (drag.type === 'move') {
        if (drag.lastX === undefined) return
        const dx = e.clientX - drag.lastX
        const dy = e.clientY - drag.lastY
        drag.lastX = e.clientX
        drag.lastY = e.clientY
        rec.group.rotation.y += dx * 0.01
        rec.group.rotation.x = THREE.MathUtils.clamp(
          rec.group.rotation.x + dy * 0.01,
          -1.2,
          1.2
        )
        setItems((prev) =>
          prev.map((i) =>
            i.id === drag.id
              ? { ...i, rot: rec.group.rotation.y, tilt: rec.group.rotation.x }
              : i
          )
        )
        return
      }

      const angle =
        activePointers.size === 2 ? fingerAngle() : itemScreenAngle(e, rec.group)
      let delta = angle - drag.lastAngle
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      rec.group.rotation.y += delta
      drag.lastAngle = angle
      setItems((prev) =>
        prev.map((i) => (i.id === drag.id ? { ...i, rot: rec.group.rotation.y } : i))
      )
    }

    const onPointerUp = (e) => {
      activePointers.delete(e.pointerId)
      dragRef.current = null
    }

    const el = renderer.domElement
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    const onContextMenu = (e) => e.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)

    let raf
    const animate = () => {
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      camera.aspect = wrap.clientWidth / wrap.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('contextmenu', onContextMenu)
      for (const rec of groupsRef.current.values()) {
        scene.remove(rec.group)
        rec.group.traverse((o) => o.geometry && o.geometry.dispose())
      }
      groupsRef.current.clear()
      sceneRef.current = null
      cameraRef.current = null
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
  }, [])

  // Sync placed items into the 3D scene
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    let cancelled = false

    const wanted = new Set(items.map((i) => i.id))
    for (const [id, rec] of groupsRef.current) {
      if (!wanted.has(id)) {
        scene.remove(rec.group)
        rec.group.traverse((o) => o.geometry && o.geometry.dispose())
        groupsRef.current.delete(id)
      }
    }

    for (const item of items) {
      let rec = groupsRef.current.get(item.id)
      if (!rec) {
        rec = { group: null, kind: item.kind }
        groupsRef.current.set(item.id, rec)
        instantiate(CATALOG[item.kind]).then((group) => {
          if (cancelled || !groupsRef.current.has(item.id)) return
          group.position.set(item.x, item.y || 0, item.z)
          group.rotation.y = item.rot || 0
          group.rotation.x = item.tilt || 0
          group.scale.setScalar(item.scale || 1)
          group.traverse((o) => {
            o.userData.ownerId = item.id
          })
          rec.group = group
          scene.add(group)
        })
      } else if (rec.group) {
        rec.group.position.set(item.x, item.y || 0, item.z)
        rec.group.rotation.y = item.rot || 0
        rec.group.rotation.x = item.tilt || 0
        rec.group.scale.setScalar(item.scale || 1)
      }
    }

    return () => {
      cancelled = true
    }
  }, [items])

  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const placeItem = (kind) => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind, x: 0, z: -2.5, rot: 0, scale: 1 },
    ])
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

  const visibleYRange = (itemX, itemZ) => {
    const camera = cameraRef.current
    if (!camera) return { min: -3, max: 5 }
    const projY = (y) => new THREE.Vector3(itemX, y, itemZ).project(camera).y
    const solve = (target, lo, hi) => {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (projY(mid) > target) hi = mid
        else lo = mid
      }
      return (lo + hi) / 2
    }
    return { min: solve(-1, -6, 6), max: solve(1, -6, 6) }
  }

  const moveSelected = (axis, delta) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== selectedId) return i
        if (axis === 'x') {
          return { ...i, x: Math.max(-9, Math.min(9, (i.x || 0) + delta)) }
        }
        if (axis === 'z') {
          return { ...i, z: Math.max(-14, Math.min(-0.8, (i.z || 0) + delta)) }
        }
        const { min, max } = visibleYRange(i.x || 0, i.z || 0)
        return { ...i, y: Math.max(min, Math.min(max, (i.y || 0) + delta)) }
      })
    )
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setItems((prev) => prev.filter((i) => i.id !== selectedId))
    setSelectedId(null)
  }

  const selectedItem = items.find((i) => i.id === selectedId)

  return (
    <div className="realtime">
      <header className="rt-header">
        <div className="rt-header-left">
          <button className="back-btn" onClick={onBack}>← Home</button>
          <div className="rt-brand">
            <span className="rt-brand-mark">AR</span>
            <div>
              <h1>Real-time Placement</h1>
              <p className="rt-subhead">Preview furniture in your real room</p>
            </div>
          </div>
        </div>
        <div className="rt-header-right">
          {selectedItem && <span className="rt-chip rt-selected">Selected · {selectedItem.kind}</span>}
          <span className="rt-count">{items.length} placed</span>
          {status === 'live' && (
            <span className="rt-chip rt-live">
              <span className="rt-dot" /> LIVE
            </span>
          )}
        </div>
      </header>

      <section className={`rt-stage${status === 'live' ? ' live' : ''}`} ref={canvasWrapRef}>
        <video className="camera-feed" ref={videoRef} autoPlay playsInline muted />

        {status !== 'live' ? (
          <div className="rt-overlay">
            <div className="rt-overlay-art">
              {status === 'starting' ? (
                <div className="spinner" />
              ) : (
                <>
                  <div className="rt-ring" />
                  <span className="rt-lens">◎</span>
                </>
              )}
            </div>
            <h2>{status === 'error' ? 'Camera unavailable' : 'Ready to place furniture'}</h2>
            <p>
              {status === 'error'
                ? error
                : 'Point your camera at the room to map virtual furniture onto your real space in real time.'}
            </p>
            {status !== 'starting' && (
              <button className="primary-btn" onClick={startCamera}>
                <span className="cam-icon" /> Enable Camera
              </button>
            )}
          </div>
        ) : (
          <div className="rt-hud">
            <span className="rt-chip rt-live">
              <span className="rt-dot" /> LIVE
            </span>
            <span className="rt-chip">{items.length} items</span>
          </div>
        )}
      </section>

      {status === 'live' && (
        <div className="rt-deck">
          <div className="rt-group">
            <span className="rt-group-label">Furniture</span>
            <div className="rt-catalog">
              {CATALOG.map((item, i) => (
                <button
                  key={item.name}
                  className={`rt-tile ${activeTool === i ? 'active' : ''}`}
                  onClick={() => setActiveTool(activeTool === i ? null : i)}
                >
                  <span className="rt-tile-swatch" style={{ background: `#${item.color.toString(16).padStart(6, '0')}` }} />
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="rt-group">
            <span className="rt-group-label">Transform</span>
            <div className="rt-buttons">
              <button className="rt-btn" disabled={!selectedId} onClick={() => rotateRef.current(-Math.PI / 6)} title="Rotate left">⟲</button>
              <button className="rt-btn" disabled={!selectedId} onClick={() => rotateRef.current(Math.PI / 6)} title="Rotate right">⟳</button>
              <button className="rt-btn" disabled={!selectedId} onClick={() => resizeSelected(0.9)} title="Make smaller">−</button>
              <button className="rt-btn" disabled={!selectedId} onClick={() => resizeSelected(1.1)} title="Make larger">+</button>
            </div>
          </div>

          <div className="rt-group">
            <span className="rt-group-label">Move</span>
            <div className="rt-dpad">
              <button className="rt-btn rt-btn-up" disabled={!selectedId} onClick={() => moveSelected('y', 0.3)} title="Move up">▲</button>
              <button className="rt-btn rt-btn-left" disabled={!selectedId} onClick={() => moveSelected('x', -0.5)} title="Move left">◀</button>
              <button className="rt-btn rt-btn-down" disabled={!selectedId} onClick={() => moveSelected('y', -0.3)} title="Move down">▼</button>
              <button className="rt-btn rt-btn-right" disabled={!selectedId} onClick={() => moveSelected('x', 0.5)} title="Move right">▶</button>
            </div>
            <div className="rt-move-row">
              <button className="rt-btn rt-move-wide" disabled={!selectedId} onClick={() => moveSelected('z', -0.5)} title="Move forward">⤒ Forward</button>
              <button className="rt-btn rt-move-wide" disabled={!selectedId} onClick={() => moveSelected('z', 0.5)} title="Move backward">⤓ Backward</button>
            </div>
          </div>

          <div className="rt-group rt-group-actions">
            <span className="rt-group-label">Actions</span>
            <div className="rt-buttons">
              <button className="rt-btn danger" disabled={!selectedId} onClick={deleteSelected} title="Delete selected">🗑</button>
              <button className="rt-btn danger" onClick={() => { setItems([]); setSelectedId(null) }} title="Clear all">Clear</button>
              <button className="rt-btn danger solid" onClick={stopCamera} title="Stop camera">■ Stop</button>
            </div>
          </div>
        </div>
      )}

      <div className="rt-statusbar">
        <span className="rt-hint">
          {status === 'live'
            ? 'Pick a furniture tile, then tap the camera to place it · drag to rotate it · use the arrows to move it · +/− to resize'
            : 'Allow camera access to start previewing furniture.'}
        </span>
      </div>
    </div>
  )
}