import fs from 'fs'
import * as THREE from 'three'
import { buildBuilding } from './src/lib/building.js'

const res = await fetch('http://localhost:5000/api/floorplan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: 'data:image/png;base64,' + fs.readFileSync('D:/Aromal/three.js/sample_floorplan.png').toString('base64'),
    meters_per_pixel: 0.05,
  }),
})
const { model } = await res.json()

const scene = new THREE.Scene()
const building = buildBuilding(model)
scene.add(building)
scene.updateMatrixWorld(true)

const bbox0 = new THREE.Box3().setFromObject(building)
console.log('before:', bbox0.min.toArray().map((v) => +v.toFixed(2)).join(','), '->', bbox0.max.toArray().map((v) => +v.toFixed(2)).join(','))

building.rotation.x = -0.15
scene.updateMatrixWorld(true)
const bbox1 = new THREE.Box3().setFromObject(building)
console.log('after -0.15:', bbox1.min.toArray().map((v) => +v.toFixed(2)).join(','), '->', bbox1.max.toArray().map((v) => +v.toFixed(2)).join(','))

building.rotation.x = 0.15
scene.updateMatrixWorld(true)
const bbox2 = new THREE.Box3().setFromObject(building)
console.log('after +0.15:', bbox2.min.toArray().map((v) => +v.toFixed(2)).join(','), '->', bbox2.max.toArray().map((v) => +v.toFixed(2)).join(','))

const changed = Math.abs(bbox1.min.y - bbox0.min.y) > 0.01 || Math.abs(bbox1.max.y - bbox0.max.y) > 0.01
console.log('rotation visibly changes bbox:', changed ? 'YES' : 'NO')