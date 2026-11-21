import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FACES, solvedState, applyMove, scrambleMoves, normalOf } from '../src/puzzle.js';
import {
  PROJECTION_OFFSET,
  PROJECTION_BACK_OFFSET,
  projectionGeometry,
  projectionVisible,
  InspectionProjection,
} from '../src/inspection-projection.js';
const normals = FACES.map((face) => new THREE.Vector3(...face.normal).normalize());
test('rear projection preserves actual sticker geometry and colors on sizes 2 through 20', () => {
  let seed = 327;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let size = 2; size <= 20; size++) {
    const state = scrambleMoves(20, random, size).reduce(applyMove, solvedState(size)),
      faces = projectionGeometry(size, state);
    assert.equal(faces.length, 8);
    faces.forEach((face, index) => {
      assert.equal(face.positions.length, (size * size + 1) * 9);
      assert.equal(face.colors.length, size * size + 1);
      assert.equal(face.colors[0], -1);
      assert.ok(face.positions.every(Number.isFinite));
      const stickers = state.filter((s) =>
        normalOf(s).every((n, i) => n === FACES[index].normal[i]),
      );
      stickers.forEach((sticker, i) => {
        assert.equal(face.colors[i + 1], sticker.color);
        const points = sticker.vertices.map((p) =>
            new THREE.Vector3(...p).multiplyScalar(2 / size),
          ),
          center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(3);
        points.forEach((point, vertex) => {
          point
            .sub(center)
            .multiplyScalar(0.935)
            .add(center)
            .addScaledVector(normals[index], -0.003);
          const actual = new THREE.Vector3().fromArray(face.positions, (i + 1) * 9 + vertex * 3);
          assert.ok(point.distanceTo(actual) < 1e-12);
        });
      });
      // Every hint lies outside the original surface, on a separate convex shell.
      // The face patches cannot intersect one another or pierce the main puzzle.
      for (let vertex = 0; vertex < face.positions.length; vertex += 3) {
        const world = new THREE.Vector3()
          .fromArray(face.positions, vertex)
          .addScaledVector(normals[index], PROJECTION_OFFSET);
        assert.ok(world.dot(normals[index]) > 2 / Math.sqrt(3) + PROJECTION_OFFSET - 0.01);
        for (const normal of normals)
          assert.ok(world.dot(normal) <= 2 / Math.sqrt(3) + PROJECTION_OFFSET + 1e-12);
      }
    });
  }
});
test('hard cutoff hands over at the real face plane without duplicate visible faces', () => {
  const positions = [
      [6, 0, 0],
      [0, 0, 20],
      [0, -6, 0],
      [2, 4, -4],
    ],
    state = solvedState(3);
  for (let i = 0; i < 4096; i++) {
    const y = 1 - (2 * (i + 0.5)) / 4096,
      a = i * Math.PI * (3 - Math.sqrt(5)),
      r = 6 + (14 * (i % 17)) / 16;
    positions.push([
      Math.sqrt(1 - y * y) * Math.cos(a) * r,
      y * r,
      Math.sqrt(1 - y * y) * Math.sin(a) * r,
    ]);
  }
  const surfacePoints = normals.map((_, index) =>
    new THREE.Vector3(
      ...state.find((sticker) => normalOf(sticker).every((v, i) => v === FACES[index].normal[i]))
        .vertices[0],
    ).multiplyScalar(2 / 3),
  );
  for (const position of positions)
    normals.forEach((normal, index) => {
      const eye = new THREE.Vector3(...position),
        realFaceFacing = normal.dot(eye.clone().sub(surfacePoints[index]));
      assert.equal(projectionVisible(normal.toArray(), position), realFaceFacing < -1e-8);
      if (realFaceFacing >= 0) assert.equal(projectionVisible(normal.toArray(), position), false);
    });
  assert.equal(projectionVisible(normals[0].toArray(), [0, 0, 0]), false);
  const hints = projectionGeometry(3, state);
  normals.forEach((normal, index) => {
    const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    for (const radius of [6, 10, 20]) {
      const cutoffCos = normal.dot(surfacePoints[index]) / radius;
      const eye = (cos) =>
        normal
          .clone()
          .multiplyScalar(cos)
          .addScaledVector(tangent, Math.sqrt(1 - cos * cos))
          .multiplyScalar(radius);
      assert.equal(projectionVisible(normal.toArray(), eye(0).toArray()), true);
      assert.equal(projectionVisible(normal.toArray(), eye(cutoffCos - 0.0001).toArray()), true);
      assert.equal(projectionVisible(normal.toArray(), eye(cutoffCos).toArray()), false);
      assert.equal(projectionVisible(normal.toArray(), eye(cutoffCos + 0.0001).toArray()), false);
      // Regression: the offset sheet is still back-facing, but the real face is
      // already visible. Showing both produced the duplicate face in the screenshot.
      const duplicateEye = eye(cutoffCos + 0.02),
        onHint = new THREE.Vector3()
          .fromArray(hints[index].positions, 9)
          .addScaledVector(normal, PROJECTION_OFFSET)
          .addScaledVector(duplicateEye.clone().normalize(), -PROJECTION_BACK_OFFSET);
      assert.ok(normal.dot(duplicateEye.clone().sub(onHint)) < 0);
      assert.ok(normal.dot(duplicateEye.clone().sub(surfacePoints[index])) > 0);
      assert.equal(projectionVisible(normal.toArray(), duplicateEye.toArray()), false);
    }
  });
});
test('orbiting reuses buffers, changing colors updates them, and disabled projection does no work', () => {
  const scene = new THREE.Scene(),
    projection = new InspectionProjection(scene),
    camera = new THREE.PerspectiveCamera(),
    state = solvedState(4),
    colors = Object.fromEntries(FACES.map((f) => [f.name, f.color]));
  projection.render({ size: 4, state, colors, camera });
  assert.equal(projection.meshes.length, 0);
  projection.setVisible(true);
  camera.position.set(5, 6, 7);
  projection.render({ size: 4, state, colors, camera });
  const versions = projection.meshes.map((mesh) => mesh.geometry.attributes.position.version);
  for (let i = 0; i < 100; i++) {
    camera.position.set(Math.cos(i * 0.1) * 10, 3, Math.sin(i * 0.1) * 10);
    projection.render({ size: 4, state, colors, camera });
  }
  assert.deepEqual(
    projection.meshes.map((mesh) => mesh.geometry.attributes.position.version),
    versions,
  );
  assert.equal(projection.meshes.length, 8);
  assert.ok(
    projection.root.position
      .clone()
      .addScaledVector(camera.position.clone().normalize(), PROJECTION_BACK_OFFSET)
      .length() < 1e-12,
  );
  for (const mesh of projection.meshes) {
    assert.ok(Math.abs(mesh.position.length() - PROJECTION_OFFSET) < 1e-12);
    assert.equal(mesh.material.opacity, 0.6);
    assert.equal(mesh.material.transparent, true);
  }
  projection.render({ size: 4, state, colors: { ...colors, U: '#123456' }, camera });
  const expected = new THREE.Color('#123456'),
    actual = projection.meshes[0].geometry.attributes.color;
  assert.ok(Math.abs(actual.getX(3) - expected.r) < 1e-6);
  projection.setVisible(false);
  assert.equal(projection.root.visible, false);
  projection.dispose();
  assert.equal(scene.children.length, 0);
});
test('adjustable distances clamp invalid values, reuse buffers and keep front-facing sheets hidden', () => {
  const scene = new THREE.Scene(),
    projection = new InspectionProjection(scene),
    camera = new THREE.PerspectiveCamera(),
    state = solvedState(3),
    colors = Object.fromEntries(FACES.map((face) => [face.name, face.color]));
  projection.setVisible(true);
  camera.position.set(5, 6, 7);
  projection.render({ size: 3, state, colors, camera });
  const versions = projection.meshes.map((mesh) => mesh.geometry.attributes.position.version);
  for (const [outward, backward] of [
    [0, 0],
    [0, 2],
    [0.01, 2],
    [2, 0],
    [2, 2],
    [1, 0.65],
  ]) {
    projection.setDistances(outward, backward);
    for (let i = 0; i < 64; i++) {
      camera.position
        .set(Math.cos(i * 0.37), Math.sin(i * 0.59), Math.sin(i * 0.37))
        .normalize()
        .multiplyScalar(6 + (i % 15));
      projection.render({ size: 3, state, colors, camera });
      assert.ok(Math.abs(projection.root.position.length() - backward) < 1e-12);
      projection.meshes.forEach((mesh, index) => {
        assert.ok(Math.abs(mesh.position.length() - outward) < 1e-12);
        if (!mesh.visible) return;
        const normal = normals[index],
          realPlane = 2 / Math.sqrt(3);
        assert.ok(normal.dot(camera.position) < realPlane);
        const coloredPoint = new THREE.Vector3()
          .fromBufferAttribute(mesh.geometry.attributes.position, 3)
          .add(mesh.position)
          .add(projection.root.position);
        assert.ok(normal.dot(camera.position.clone().sub(coloredPoint)) < 0);
      });
    }
  }
  assert.deepEqual(
    projection.meshes.map((mesh) => mesh.geometry.attributes.position.version),
    versions,
  );
  projection.setDistances(-100, 100);
  assert.equal(projection.outward, 0);
  assert.equal(projection.backward, 2);
  projection.setDistances(NaN, Infinity);
  assert.equal(projection.outward, PROJECTION_OFFSET);
  assert.equal(projection.backward, PROJECTION_BACK_OFFSET);
  projection.dispose();
});
test('opacity updates and clamps without rebuilding geometry, and zero opacity skips rendering', () => {
  const scene = new THREE.Scene(),
    projection = new InspectionProjection(scene, { opacity: 0 }),
    camera = new THREE.PerspectiveCamera(),
    state = solvedState(3),
    colors = Object.fromEntries(FACES.map((face) => [face.name, face.color]));
  projection.setVisible(true);
  camera.position.set(5, 6, 7);
  projection.render({ size: 3, state, colors, camera });
  assert.equal(projection.meshes.length, 0);
  projection.setOpacity(0.45);
  projection.render({ size: 3, state, colors, camera });
  const positions = projection.meshes.map((mesh) => mesh.geometry.attributes.position),
    versions = positions.map((attribute) => attribute.version);
  for (const mesh of projection.meshes) {
    assert.equal(mesh.material.opacity, 0.45);
    assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.forceSinglePass, true);
  }
  projection.setOpacity(1);
  projection.render({ size: 3, state, colors, camera });
  for (const mesh of projection.meshes) {
    assert.equal(mesh.material.opacity, 1);
    assert.equal(mesh.material.transparent, false);
  }
  assert.deepEqual(
    projection.meshes.map((mesh) => mesh.geometry.attributes.position),
    positions,
  );
  assert.deepEqual(
    positions.map((attribute) => attribute.version),
    versions,
  );
  projection.setOpacity(-1);
  projection.render({ size: 3, state, colors, camera });
  assert.equal(projection.opacity, 0);
  assert.ok(projection.meshes.every((mesh) => !mesh.visible));
  projection.setOpacity(5);
  assert.equal(projection.opacity, 1);
  projection.setOpacity(NaN);
  assert.equal(projection.opacity, 0.6);
  projection.dispose();
});
