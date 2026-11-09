import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type HandSkin = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
};
const nameOf = (name: string) =>
  name.toLowerCase().replace(/mixamorig\d*|armature|[^a-z0-9]/g, "");

/** Copy the neutral, textured hand and sleeve into wrist-local metres. The source
 * skeleton, shared GLB geometry, UVs and materials remain owned by the library. */
function copyHandSkin(
  root: THREE.Group,
  side: "left" | "right",
): HandSkin | null {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const materials: THREE.Material[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const mesh = object,
      geometry = mesh.geometry;
    const weights = geometry.getAttribute("skinWeight"),
      indices = geometry.getAttribute("skinIndex"),
      uv = geometry.getAttribute("uv");
    if (!weights || !indices || !uv) return;
    const hand = mesh.skeleton.bones.find(
      (bone) => nameOf(bone.name) === `${side}hand`,
    );
    if (!hand) return;
    const selected = new Set<number>();
    mesh.skeleton.bones.forEach((bone, index) => {
      if (bone === hand || nameOf(bone.name) === `${side}forearm`)
        selected.add(index);
    });
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const inverse = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
    mesh.skeleton.update();
    const count =
      geometry.index?.count ?? geometry.getAttribute("position").count;
    const sourceMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const materialOffset = materials.length;
    materials.push(...sourceMaterials.map((material) => material.clone()));
    const sourceGroups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count, materialIndex: 0 }];
    const vertex = new THREE.Vector3(),
      normal = new THREE.Vector3();
    const meshNormal = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const skinMatrix = new THREE.Matrix4(),
      boneMatrix = new THREE.Matrix4();
    const localNormals = new Map<number, THREE.Vector3>();
    const local = new Map<number, THREE.Vector3>();
    const selection = new Map<number, boolean>();
    const included = (index: number) => {
      const cached = selection.get(index);
      if (cached !== undefined) return cached;
      selection.set(index, false);
      let weight = 0;
      for (let component = 0; component < 4; component++)
        if (selected.has(indices.getComponent(index, component)))
          weight += weights.getComponent(index, component);
      if (weight < 0.45) return false;
      mesh
        .getVertexPosition(index, vertex)
        .applyMatrix4(mesh.matrixWorld)
        .sub(wrist)
        .applyQuaternion(inverse);
      // Keep the forearm's natural cuff, but exclude upper-arm blend triangles.
      if (vertex.y < -0.3) return false;
      local.set(index, vertex.clone());
      if (geometry.getAttribute("normal")) {
        skinMatrix.elements.fill(0);
        for (let component = 0; component < 4; component++) {
          boneMatrix.fromArray(
            mesh.skeleton.boneMatrices,
            indices.getComponent(index, component) * 16,
          );
          const weight = weights.getComponent(index, component);
          for (let element = 0; element < 16; element++)
            skinMatrix.elements[element] +=
              boneMatrix.elements[element] * weight;
        }
        skinMatrix
          .premultiply(mesh.bindMatrixInverse)
          .multiply(mesh.bindMatrix);
        normal
          .fromBufferAttribute(geometry.getAttribute("normal"), index)
          .transformDirection(skinMatrix)
          .applyNormalMatrix(meshNormal)
          .applyQuaternion(inverse);
        localNormals.set(index, normal.clone());
      }
      selection.set(index, true);
      return true;
    };
    for (const sourceGroup of sourceGroups) {
      const start = positions.length / 3;
      for (
        let triangle = sourceGroup.start;
        triangle < Math.min(count, sourceGroup.start + sourceGroup.count);
        triangle += 3
      ) {
        const ids = [0, 1, 2].map(
          (offset) =>
            geometry.index?.getX(triangle + offset) ?? triangle + offset,
        );
        if (!ids.every(included)) continue;
        for (const id of ids) {
          positions.push(...local.get(id)!.toArray());
          normals.push(
            ...(localNormals.get(id) ?? new THREE.Vector3(0, 0, 1)).toArray(),
          );
          uvs.push(uv.getX(id), uv.getY(id));
        }
      }
      if (positions.length / 3 > start)
        groups.push({
          start,
          count: positions.length / 3 - start,
          materialIndex: materialOffset + (sourceGroup.materialIndex ?? 0),
        });
    }
  });
  if (!positions.length) {
    materials.forEach((material) => material.dispose());
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  groups.forEach((group) =>
    geometry.addGroup(group.start, group.count, group.materialIndex),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return {
    geometry,
    material: materials.length === 1 ? materials[0] : materials,
  };
}

/** Smooth fallback for rigs without weighted bare-hand geometry. */
function handGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    position: THREE.Vector3,
    scale = new THREE.Vector3(1, 1, 1),
    rotation = new THREE.Quaternion(),
  ) => {
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(position, rotation, scale),
    );
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
  };
  // Overlapping, soft volumes give the palm a curved heel and knuckle arch.
  add(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.Vector3(0, 0.041, 0),
    new THREE.Vector3(0.043, 0.059, 0.02),
  );
  add(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.Vector3(-0.025, 0.01, 0.004),
    new THREE.Vector3(0.026, 0.039, 0.022),
  );
  const segment = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const direction = b.clone().sub(a);
    add(
      new THREE.CapsuleGeometry(
        radius,
        Math.max(0.001, direction.length() - radius * 2),
        8,
        14,
      ),
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Vector3(1, 1, 0.88),
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
    );
  };
  for (let i = 0; i < 4; i++) {
    const x = -0.029 + i * 0.019;
    const length = [0.074, 0.081, 0.075, 0.059][i];
    const a = new THREE.Vector3(x, 0.075, 0),
      b = new THREE.Vector3(x * 1.08, 0.075 + length * 0.57, 0.007);
    const c = new THREE.Vector3(x * 1.1, 0.075 + length, 0.029);
    segment(a, b, 0.0095 - i * 0.0005);
    segment(b, c, 0.0085 - i * 0.0004);
  }
  segment(
    new THREE.Vector3(-0.032, 0.007, 0.005),
    new THREE.Vector3(-0.06, 0.035, 0.011),
    0.014,
  );
  segment(
    new THREE.Vector3(-0.06, 0.035, 0.011),
    new THREE.Vector3(-0.06, 0.063, 0.028),
    0.011,
  );
  segment(
    new THREE.Vector3(0, -0.055, 0),
    new THREE.Vector3(0, 0.011, 0),
    0.025,
  );
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

/** Two textured skin draws for the real models; four draws for a fallback rig. */
export class GrapplingHands {
  readonly root = new THREE.Group();
  readonly hands: THREE.Mesh[] = [];
  readonly forearms: THREE.Mesh[] = [];
  readonly material = new THREE.MeshStandardMaterial({
    color: "#e2b49b",
    roughness: 0.84,
  });
  private fallbackGeometry = handGeometry();
  private skins = new WeakMap<
    THREE.Group,
    [HandSkin | null, HandSkin | null]
  >();
  private currentModel: THREE.Group | null = null;
  constructor() {
    this.root.name = "grappling-bare-hands";
    const armGeometry = new THREE.CylinderGeometry(0.025, 0.045, 1, 18);
    for (let i = 0; i < 2; i++) {
      const hand = new THREE.Mesh(this.fallbackGeometry, this.material);
      hand.name = i === 0 ? "bare-left-hand" : "bare-right-hand";
      const arm = new THREE.Mesh(armGeometry, this.material);
      arm.name = i === 0 ? "bare-left-forearm" : "bare-right-forearm";
      this.hands.push(hand);
      this.forearms.push(arm);
      this.root.add(arm, hand);
    }
  }
  setModel(model: THREE.Group) {
    let skins = this.skins.get(model);
    if (!skins) {
      skins = [copyHandSkin(model, "left"), copyHandSkin(model, "right")];
      this.skins.set(model, skins);
    }
    this.currentModel = model;
    this.hands.forEach((hand, i) => {
      hand.geometry = skins![i]?.geometry ?? this.fallbackGeometry;
      hand.material = skins![i]?.material ?? this.material;
      hand.userData.modelSkin = !!skins![i];
      this.forearms[i].visible = !skins![i];
    });
  }
  releaseModel(model: THREE.Group) {
    const skins = this.skins.get(model);
    if (!skins) return;
    this.skins.delete(model);
    for (const skin of skins)
      if (skin) {
        skin.geometry.dispose();
        for (const material of Array.isArray(skin.material)
          ? skin.material
          : [skin.material])
          material.dispose();
      }
    if (this.currentModel === model) {
      this.currentModel = null;
      this.hands.forEach((hand, i) => {
        hand.geometry = this.fallbackGeometry;
        hand.material = this.material;
        hand.userData.modelSkin = false;
        this.forearms[i].visible = true;
      });
    }
  }
  update(
    color: string,
    aspect: number,
    ground: boolean,
    active: boolean,
    time: number,
    reduced: boolean,
  ) {
    this.material.color.set(color);
    const width = THREE.MathUtils.clamp(aspect, 0.55, 1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1,
        hand = this.hands[i];
      const reach = active ? 0.045 : 0;
      hand.position.set(
        side * 0.19 * width,
        (ground ? -0.24 : -0.29) +
          (reduced ? 0 : Math.sin(time * 2 + i) * 0.003),
        -0.53 - reach,
      );
      hand.rotation.set(-0.22, Math.PI - side * 0.3, -side * 0.18);
      // Real left/right meshes already have their own handedness and winding.
      hand.scale.set(
        hand.userData.modelSkin ? 0.82 : side < 0 ? 0.96 : -0.96,
        hand.userData.modelSkin ? 0.82 : 0.96,
        hand.userData.modelSkin ? 0.82 : 0.96,
      );
      hand.updateMatrix();
      const wrist = new THREE.Vector3(0, -0.045, 0).applyMatrix4(hand.matrix);
      const elbow = new THREE.Vector3(side * 0.35 * width, -0.69, -0.2);
      const direction = wrist.clone().sub(elbow),
        arm = this.forearms[i];
      arm.position.copy(wrist).add(elbow).multiplyScalar(0.5);
      arm.scale.set(1, direction.length(), 1);
      arm.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
    }
  }
}
