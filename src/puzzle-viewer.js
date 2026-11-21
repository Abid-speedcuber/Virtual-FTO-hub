import * as THREE from 'three';
import { FACES, solvedState } from './puzzle.js';
import { ViewControls } from './view-controls.js';
import { PuzzleMeshes } from './puzzle-meshes.js';
import { HOME_POSITION } from './orientation.js';

// A self-contained viewer for checkpoint editing and recorded solves.
export class PuzzleViewer {
  constructor(host, { onSelect = null } = {}) {
    this.host = host;
    this.onSelect = onSelect;
    this.size = 3;
    this.state = solvedState(3);
    this.selection = null;
    this.meshes = [];
    this.scene = new THREE.Scene();
    this.bodies = [];
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.copy(HOME_POSITION).multiplyScalar(0.78);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      onSelect ? 'Orbitable FTO. Drag to orbit; click a piece to select it.' : 'Recorded FTO solve',
    );
    this.materials = FACES.map(
      (face) =>
        new THREE.MeshBasicMaterial({
          color: face.color,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
    );
    this.bodyMaterial = new THREE.MeshBasicMaterial({ color: '#080e11', side: THREE.DoubleSide });
    this.geometry = new PuzzleMeshes(this.scene, this.materials, this.bodyMaterial, { gap: 0.93 });
    this.controls = new ViewControls(this.camera, this.renderer.domElement, { mode: 'legacy' });
    this.controls.addEventListener('change', () => this.draw());
    this.controls.addEventListener('tap', (event) => {
      if (!this.onSelect) return;
      const box = this.renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.x - box.left) / box.width) * 2 - 1,
          (-(event.y - box.top) / box.height) * 2 + 1,
        ),
        this.camera,
      );
      // Pick full sticker triangles, so the decorative gaps are still clickable.
      const point = new THREE.Vector3();
      let picked = null,
        distance = Infinity;
      for (const sticker of this.state) {
        const vertices = sticker.vertices.map((v) =>
          new THREE.Vector3(...v).multiplyScalar(2 / this.size),
        );
        if (ray.ray.intersectTriangle(...vertices, false, point)) {
          const d = point.distanceToSquared(ray.ray.origin);
          if (d < distance) {
            distance = d;
            picked = sticker.id;
          }
        }
      }
      if (picked !== null) this.onSelect(picked);
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.draw();
  }
  setView(view) {
    if (!view) return;
    this.controls.rotation.fromArray(view.rotation);
    this.controls.radius = view.radius;
    this.controls.update();
  }
  view() {
    return { rotation: this.controls.rotation.toArray(), radius: this.controls.radius };
  }
  face(normal) {
    const target = new THREE.Vector3(...normal).normalize().multiplyScalar(10);
    this.controls.setPosition(target);
  }
  setPuzzle(size, state = solvedState(size), selection = null, motions = []) {
    this.size = size;
    this.state = state;
    this.selection = selection;
    this.render(motions);
  }
  // Apply puzzle and camera together, then submit exactly one WebGL render.
  setFrame(size, state, selection, motions, view) {
    this.batching = true;
    try {
      this.setPuzzle(size, state, selection, motions);
      this.setView(view);
    } finally {
      this.batching = false;
    }
    this.draw();
  }
  render(motions = []) {
    this.materials.forEach((material, i) => material.color.set(this.colors?.[i] ?? FACES[i].color));
    this.geometry.update(
      this.size,
      this.state,
      motions.map((m) => m.move),
      this.selection,
    );
    this.geometry.refreshDimColors();
    this.geometry.rotate((band) =>
      band.turns.reduce((angle, t) => {
        const motion = motions[t.index],
          p = motion.progress;
        return angle - ((t.sign * motion.move.dir * 2 * Math.PI) / 3) * p * p * (3 - 2 * p);
      }, 0),
    );
    this.bodies = this.geometry.bodies;
    this.meshes = this.geometry.pool;
    this.draw();
  }
  draw() {
    if (!this.batching) this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.controls.cancelAll();
    this.observer.disconnect();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.bodyMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.host.replaceChildren();
  }
}

// Stickers on different faces sharing an outside edge belong to one piece.
export function pieceGroups(size) {
  const state = solvedState(size),
    parent = state.map((s) => s.id),
    edges = new Map(),
    root = (id) => (parent[id] === id ? id : (parent[id] = root(parent[id])));
  for (const s of state)
    for (let i = 0; i < 3; i++) {
      const key = [s.vertices[i].join(','), s.vertices[(i + 1) % 3].join(',')].sort().join('|');
      const other = edges.get(key);
      if (other && other.color !== s.color) parent[root(s.id)] = root(other.id);
      else if (!other) edges.set(key, s);
    }
  const groups = new Map();
  for (const s of state) {
    const id = root(s.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(s.id);
  }
  return new Map(state.map((s) => [s.id, groups.get(root(s.id))]));
}
