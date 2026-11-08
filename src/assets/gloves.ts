import * as THREE from "three";
import { createBoxingGlove } from "./boxing-glove";

/** These generated rigs have no finger joints: replace their open hand surface. */
function maskOpenHands(root: THREE.Object3D, hands: THREE.Object3D[]) {
  root.traverse((object) => {
    if (
      !(object instanceof THREE.SkinnedMesh) ||
      object.userData.ownedHandGeometry
    )
      return;
    const joints = new Set(
      hands
        .map((hand) => object.skeleton.bones.indexOf(hand as THREE.Bone))
        .filter((i) => i >= 0),
    );
    if (!joints.size) return;
    const source = object.geometry;
    const indices = source.getAttribute("skinIndex"),
      weights = source.getAttribute("skinWeight");
    if (!indices || !weights) return;
    const hidden = new Set<number>();
    for (let i = 0; i < indices.count; i++) {
      let influence = 0;
      for (let j = 0; j < 4; j++)
        if (joints.has(indices.getComponent(i, j)))
          influence += weights.getComponent(i, j);
      if (influence >= 0.5) hidden.add(i);
    }
    if (!hidden.size) return;
    const index = source.index;
    const count = index?.count ?? source.getAttribute("position").count;
    const kept: number[] = [],
      groups: { start: number; count: number; materialIndex: number }[] = [];
    const sourceGroups = source.groups.length
      ? source.groups
      : [{ start: 0, count, materialIndex: 0 }];
    for (const group of sourceGroups) {
      const start = kept.length;
      for (
        let i = group.start;
        i + 2 < Math.min(count, group.start + group.count);
        i += 3
      ) {
        const triangle = [0, 1, 2].map((j) =>
          index ? index.getX(i + j) : i + j,
        );
        if (!triangle.some((vertex) => hidden.has(vertex)))
          kept.push(...triangle);
      }
      if (kept.length > start)
        groups.push({
          start,
          count: kept.length - start,
          materialIndex: group.materialIndex ?? 0,
        });
    }
    if (kept.length === count) return;
    const geometry = source.clone();
    geometry.setIndex(kept);
    geometry.clearGroups();
    for (const group of groups)
      geometry.addGroup(group.start, group.count, group.materialIndex);
    object.geometry = geometry;
    object.userData.ownedHandGeometry = true;
  });
}

export function addBoxingGloves(root: THREE.Object3D, corner = 0) {
  const hands = ["LeftHand", "RightHand"]
    .map((name) => root.getObjectByName(name))
    .filter((hand): hand is THREE.Object3D => !!hand);
  if (!hands.length) return;
  root.updateMatrixWorld(true);
  maskOpenHands(root, hands);
  for (const hand of hands) {
    if (hand.getObjectByName("boxing-glove")) continue;
    const scale = hand.getWorldScale(new THREE.Vector3());
    if (Math.min(scale.x, scale.y, scale.z) <= 0) continue;
    const glove = createBoxingGlove(hand.name === "LeftHand" ? -1 : 1, corner);
    glove.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    hand.add(glove);
  }
}
