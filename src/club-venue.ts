import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Sport = "boxing" | "bjj";
type V3 = [number, number, number];

/** A small, authored club. All positions are metres; playable surfaces end at .147. */
export function createClubVenue(scene: THREE.Scene): {
  boxing: THREE.Group;
  bjj: THREE.Group;
  update(time: number, sport: Sport, reduced: boolean): void;
} {
  const room = new THREE.Group();
  room.name = "Club / shared architecture";
  const boxing = new THREE.Group();
  boxing.name = "Club / boxing ring";
  const bjj = new THREE.Group();
  bjj.name = "Club / jiu-jitsu tatami";
  scene.add(room, boxing, bjj);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  const plane = new THREE.PlaneGeometry(1, 1);
  const dummy = new THREE.Object3D();
  const standard = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  // One draw for every geometry/material pair, including all spectators and fittings.
  class Batch {
    private entries = new Map<
      string,
      {
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
        matrices: THREE.Matrix4[];
      }
    >();
    constructor(private parent: THREE.Group) {}
    add(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: V3,
      scale: V3,
      rotation: V3 = [0, 0, 0],
    ) {
      const key = `${geometry.uuid}:${material.uuid}`;
      let entry = this.entries.get(key);
      if (!entry) {
        entry = { geometry, material, matrices: [] };
        this.entries.set(key, entry);
      }
      dummy.position.set(...position);
      dummy.rotation.set(...rotation);
      dummy.scale.set(...scale);
      dummy.updateMatrix();
      entry.matrices.push(dummy.matrix.clone());
    }
    finish() {
      for (const entry of this.entries.values()) {
        const mesh = new THREE.InstancedMesh(
          entry.geometry,
          entry.material,
          entry.matrices.length,
        );
        entry.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.parent.add(mesh);
      }
    }
  }

  let seed = 29191;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function texture(
    width: number,
    height: number,
    paint: (c: CanvasRenderingContext2D) => void,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext("2d")!);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }
  function noise(
    c: CanvasRenderingContext2D,
    width: number,
    height: number,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      c.fillStyle =
        random() > 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.06)";
      const size = 1 + random() * 3;
      c.fillRect(random() * width, random() * height, size, size);
    }
  }
  const concreteMap = texture(512, 512, (c) => {
    c.fillStyle = "#444948";
    c.fillRect(0, 0, 512, 512);
    noise(c, 512, 512, 18000);
    c.strokeStyle = "rgba(10,18,17,.18)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 510, 510);
  });
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.repeat.set(9, 9);
  const wallMap = texture(512, 512, (c) => {
    c.fillStyle = "#161d1e";
    c.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 12; row++) {
      for (let col = -1; col < 5; col++) {
        const shade = 34 + Math.floor(random() * 9);
        c.fillStyle = `rgb(${shade},${shade + 5},${shade + 4})`;
        c.fillRect(col * 128 + (row % 2) * 64 + 2, row * 43 + 2, 124, 39);
      }
    }
    noise(c, 512, 512, 18000);
  });
  wallMap.wrapS = wallMap.wrapT = THREE.RepeatWrapping;
  wallMap.repeat.set(3, 1);
  const windowMap = texture(512, 256, (c) => {
    const gradient = c.createLinearGradient(0, 0, 100, 256);
    gradient.addColorStop(0, "#536969");
    gradient.addColorStop(0.55, "#304a4a");
    gradient.addColorStop(1, "#172c2f");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = "rgba(163,187,177,.12)";
    c.beginPath();
    c.moveTo(45, 0);
    c.lineTo(200, 0);
    c.lineTo(70, 256);
    c.lineTo(0, 256);
    c.fill();
    noise(c, 512, 256, 11000);
  });
  const canvasMap = texture(1024, 1024, (c) => {
    c.fillStyle = "#b9b5a6";
    c.fillRect(0, 0, 1024, 1024);
    const shade = c.createRadialGradient(512, 512, 80, 512, 512, 700);
    shade.addColorStop(0, "rgba(241,234,211,.06)");
    shade.addColorStop(0.75, "rgba(45,51,46,.02)");
    shade.addColorStop(1, "rgba(34,43,39,.17)");
    c.fillStyle = shade;
    c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 1024; i += 3) {
      c.fillStyle = i % 2 ? "rgba(255,255,255,.023)" : "rgba(19,30,26,.025)";
      c.fillRect(i, 0, 1, 1024);
      c.fillRect(0, i, 1024, 1);
    }
    noise(c, 1024, 1024, 14000);
    c.save();
    c.translate(512, 512);
    c.rotate(-Math.PI / 2);
    c.strokeStyle = "rgba(52,66,58,.28)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 180, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(44,60,50,.54)";
    c.textAlign = "center";
    c.font = "900 77px Arial, sans-serif";
    c.fillText("RING CLUB", 0, 8);
    c.font = "600 15px Arial, sans-serif";
    c.fillText("TRAIN TOGETHER  /  EST. 2024", 0, 42);
    c.restore();
    c.strokeStyle = "rgba(66,72,63,.22)";
    c.lineWidth = 2;
    c.strokeRect(25, 25, 974, 974);
  });
  const weaveMap = texture(512, 512, (c) => {
    c.fillStyle = "#e2e2d4";
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 4) {
      c.fillStyle =
        i % 8 === 0 ? "rgba(20,41,32,.075)" : "rgba(255,255,255,.2)";
      c.fillRect(0, i, 512, 1);
    }
    noise(c, 512, 512, 5000);
    c.strokeStyle = "rgba(13,34,26,.1)";
    c.lineWidth = 4;
    c.strokeRect(2, 2, 508, 508);
  });

  const floor = new THREE.MeshStandardMaterial({
    map: concreteMap,
    roughness: 0.91,
  });
  const brick = new THREE.MeshStandardMaterial({
    map: wallMap,
    roughness: 0.96,
  });
  const steel = standard("#202a2b", 0.65, 0.48);
  const edgeSteel = standard("#46504c", 0.59, 0.5);
  const black = standard("#11191a", 0.9);
  const wood = standard("#6d5540", 0.84);
  const concrete = standard("#343c3a", 0.96);
  const brass = standard("#988064", 0.6, 0.45);
  const cream = standard("#c6c7b7", 0.85);
  const accent = standard("#af8654", 0.84);
  const lamp = new THREE.MeshBasicMaterial({ color: "#f1e1b9" });
  const glass = new THREE.MeshStandardMaterial({
    map: windowMap,
    color: "#c0d0c7",
    emissive: "#4e7776",
    emissiveIntensity: 0.2,
    roughness: 0.42,
    metalness: 0.18,
  });
  const architecture = new Batch(room);
  architecture.add(box, floor, [0, -0.51, 0], [28, 0.26, 27]);
  architecture.add(box, brick, [0, 2.65, -9.9], [19.2, 6.2, 0.4]);
  for (const x of [-9.5, 9.5]) {
    architecture.add(box, brick, [x, 2.65, 1], [0.4, 6.2, 22]);
    architecture.add(box, concrete, [x * 0.98, 0.1, 1], [0.12, 0.95, 21.8]);
    architecture.add(box, steel, [x * 0.96, 5.65, 1], [0.24, 0.34, 21.7]);
    for (const z of [-8.8, -2.8, 3.2, 9.2]) {
      architecture.add(box, steel, [x * 0.96, 2.6, z], [0.22, 6, 0.26]);
      architecture.add(box, edgeSteel, [x * 0.96, -0.18, z], [0.48, 0.4, 0.48]);
    }
    architecture.add(box, accent, [x * 0.7, -0.374, 0.5], [0.045, 0.012, 17]);
  }
  for (const z of [-8.8, -2.8, 3.2, 9.2]) {
    architecture.add(box, steel, [0, 5.65, z], [18.4, 0.34, 0.2]);
    architecture.add(box, steel, [0, 5.99, z], [18.4, 0.08, 0.3]);
    // Diagonal bracing is geometry, so it reads from the low grappling camera too.
    for (const x of [-7.8, 7.8])
      architecture.add(
        box,
        steel,
        [x, 5.12, z],
        [2.05, 0.09, 0.1],
        [0, 0, x > 0 ? 0.6 : -0.6],
      );
  }
  architecture.add(box, concrete, [0, -0.05, -9.61], [18.5, 0.65, 0.13]);
  architecture.add(box, steel, [0, 1.11, -9.64], [18.5, 0.055, 0.08]);
  for (const x of [-6.45, -2.15, 2.15, 6.45]) {
    architecture.add(box, black, [x, 4.48, -9.64], [3.65, 1.52, 0.13]);
    architecture.add(box, glass, [x, 4.48, -9.54], [3.43, 1.3, 0.025]);
    architecture.add(box, steel, [x, 4.48, -9.5], [0.055, 1.35, 0.045]);
    architecture.add(box, steel, [x, 4.48, -9.5], [3.48, 0.06, 0.045]);
    architecture.add(box, edgeSteel, [x, 3.7, -9.47], [3.83, 0.1, 0.31]);
  }
  for (const z of [-5.8, 0, 5.8]) {
    architecture.add(box, black, [-9.25, 4.35, z], [0.12, 1.65, 3.4]);
    architecture.add(box, glass, [-9.16, 4.35, z], [0.03, 1.43, 3.18]);
    architecture.add(box, steel, [-9.12, 4.35, z], [0.04, 1.5, 0.055]);
  }

  // Suspended practical softboxes: luminous faces, solid housing, visible suspension.
  for (const x of [-2.9, 2.9]) {
    for (const z of [-2.65, 2.65]) {
      architecture.add(box, steel, [x, 5.03, z], [2.2, 0.18, 0.66]);
      architecture.add(box, lamp, [x, 4.929, z], [2.04, 0.016, 0.5]);
      for (const dx of [-0.8, 0.8]) {
        architecture.add(
          cylinder,
          edgeSteel,
          [x + dx, 5.4, z],
          [0.009, 0.62, 0.009],
        );
        architecture.add(box, steel, [x + dx, 4.91, z], [0.025, 0.025, 0.56]);
      }
    }
  }
  for (const x of [-7.8, 7.8]) {
    architecture.add(box, steel, [x, 3.1, -9.48], [0.45, 0.23, 0.31]);
    architecture.add(box, lamp, [x, 2.98, -9.45], [0.32, 0.025, 0.22]);
  }

  // Bleachers live outside the fight envelope; bodies are quiet, layered silhouettes.
  const crowdMaterials = ["#343e3d", "#3d423c", "#433d35"].map((c) =>
    standard(c),
  );
  const headMaterial = standard("#706c5e", 0.94);
  for (let row = 0; row < 2; row++) {
    const z = -6.65 - row * 1.05;
    const rise = row * 0.34;
    architecture.add(
      box,
      concrete,
      [0, -0.26 + rise / 2, z - 0.1],
      [12.2, 0.24 + rise, 1.05],
    );
    architecture.add(box, wood, [0, 0.23 + rise, z], [11.8, 0.13, 0.43]);
    for (let i = 0; i < 8; i++) {
      if (row === 0 && (i === 3 || i === 4)) continue;
      const x = (i - 3.5) * 1.38 + (row ? 0.12 : 0);
      const offset = (i % 3) * 0.025;
      const outfit = crowdMaterials[(i + row) % crowdMaterials.length];
      architecture.add(
        sphere,
        outfit,
        [x, 0.75 + rise + offset, z],
        [0.25, 0.39, 0.17],
        [0.12, 0, ((i % 3) - 1) * 0.08],
      );
      architecture.add(
        sphere,
        headMaterial,
        [x, 1.27 + rise + offset, z + 0.035],
        [0.145, 0.175, 0.15],
      );
      for (const side of [-1, 1]) {
        architecture.add(
          box,
          outfit,
          [x + side * 0.15, 0.36 + rise, z + 0.2],
          [0.18, 0.18, 0.5],
        );
        architecture.add(
          box,
          black,
          [x + side * 0.15, 0.02 + rise, z + 0.38],
          [0.16, 0.53, 0.18],
        );
        architecture.add(
          cylinder,
          outfit,
          [x + side * 0.255, 0.64 + rise, z + 0.12],
          [0.075, 0.46, 0.075],
          [-0.4, 0, side * 0.12],
        );
      }
    }
  }

  // Training furniture and storage give the room a purpose beyond the central arena.
  for (const z of [-3.6, 1.0]) {
    architecture.add(box, wood, [6.5, 0.15, z], [0.6, 0.13, 2.6]);
    architecture.add(
      box,
      wood,
      [6.78, 0.63, z],
      [0.09, 0.68, 2.6],
      [0, 0, -0.08],
    );
    for (const dz of [-0.95, 0.95])
      architecture.add(box, steel, [6.5, -0.09, z + dz], [0.5, 0.45, 0.11]);
  }
  architecture.add(box, black, [7.85, 0.65, -7.55], [2, 2.02, 0.78]);
  for (const y of [-0.22, 0.44, 1.1, 1.76])
    architecture.add(box, wood, [7.85, y, -7.12], [2.05, 0.07, 0.9]);
  const gloveLeather = standard("#733c32", 0.63);
  for (let i = 0; i < 5; i++) {
    const x = 7.17 + (i % 3) * 0.59;
    const y = i < 3 ? 0.65 : 1.32;
    architecture.add(
      sphere,
      gloveLeather,
      [x, y, -7.01],
      [0.19, 0.24, 0.22],
      [0, 0.1, -0.22],
    );
    architecture.add(
      sphere,
      gloveLeather,
      [x + 0.15, y - 0.03, -6.96],
      [0.08, 0.14, 0.12],
    );
    architecture.add(box, cream, [x, y - 0.2, -7.02], [0.22, 0.075, 0.25]);
  }
  for (let i = 0; i < 3; i++)
    architecture.add(
      box,
      cream,
      [6.48, 0.27 + i * 0.045, 0.62],
      [0.39, 0.04, 0.6],
    );
  for (const x of [6.36, 6.58]) {
    architecture.add(
      cylinder,
      edgeSteel,
      [x, 0.41, -4.37],
      [0.045, 0.38, 0.045],
    );
    architecture.add(cylinder, black, [x, 0.62, -4.37], [0.035, 0.04, 0.035]);
  }
  // Exposed utility runs and a recessed entrance make even reverse views coherent.
  architecture.add(
    cylinder,
    edgeSteel,
    [9.2, 2.3, 0],
    [0.032, 17, 0.032],
    [Math.PI / 2, 0, 0],
  );
  architecture.add(cylinder, edgeSteel, [9.2, 3.7, -6.1], [0.032, 2.8, 0.032]);
  architecture.add(box, black, [2.8, 1.1, 10.75], [2.55, 3, 0.2]);
  architecture.add(box, steel, [2.8, 1.06, 10.6], [2.22, 2.85, 0.13]);
  architecture.add(box, glass, [2.8, 1.6, 10.5], [1.82, 1.26, 0.04]);
  architecture.add(box, brass, [3.58, 0.88, 10.4], [0.05, 0.3, 0.055]);
  architecture.finish();

  function panel(
    map: THREE.Texture,
    width: number,
    height: number,
    pos: V3,
    rotationY = 0,
  ) {
    const mesh = new THREE.Mesh(
      plane,
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        roughness: 0.92,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
    mesh.position.set(...pos);
    mesh.scale.set(width, height, 1);
    mesh.rotation.y = rotationY;
    room.add(mesh);
    return mesh;
  }
  const signMap = texture(1024, 512, (c) => {
    c.textAlign = "center";
    c.fillStyle = "#d7d4bf";
    c.font = "900 132px Arial, sans-serif";
    c.fillText("RING CLUB", 512, 243);
    c.font = "600 25px Arial, sans-serif";
    c.fillText("B O X I N G   /   J I U - J I T S U", 512, 302);
    c.fillStyle = "#8b988b";
    c.font = "500 17px Arial, sans-serif";
    c.fillText("TRAIN TOGETHER.  GET BETTER.", 512, 352);
    c.fillStyle = "#a68e64";
    c.fillRect(404, 127, 216, 5);
  });
  const signBacking = new THREE.Mesh(box, black);
  signBacking.position.set(0, 2.58, -9.59);
  signBacking.scale.set(5.9, 2.22, 0.16);
  room.add(signBacking);
  panel(signMap, 5.7, 2.85, [0, 2.59, -9.49]);
  const posterMap = texture(512, 512, (c) => {
    c.fillStyle = "#aaa99a";
    c.fillRect(0, 0, 512, 512);
    noise(c, 512, 512, 5000);
    c.fillStyle = "#273b34";
    c.fillRect(26, 26, 460, 12);
    c.font = "900 74px Arial, sans-serif";
    c.fillText("LEAVE", 32, 150);
    c.fillText("IT ALL", 32, 230);
    c.fillText("HERE.", 32, 310);
    c.font = "700 17px Arial, sans-serif";
    c.fillText("RESPECT THE ROUND. RESPECT THE ROOM.", 32, 449);
  });
  panel(posterMap, 1.35, 1.35, [-9.275, 2.15, -4.8], Math.PI / 2);
  const clockMap = texture(512, 512, (c) => {
    c.fillStyle = "#1c2827";
    c.beginPath();
    c.arc(256, 256, 251, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#a5ad9f";
    c.lineWidth = 5;
    c.beginPath();
    c.arc(256, 256, 236, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(256 + Math.sin(a) * 201, 256 - Math.cos(a) * 201);
      c.lineTo(256 + Math.sin(a) * 222, 256 - Math.cos(a) * 222);
      c.stroke();
    }
    c.lineWidth = 10;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(256, 256);
    c.lineTo(180, 186);
    c.moveTo(256, 256);
    c.lineTo(337, 124);
    c.stroke();
  });
  panel(clockMap, 0.82, 0.82, [6.2, 2.84, -9.55]);

  // A soft, baked contact patch survives software rendering without shadow maps.
  const shadowMap = texture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 42, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,.38)");
    g.addColorStop(0.65, "rgba(0,0,0,.21)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
  const contact = new THREE.Mesh(
    plane,
    new THREE.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  contact.position.set(0, -0.372, 0);
  contact.rotation.x = -Math.PI / 2;
  contact.scale.set(11.3, 11.3, 1);
  room.add(contact);

  const ring = new Batch(boxing);
  ring.add(box, black, [0, -0.13, 0], [7.8, 0.5, 7.8]);
  ring.add(box, edgeSteel, [0, 0.087, 0], [7.84, 0.08, 7.84]);
  ring.add(box, cream, [0, 0.12, 0], [7.2, 0.05, 7.2]);
  ring.add(
    plane,
    new THREE.MeshStandardMaterial({ map: canvasMap, roughness: 0.98 }),
    [0, 0.147, 0],
    [7.1, 7.1, 1],
    [-Math.PI / 2, 0, 0],
  );
  const red = standard("#884334", 0.68);
  const pale = standard("#c4c5b5", 0.69);
  for (const x of [-3.55, 3.55]) {
    for (const z of [-3.55, 3.55]) {
      ring.add(cylinder, steel, [x, 0.91, z], [0.085, 2.08, 0.085]);
      ring.add(sphere, brass, [x, 1.975, z], [0.105, 0.045, 0.105]);
      const pad = x * z > 0 ? red : pale;
      ring.add(box, pad, [x, 1.19, z], [0.23, 1.16, 0.23], [0, Math.PI / 4, 0]);
      for (const y of [0.61, 0.95, 1.29, 1.63])
        ring.add(
          box,
          brass,
          [x, y, z],
          [0.27, 0.055, 0.075],
          [0, Math.PI / 4, 0],
        );
    }
  }
  // Slight rope sag and vertical tie-downs avoid the appearance of rigid rails.
  const ropeLight = standard("#c4c5b6", 0.82);
  const ropeDark = standard("#9b7652", 0.77);
  const ropeGeometry: THREE.BufferGeometry[][] = [[], []];
  for (let level = 0; level < 4; level++) {
    const y = [0.61, 0.95, 1.29, 1.63][level];
    for (const side of [-1, 1]) {
      for (const alongX of [true, false]) {
        const points = [-3.55, -1.7, 0, 1.7, 3.55].map(
          (v) =>
            new THREE.Vector3(
              alongX ? v : side * 3.55,
              y - (Math.abs(v) < 3.5 ? 0.033 : 0),
              alongX ? side * 3.55 : v,
            ),
        );
        ropeGeometry[level === 3 ? 1 : 0].push(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            16,
            0.027,
            6,
            false,
          ),
        );
      }
    }
  }
  for (let i = 0; i < 2; i++) {
    const geometry = mergeGeometries(ropeGeometry[i], false)!;
    ropeGeometry[i].forEach((g) => g.dispose());
    const ropes = new THREE.Mesh(geometry, i ? ropeDark : ropeLight);
    ropes.castShadow = true;
    boxing.add(ropes);
  }
  for (const side of [-1, 1]) {
    for (const v of [-1.65, 1.65]) {
      ring.add(box, pale, [v, 1.1, side * 3.55], [0.045, 1.04, 0.035]);
      ring.add(box, pale, [side * 3.55, 1.1, v], [0.035, 1.04, 0.045]);
    }
  }
  for (let i = 0; i < 3; i++) {
    ring.add(
      box,
      concrete,
      [-4.16 - i * 0.28, -0.31 + (2 - i) * 0.12, 2.25],
      [0.6, 0.14 + (2 - i) * 0.12, 1.4],
    );
    ring.add(
      box,
      edgeSteel,
      [-4.16 - i * 0.28, -0.232 + (2 - i) * 0.18, 2.25],
      [0.56, 0.018, 1.34],
    );
  }
  const apronMap = texture(1024, 128, (c) => {
    c.fillStyle = "#bbbda8";
    c.textAlign = "center";
    c.font = "800 65px Arial, sans-serif";
    c.fillText("RING CLUB", 512, 86);
  });
  const apronMaterial = new THREE.MeshStandardMaterial({
    map: apronMap,
    transparent: true,
    roughness: 1,
  });
  for (const side of [-1, 1])
    ring.add(
      plane,
      apronMaterial,
      [0, -0.13, side * 3.906],
      [2.6, 0.325, 1],
      [0, side === 1 ? 0 : Math.PI, 0],
    );
  ring.finish();

  const tatami = new Batch(bjj);
  tatami.add(box, black, [0, -0.13, 0], [8.14, 0.5, 8.14]);
  tatami.add(box, edgeSteel, [0, 0.057, 0], [8.18, 0.1, 8.18]);
  const matCenter = new THREE.MeshStandardMaterial({
    map: weaveMap,
    color: "#7fa396",
    roughness: 0.94,
  });
  const matCenterAlt = matCenter.clone();
  matCenterAlt.color.set("#789b8e");
  const matBorder = new THREE.MeshStandardMaterial({
    map: weaveMap,
    color: "#354e45",
    roughness: 0.95,
  });
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) {
      const border = x === 0 || z === 0 || x === 7 || z === 7;
      tatami.add(
        box,
        border ? matBorder : (x + z) % 2 ? matCenter : matCenterAlt,
        [x - 3.5, 0.107, z - 3.5],
        [0.992, 0.08, 0.992],
        [0, (((x + z) % 2) * Math.PI) / 2, 0],
      );
    }
  }
  const contestLine = standard("#c2c7ad", 1);
  for (const x of [-2.84, 2.84]) {
    for (const z of [-2.84, 2.84]) {
      tatami.add(
        box,
        contestLine,
        [x - Math.sign(x) * 0.14, 0.148, z],
        [0.32, 0.002, 0.035],
      );
      tatami.add(
        box,
        contestLine,
        [x, 0.148, z - Math.sign(z) * 0.14],
        [0.035, 0.002, 0.32],
      );
    }
  }
  const matMarkMap = texture(512, 512, (c) => {
    c.strokeStyle = "rgba(26,57,46,.32)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(256, 256, 209, 0, Math.PI * 2);
    c.stroke();
    c.textAlign = "center";
    c.fillStyle = "rgba(26,57,46,.44)";
    c.font = "900 67px Arial, sans-serif";
    c.fillText("RING CLUB", 256, 263);
    c.font = "600 20px Arial, sans-serif";
    c.fillText("JIU-JITSU", 256, 299);
  });
  tatami.add(
    plane,
    new THREE.MeshStandardMaterial({
      map: matMarkMap,
      transparent: true,
      roughness: 1,
      depthWrite: false,
    }),
    [0, 0.149, 0],
    [2.3, 2.3, 1],
    [-Math.PI / 2, 0, -Math.PI / 2],
  );
  tatami.finish();

  // Three bags share three draws. Only their instance matrices move.
  const bagProfile = [
    [0, -0.5],
    [0.73, -0.5],
    [0.94, -0.47],
    [1, -0.41],
    [1, 0.41],
    [0.94, 0.47],
    [0.73, 0.5],
    [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bagMaterial = standard("#563c30", 0.74);
  const bagBodies = new THREE.InstancedMesh(
    new THREE.LatheGeometry(bagProfile, 20),
    bagMaterial,
    3,
  );
  const bagBands = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1, 0.028, 5, 20),
    brass,
    6,
  );
  const bagChains = new THREE.InstancedMesh(cylinder, edgeSteel, 3);
  for (const mesh of [bagBodies, bagBands, bagChains]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The instance positions change by centimetres; these small meshes need no per-frame bounds.
    mesh.frustumCulled = false;
    room.add(mesh);
  }
  const pivot = new THREE.Object3D();
  function bagMatrix(local: V3, scale: V3, rotation: V3 = [0, 0, 0]) {
    dummy.position.set(...local);
    dummy.scale.set(...scale);
    dummy.rotation.set(...rotation);
    dummy.updateMatrix();
    return new THREE.Matrix4().multiplyMatrices(pivot.matrix, dummy.matrix);
  }
  function moveBags(time: number, reduced: boolean) {
    for (let i = 0; i < 3; i++) {
      pivot.position.set(-6.35, 4.88, -4.3 + i * 3.6);
      pivot.rotation.set(
        reduced ? 0 : Math.cos(time * 0.37 + i * 2.6) * 0.009,
        0,
        reduced ? 0 : Math.sin(time * 0.43 + i * 1.9) * 0.014,
      );
      pivot.updateMatrix();
      bagBodies.setMatrixAt(i, bagMatrix([0, -3.32, 0], [0.34, 1.8, 0.34]));
      bagChains.setMatrixAt(i, bagMatrix([0, -1.2, 0], [0.014, 2.4, 0.014]));
      for (let band = 0; band < 2; band++)
        bagBands.setMatrixAt(
          i * 2 + band,
          bagMatrix(
            [0, -3.32 + (band ? 0.65 : -0.65), 0],
            [0.342, 0.342, 0.342],
            [Math.PI / 2, 0, 0],
          ),
        );
    }
    for (const mesh of [bagBodies, bagBands, bagChains])
      mesh.instanceMatrix.needsUpdate = true;
  }

  const fan = new THREE.Group();
  fan.position.set(0, 5.72, -5.8);
  const fanParts = new Batch(fan);
  fanParts.add(cylinder, edgeSteel, [0, 0, 0], [0.15, 0.15, 0.15]);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    fanParts.add(
      box,
      steel,
      [Math.sin(angle) * 0.59, 0, Math.cos(angle) * 0.59],
      [0.25, 0.035, 1.05],
      [0, angle, 0],
    );
  }
  fanParts.finish();
  room.add(fan);

  const hemisphere = scene.children.find(
    (child) => child instanceof THREE.HemisphereLight,
  ) as THREE.HemisphereLight | undefined;
  const overhead = scene.children.find(
    (child) => child instanceof THREE.SpotLight,
  ) as THREE.SpotLight | undefined;
  const fills = scene.children.filter(
    (child) => child instanceof THREE.PointLight,
  ) as THREE.PointLight[];
  let activeSport: Sport | null = null;
  function update(time: number, sport: Sport, reduced: boolean) {
    if (activeSport !== sport) {
      activeSport = sport;
      boxing.visible = sport === "boxing";
      bjj.visible = sport === "bjj";
      const grappling = sport === "bjj";
      scene.background = new THREE.Color(grappling ? "#141d1b" : "#1a1e1c");
      scene.fog = new THREE.Fog(grappling ? "#141d1b" : "#1a1e1c", 15, 40);
      lamp.color.set(grappling ? "#e0e9d9" : "#f1e1b9");
      accent.color.set(grappling ? "#6e9482" : "#af8654");
      bagMaterial.color.set(grappling ? "#3f5046" : "#563c30");
      if (hemisphere) {
        hemisphere.color.set(grappling ? "#dbe6e1" : "#e9e8de");
        hemisphere.groundColor.set(grappling ? "#344a3d" : "#4b422f");
      }
      overhead?.color.set(grappling ? "#e7f3e9" : "#fff0d4");
      for (const fill of fills) {
        fill.color.set(
          fill.position.x < 0
            ? grappling
              ? "#83b3a1"
              : "#d99a5f"
            : grappling
              ? "#b0ceca"
              : "#abc1cc",
        );
        fill.intensity = fill.position.x < 0 ? 24 : 32;
      }
    }
    moveBags(time, reduced);
    fan.rotation.y = reduced ? 0 : time * 0.32;
  }
  update(0, "boxing", true);
  return { boxing, bjj, update };
}
