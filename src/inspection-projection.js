import * as THREE from 'three';
import { FACES, normalOf } from './puzzle.js';

const faceIndices = new Map(FACES.map((face, index) => [face.normal.join(','), index]));
export const PROJECTION_OFFSET = 1.0;
export const PROJECTION_BACK_OFFSET = 0.65;
export const MAX_PROJECTION_DISTANCE = 2;
export const PROJECTION_OPACITY = 0.6;
export const clampProjectionOpacity = (value) =>
  Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : PROJECTION_OPACITY)) * 100) /
  100;
export const projectionDistance = (value, fallback) =>
  Math.round(
    Math.max(0, Math.min(MAX_PROJECTION_DISTANCE, Number.isFinite(value) ? value : fallback)) * 100,
  ) / 100;
const STICKER_INSET = 0.003;
const normals = FACES.map((face) => new THREE.Vector3(...face.normal).normalize());

// Offset the actual rear-face geometry along its outward normal. No screen-space
// flattening, inverse angle, or chosen hinge: this stays continuous through rolls
// and pole views, with exactly the same camera and projection as the puzzle.
export function projectionGeometry(size, state) {
  const faces = FACES.map((face) => ({
    positions: face.normal.flatMap((sign, axis) =>
      [0, 1, 2].map((i) => (i === axis ? 2 * sign : 0)),
    ),
    colors: [-1],
  }));
  for (const sticker of state) {
    const index = faceIndices.get(normalOf(sticker).join(',')),
      face = faces[index],
      normal = normals[index];
    const points = sticker.vertices.map((vertex) => vertex.map((value) => (value * 2) / size));
    const center = [0, 1, 2].map((axis) => points.reduce((sum, p) => sum + p[axis], 0) / 3);
    for (const point of points)
      face.positions.push(
        ...point.map(
          (value, axis) =>
            center[axis] +
            (value - center[axis]) * 0.935 -
            normal.getComponent(axis) * STICKER_INSET,
        ),
      );
    face.colors.push(sticker.color);
  }
  return faces;
}
export function projectionVisible(
  normal,
  cameraPosition,
  outward = PROJECTION_OFFSET,
  backward = PROJECTION_BACK_OFFSET,
) {
  // Hand over at the real puzzle face's plane, not at the centre hemisphere
  // or the displaced copy. This keeps hidden faces available in perspective,
  // but never shows a projection after the corresponding real face is visible.
  const radius = Math.hypot(...cameraPosition);
  if (!radius) return false;
  const eyePlane = normal.reduce((sum, n, i) => sum + n * cameraPosition[i], 0);
  const surfacePlane = 2 / Math.sqrt(3);
  if (eyePlane >= surfacePlane - 1e-8) return false;
  // At small outward / large backward distances the displaced sheet can turn
  // front-facing before the real one. Hide it then too, keeping its black backing
  // from facing the camera. The approved default distances retain the same cutoff.
  return eyePlane < surfacePlane + outward - STICKER_INSET - (backward * eyePlane) / radius - 1e-8;
}
export class InspectionProjection {
  constructor(
    scene,
    {
      outward = PROJECTION_OFFSET,
      backward = PROJECTION_BACK_OFFSET,
      opacity = PROJECTION_OPACITY,
    } = {},
  ) {
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.meshes = [];
    this.setDistances(outward, backward);
    this.setOpacity(opacity);
  }
  setDistances(outward, backward) {
    this.outward = projectionDistance(outward, PROJECTION_OFFSET);
    this.backward = projectionDistance(backward, PROJECTION_BACK_OFFSET);
    this.meshes.forEach((mesh, index) =>
      mesh.position.copy(normals[index]).multiplyScalar(this.outward),
    );
  }
  setOpacity(value) {
    this.opacity = clampProjectionOpacity(value);
    for (const mesh of this.meshes) {
      const transparent = this.opacity < 1;
      if (mesh.material.transparent !== transparent) {
        mesh.material.transparent = transparent;
        mesh.material.needsUpdate = true;
      }
      mesh.material.opacity = this.opacity;
      if (!this.opacity) mesh.visible = false;
    }
  }
  setVisible(visible) {
    this.root.visible = visible;
  }
  render({ size, state, colors, camera }) {
    if (!this.root.visible || !this.opacity) return;
    const palette = FACES.map((face) => colors[face.name]),
      key = palette.join(',');
    if (this.state !== state || this.size !== size || this.paletteKey !== key) {
      this.state = state;
      this.size = size;
      this.paletteKey = key;
      const paletteRGB = [
        new THREE.Color('#080e11'),
        ...palette.map((color) => new THREE.Color(color)),
      ];
      projectionGeometry(size, state).forEach((face, index) => {
        let mesh = this.meshes[index];
        if (!mesh) {
          mesh = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              depthWrite: true,
              opacity: this.opacity,
              transparent: this.opacity < 1,
              forceSinglePass: true,
            }),
          );
          mesh.position.copy(normals[index]).multiplyScalar(this.outward);
          mesh.frustumCulled = false;
          mesh.userData.face = index;
          this.meshes[index] = mesh;
          this.root.add(mesh);
        }
        const rgb = face.colors.flatMap((color) =>
          Array.from({ length: 3 }, () => paletteRGB[color + 1].toArray()).flat(),
        );
        // An inspection state is static between turns; orbiting only updates placement and visibility.
        if (mesh.geometry.getAttribute('position')?.count !== face.positions.length / 3) {
          mesh.geometry.dispose();
          mesh.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(face.positions, 3),
          );
          mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
          // Draw the ink first so its depth masks the black backing behind it. Each
          // pixel then receives opacity once, rather than darkening from two layers.
          mesh.geometry.setIndex([
            ...Array.from({ length: face.positions.length / 3 - 3 }, (_, i) => i + 3),
            0,
            1,
            2,
          ]);
        } else {
          mesh.geometry.attributes.position.array.set(face.positions);
          mesh.geometry.attributes.position.needsUpdate = true;
          mesh.geometry.attributes.color.array.set(rgb);
          mesh.geometry.attributes.color.needsUpdate = true;
        }
      });
    }
    // Move the whole set away from the viewer as well as spreading the faces
    // outward, exposing more of each rear face around the puzzle's silhouette.
    this.root.position.copy(camera.position).normalize().multiplyScalar(-this.backward);
    const position = camera.position.toArray();
    this.meshes.forEach((mesh, index) => {
      mesh.visible = projectionVisible(
        normals[index].toArray(),
        position,
        this.outward,
        this.backward,
      );
    });
  }
  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.root.removeFromParent();
  }
}
