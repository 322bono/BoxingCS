import * as THREE from "three";
function fitHand(
  root: THREE.Object3D,
  hand: THREE.Object3D,
  scale: THREE.Vector3,
) {
  const inverse = hand.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const joint = object.skeleton.bones.indexOf(hand as THREE.Bone);
    if (joint < 0) return;
    const positions = object.geometry.getAttribute("position");
    const indices = object.geometry.getAttribute("skinIndex");
    const weights = object.geometry.getAttribute("skinWeight");
    if (!positions || !indices || !weights) return;
    for (let i = 0; i < positions.count; i++) {
      let influence = 0;
      for (let j = 0; j < 4; j++)
        if (indices.getComponent(i, j) === joint)
          influence += weights.getComponent(i, j);
      if (influence < 0.5) continue;
      const point = object.applyBoneTransform(
        i,
        new THREE.Vector3().fromBufferAttribute(positions, i),
      );
      object.localToWorld(point).applyMatrix4(inverse).multiply(scale);
      points.push(point);
    }
  });
  const center = new THREE.Vector3(0, 0.08, 0);
  const radius = new THREE.Vector3(0.105, 0.13, 0.105);
  if (points.length) {
    const box = new THREE.Box3().setFromPoints(points);
    box.getCenter(center);
    box.getSize(radius).multiplyScalar(0.5).addScalar(0.018);
    radius.max(new THREE.Vector3(0.105, 0.13, 0.105));
    let expansion = 1;
    for (const point of points)
      expansion = Math.max(
        expansion,
        point.clone().sub(center).divide(radius).length(),
      );
    radius.multiplyScalar(expansion * 1.08);
  }
  return { center: center.divide(scale), radius: radius.divide(scale) };
}
export function addBoxingGloves(root: THREE.Object3D, corner = 0) {
  const hands = ["LeftHand", "RightHand"]
    .map((name) => root.getObjectByName(name))
    .filter((n): n is THREE.Object3D => !!n);
  if (!hands.length) return;
  const palm = new THREE.SphereGeometry(1, 18, 14),
    cuff = new THREE.CylinderGeometry(1, 1, 1, 16);
  const color = new THREE.MeshStandardMaterial({
      color: corner === 0 ? "#dc3546" : "#326aaf",
      roughness: 0.28,
      metalness: 0.08,
    }),
    wrap = new THREE.MeshStandardMaterial({ color: "#eeeae2", roughness: 0.8 });
  root.updateMatrixWorld(true);
  for (const hand of hands) {
    const scale = hand.getWorldScale(new THREE.Vector3());
    if (Math.min(scale.x, scale.y, scale.z) <= 0) continue;
    const fit = fitHand(root, hand, scale);
    const mitt = new THREE.Mesh(palm, color);
    mitt.position.copy(fit.center);
    mitt.scale.copy(fit.radius);
    mitt.castShadow = true;
    mitt.userData.ownedAccessory = true;
    hand.add(mitt);
    const band = new THREE.Mesh(cuff, wrap);
    band.position.y = -0.015 / scale.y;
    band.scale.set(0.08 / scale.x, 0.055 / scale.y, 0.08 / scale.z);
    band.castShadow = true;
    band.userData.ownedAccessory = true;
    hand.add(band);
  }
}
