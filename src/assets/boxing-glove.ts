import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const cornerColor = (corner: number) =>
  corner === 0 ? "#a92d3d" : "#285889";
let grain: THREE.DataTexture | undefined;
function leatherGrain() {
  if (grain) return grain;
  const bytes = new Uint8Array(64 * 64 * 4);
  let seed = 17;
  for (let i = 0; i < bytes.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes[i] = bytes[i + 1] = bytes[i + 2] = 90 + (seed >>> 25);
    bytes[i + 3] = 255;
  }
  grain = new THREE.DataTexture(bytes, 64, 64);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(3, 3);
  grain.needsUpdate = true;
  return grain;
}

/** Wrist at origin, knuckles toward +Y, back of hand toward +Z. Units are metres. */
export function createBoxingGlove(side: -1 | 1, corner = 0) {
  const root = new THREE.Group();
  root.name = "boxing-glove";
  const leather = new THREE.MeshStandardMaterial({
    color: cornerColor(corner),
    roughness: 0.52,
    metalness: 0,
    bumpMap: leatherGrain(),
    bumpScale: 0.00065,
  });
  const palm = new THREE.MeshStandardMaterial({
    color: "#272629",
    roughness: 0.78,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: "#d9c5a0",
    roughness: 0.7,
  });
  const wrap = new THREE.MeshStandardMaterial({
    color: "#e0d8c8",
    roughness: 0.95,
  });
  function mesh(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    pos: number[],
    rotation = 0,
  ) {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.set(pos[0], pos[1], pos[2]);
    part.rotation.z = rotation;
    part.castShadow = true;
    part.userData.ownedAccessory = true;
    if (material === leather) part.userData.cornerLeather = true;
    root.add(part);
    return part;
  }
  const knuckles = mesh(
    "knuckles",
    new RoundedBoxGeometry(0.184, 0.185, 0.145, 4, 0.055),
    leather,
    [0, 0.13, 0.012],
  );
  knuckles.rotation.x = -0.1;
  mesh(
    "palm",
    new RoundedBoxGeometry(0.14, 0.15, 0.065, 3, 0.03),
    palm,
    [0, 0.09, -0.052],
  );
  mesh(
    "cuff",
    new RoundedBoxGeometry(0.147, 0.085, 0.122, 3, 0.022),
    leather,
    [0, 0.007, -0.004],
  );
  mesh(
    "wrist-wrap",
    new RoundedBoxGeometry(0.128, 0.027, 0.103, 2, 0.014),
    wrap,
    [0, -0.044, -0.004],
  );
  mesh(
    "closure",
    new RoundedBoxGeometry(0.155, 0.032, 0.129, 2, 0.012),
    palm,
    [0, -0.003, -0.004],
  );
  const thumb = mesh(
    "thumb",
    new THREE.CapsuleGeometry(0.031, 0.059, 5, 12),
    leather,
    [-side * 0.091, 0.095, -0.012],
    side * 0.52,
  );
  thumb.rotation.x = -0.12;
  mesh(
    "label",
    new RoundedBoxGeometry(0.061, 0.034, 0.006, 2, 0.004),
    palm,
    [0, 0.109, 0.085],
  );
  for (const x of [-0.012, 0.012])
    mesh(
      "brand-mark",
      new THREE.BoxGeometry(0.006, 0.019, 0.002),
      trim,
      [x, 0.109, 0.089],
      -0.28,
    );
  function seam(points: number[][]) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    mesh(
      "stitching",
      new THREE.TubeGeometry(curve, 22, 0.0009, 4, false),
      trim,
      [0, 0, 0],
    );
  }
  for (const sign of [-1, 1])
    seam([
      [sign * 0.059, 0.039, 0.05],
      [sign * 0.079, 0.085, 0.063],
      [sign * 0.077, 0.164, 0.068],
      [sign * 0.043, 0.209, 0.045],
    ]);
  seam([
    [-0.062, 0.019, 0.059],
    [0, 0.024, 0.061],
    [0.062, 0.019, 0.059],
  ]);
  return root;
}
