import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ThreeBackground() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(0, 2.4, 9)
    camera.lookAt(0, 1, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const room = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 0.4),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.04,
        roughness: 0.9,
        metalness: 0.1,
      })
    )
    room.position.set(0, 2, -2.5)
    scene.add(room)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 5),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.05,
        roughness: 0.8,
        side: THREE.DoubleSide,
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.02, -0.5)
    scene.add(floor)

    const materials = [
      new THREE.MeshPhysicalMaterial({ color: 0x8b5cf6, metalness: 0.4, roughness: 0.35 }),
      new THREE.MeshPhysicalMaterial({ color: 0x6366f1, metalness: 0.4, roughness: 0.35 }),
      new THREE.MeshPhysicalMaterial({ color: 0x06b6d4, metalness: 0.4, roughness: 0.35 }),
      new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.35 }),
    ]

    const shapes = []
    const addShape = (geometry, matIndex, pos, rotSpeed, drift) => {
      const mesh = new THREE.Mesh(geometry, materials[matIndex])
      mesh.position.copy(pos)
      mesh.castShadow = true
      scene.add(mesh)
      shapes.push({ mesh, rotSpeed, drift, baseY: pos.y, phase: Math.random() * Math.PI * 2 })
    }

    addShape(new THREE.BoxGeometry(1.1, 0.55, 1.1), 0, new THREE.Vector3(-2.4, 0.35, 0.2), 0.4, 0.35)
    addShape(new THREE.BoxGeometry(1.7, 0.35, 0.9), 1, new THREE.Vector3(-2.4, 1.05, 0.2), -0.3, 0.45)
    addShape(new THREE.BoxGeometry(0.5, 1.9, 0.5), 2, new THREE.Vector3(2.3, 1.05, -0.2), 0.5, 0.3)
    addShape(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 32), 3, new THREE.Vector3(2.3, 2.0, -0.2), 0.6, 0.5)
    addShape(new THREE.BoxGeometry(0.8, 0.8, 0.8), 1, new THREE.Vector3(0.6, 0.4, 1.4), 0.35, 0.4)
    addShape(new THREE.BoxGeometry(0.15, 0.15, 0.5), 2, new THREE.Vector3(-0.3, 0.9, 1.2), 0.5, 0.3)
    addShape(new THREE.BoxGeometry(0.15, 0.15, 0.5), 3, new THREE.Vector3(1.1, 0.5, 1.0), -0.45, 0.4)

    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(3, 5, 4)
    scene.add(key)

    const accent = new THREE.PointLight(0x8b5cf6, 2.2, 12)
    accent.position.set(-3, 2, 2)
    scene.add(accent)

    const accent2 = new THREE.PointLight(0x06b6d4, 1.8, 12)
    accent2.position.set(3, 1, 2)
    scene.add(accent2)

    const clock = new THREE.Clock()
    let raf
    const animate = () => {
      const t = clock.getElapsedTime()
      for (const s of shapes) {
        s.mesh.rotation.y += s.rotSpeed * 0.008
        s.mesh.position.y = s.baseY + Math.sin(t * 0.8 + s.phase) * s.drift * 0.25
      }
      accent.position.x = Math.sin(t * 0.5) * 3
      accent2.position.x = Math.cos(t * 0.45) * 3
      renderer.render(scene, camera)
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
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="three-bg" ref={mountRef} />
}