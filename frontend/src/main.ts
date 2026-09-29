/** PROCity application controller: wires backend stream, city, and UI. */
import * as THREE from 'three'
import type { FilterKind, Metric, ProcessInfo, Snapshot, SortKey } from './types'
import { ApiClient } from './services/api'
import { City } from './scene/City'
import { CameraRig } from './scene/CameraRig'
import { Environment } from './scene/Environment'
import { Interaction } from './scene/Interaction'
import { HUD } from './ui/HUD'
import { ProcessPanel } from './ui/ProcessPanel'
import { Search } from './ui/Search'
import { Filters, TopList } from './ui/Filters'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)

const scene = new THREE.Scene()
const env = new Environment(scene)
const rig = new CameraRig(canvas, innerWidth / innerHeight)
const city = new City()
scene.add(city.group)

// -------- UI --------
const hud = new HUD()
const panel = new ProcessPanel()
const search = new Search()
const filters = new Filters()
const toplists = new TopList()

filters.root.prepend(search.root)

// -------- state --------
let metric: Metric = 'mem'
let filter: FilterKind = 'all'
let sort: SortKey = 'cpu'
let currentUid: number | null = null
let selected: string | null = null
let lastProcs: ProcessInfo[] = []
let lastDemo = false

function select(identity: string | null) {
  selected = identity
  city.setSelected(identity)
  const b = city.getBuilding(identity)
  if (b) panel.show(b.data)
  else panel.root.classList.remove('open')
}

function focusBuilding(identity: string) {
  const fp = city.focusPoint(identity)
  if (!fp) return
  select(identity)
  rig.focusOn(fp.pos, fp.height)
}

panel.onFocus = focusBuilding
panel.onClose = () => {
  selected = null
  city.setSelected(null)
}
search.onPick = (id) => focusBuilding(id)
toplists.onPick = (id) => focusBuilding(id)
filters.onMetric = (m) => {
  metric = m
  city.setMetric(m)
  applySnapshot(lastSnapshot!, true)
}
filters.onFilter = (f) => {
  filter = f
  applySnapshot(lastSnapshot!, true)
}
filters.onSort = (s) => {
  sort = s
  refreshLists()
}
filters.onResetCamera = () => {
  rig.reset()
  select(null)
}

// -------- data flow --------
const api = new ApiClient()
let lastSnapshot: Snapshot | null = null

api.onStatus = (s) => hud.setStatus(s)

api.onSnapshot = (snap) => {
  lastSnapshot = snap
  applySnapshot(snap, false)
}

function applySnapshot(snap: Snapshot, reapply: boolean) {
  lastProcs = snap.processes
  lastDemo = snap.demo
  if (reapply) city.setFilter(filter, currentUid)
  city.update(snap)
  hud.update(snap)
  search.setProcesses(snap.processes)
  refreshLists()
  // Keep the open details panel in sync; hide it if the process died.
  if (selected) {
    const b = city.getBuilding(selected)
    if (b) panel.show(b.data)
    else if (!reapply) select(null)
  }
}

function refreshLists() {
  toplists.update(lastProcs, filter, sort, currentUid, selected)
}

// -------- picking --------
new Interaction(canvas, rig.camera, city, {
  onSelect: (id) => select(id),
  onFocus: (id) => focusBuilding(id),
  onHover: (id) => {
    canvas.style.cursor = id ? 'pointer' : ''
    city.setHovered(id)
  },
})

// -------- resize --------
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  rig.resize(innerWidth / innerHeight)
})

// -------- render loop (rendering is decoupled from 1 Hz monitoring) --------
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.elapsedTime
  city.tick(dt, t)
  rig.tick(dt)
  const b = city.getBuilding(selected)
  if (b) env.updateBeacon(b.x, b.z, b.hCur, t)
  else env.updateBeacon(null, null, 0, t)
  renderer.render(scene, rig.camera)
}

api.start()
animate()

// Debug/test hook (harmless in production).
;(window as unknown as Record<string, unknown>).__procity = { city, rig, select, focusBuilding }
