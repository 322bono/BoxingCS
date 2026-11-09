import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createBout } from "../shared/game.ts";
import { GrapplingHands } from "../src/assets/grappling-hands.ts";
import { RigController } from "../src/assets/rig.ts";
import {
  GrapplingPresentation,
  applyGrapplingPreview,
} from "../src/grappling-world.ts";
import {
  sampleGrapplingPair,
  type GrapplingPosition,
} from "../src/assets/grappling-poses.ts";

function rig() {
  const root = new THREE.Group();
  const bone = (
    name: string,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z = 0,
  ) => {
    const result = new THREE.Bone();
    result.name = name;
    result.position.set(x, y, z);
    parent.add(result);
    return result;
  };
  const hips = bone("Hips", root, 0, 1.04),
    spine = bone("Spine", hips, 0, 0.53);
  bone("Head", spine, 0, 0.27);
  for (const [side, sign] of [
    ["Left", 1],
    ["Right", -1],
  ] as const) {
    const arm = bone(`${side}Arm`, spine, sign * 0.23, -0.04);
    const forearm = bone(`${side}ForeArm`, arm, sign * 0.29, -0.15);
    bone(`${side}Hand`, forearm, sign * 0.25, -0.12);
    const thigh = bone(`${side}UpLeg`, hips, sign * 0.13, -0.05);
    const knee = bone(`${side}Leg`, thigh, 0, -0.44);
    bone(`${side}Foot`, knee, 0, -0.4, 0.05);
  }
  root.userData.rigController = new RigController(root, "nova");
  root.updateMatrixWorld(true);
  return root;
}
function setup() {
  const bout = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  bout.countdown = 0;
  const models = [rig(), rig()];
  const camera = new THREE.PerspectiveCamera(60, 1.4, 0.05, 90);
  const presentation = new GrapplingPresentation(camera);
  camera.add(presentation.root);
  return { bout, models, camera, presentation };
}
test("presentation does not write authoritative snapshots or stretch connected rig segments", () => {
  const { bout, models, camera, presentation } = setup();
  const lengths = models[0].getObjectByName("LeftForeArm")!.position.length();
  for (const position of [
    "standing",
    "clinch",
    "guard",
    "side",
    "mount",
    "back",
  ] as GrapplingPosition[]) {
    bout.grappling!.position = position;
    bout.grappling!.top = position === "standing" ? null : 0;
    const before = JSON.stringify(bout);
    presentation.update(bout, models, 0, 1 / 60, true, "broadcast");
    assert.equal(JSON.stringify(bout), before);
    for (const root of models) {
      assert.ok(root.position.length() < 5);
      const arm = root
        .getObjectByName("LeftArm")!
        .getWorldPosition(new THREE.Vector3());
      const elbow = root
        .getObjectByName("LeftForeArm")!
        .getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(arm.distanceTo(elbow) - lengths) < 1e-6);
      root.traverse((object) =>
        assert.ok(
          [...object.quaternion, ...object.position].every(Number.isFinite),
        ),
      );
    }
    assert.ok(camera.position.y >= 0.6);
    assert.ok(
      [...camera.position, ...camera.quaternion].every(Number.isFinite),
    );
    assert.deepEqual(camera.up.toArray(), [0, 1, 0]);
  }
});
test("top role swaps the same authored positions without assigning a seat advantage", () => {
  const { bout } = setup();
  const state = bout.grappling!;
  state.position = "guard";
  state.top = 0;
  const first = sampleGrapplingPair(state);
  state.top = 1;
  const swapped = sampleGrapplingPair(state);
  assert.deepEqual(first[0].pelvis, swapped[1].pelvis);
  assert.deepEqual(first[1].hands, swapped[0].hands);
  assert.ok(first[0].pelvis[1] > first[1].pelvis[1]);
});
test("transitions use source control at zero and target control at completion", () => {
  const { bout } = setup();
  const state = bout.grappling!;
  state.position = "guard";
  state.top = 0;
  const source = sampleGrapplingPair(state);
  state.transition = {
    kind: "sweep",
    actor: 1,
    from: "guard",
    to: "guard",
    top: 1,
    elapsed: 0,
    duration: 1,
    defended: false,
  };
  assert.deepEqual(sampleGrapplingPair(state)[0].pelvis, source[0].pelvis);
  state.transition.elapsed = 1;
  assert.ok(
    sampleGrapplingPair(state)[0].rotation.angleTo(source[1].rotation) < 1e-6,
  );
  assert.ok(
    new THREE.Vector3(...sampleGrapplingPair(state)[0].pelvis).distanceTo(
      new THREE.Vector3(...source[1].pelvis),
    ) < 1e-6,
  );
});
test("entering grappling stops boxing animation and reset restores the original pose and visibility", () => {
  const { bout, models, presentation } = setup();
  const controller = models[0].userData.rigController as RigController;
  const original = models[0].getObjectByName("LeftArm")!.quaternion.clone();
  controller.play("ko");
  controller.mixer.update(0.7);
  presentation.update(bout, models, 0, 1 / 60, true);
  assert.equal(controller.current, "");
  assert.ok(
    [...controller.actions.values()].every((action) => !action.isRunning()),
  );
  assert.equal(models[0].visible, false);
  assert.equal(models[1].visible, true);
  presentation.update(bout, models, 1, 1 / 60, true);
  assert.equal(models[0].visible, true);
  assert.equal(models[1].visible, false);
  presentation.reset();
  assert.equal(models[0].visible, true);
  assert.equal(models[1].visible, true);
  assert.ok(
    models[0].getObjectByName("LeftArm")!.quaternion.angleTo(original) < 1e-7,
  );
  assert.equal(presentation.root.visible, false);
});
test("submissions and fast role changes keep both first-person views finite above the mat", () => {
  const { bout, models, camera, presentation } = setup();
  for (const kind of ["armbar", "triangle", "rear-choke"] as const) {
    bout.grappling!.position = kind === "rear-choke" ? "back" : "guard";
    bout.grappling!.top = kind === "rear-choke" ? 0 : 1;
    bout.grappling!.submission = { kind, attacker: 0, progress: 90 };
    for (const view of [0, 1]) {
      presentation.update(bout, models, view, 0.1, false);
      assert.ok(camera.position.y >= 0.6);
      assert.ok(
        [...camera.position, ...camera.quaternion].every(Number.isFinite),
      );
    }
  }
  let handMeshes = 0;
  presentation.root.traverse((object) => {
    if (object instanceof THREE.Mesh) handMeshes++;
  });
  assert.equal(handMeshes, 4);
});
test("preview preserves placement and repeated application has no cumulative pose drift", () => {
  const model = rig();
  model.position.set(2, 0.15, -1);
  model.rotation.y = 0.6;
  const position = model.position.clone(),
    facing = model.quaternion.clone();
  applyGrapplingPreview(model, 3);
  const hand = model
    .getObjectByName("LeftHand")!
    .getWorldPosition(new THREE.Vector3());
  applyGrapplingPreview(model, 3);
  assert.ok(
    hand.distanceTo(
      model.getObjectByName("LeftHand")!.getWorldPosition(new THREE.Vector3()),
    ) < 1e-7,
  );
  assert.deepEqual(model.position.toArray(), position.toArray());
  assert.ok(model.quaternion.angleTo(facing) < 1e-7);
});

test("ground control places supine hips on the mat and keeps top players kneeling", () => {
  const { bout } = setup();
  const state = bout.grappling!;
  for (const position of ["guard", "side", "mount"] as const) {
    state.position = position;
    state.top = 1;
    const [bottom, top] = sampleGrapplingPair(state);
    assert.ok(
      bottom.pelvis[1] <= 0.32,
      `${position}: supine hips need mat contact`,
    );
    assert.ok(
      top.pelvis[1] <= 0.66,
      `${position}: top hips must fit a kneeling base`,
    );
    for (let i = 0; i < 2; i++) {
      assert.ok(
        Math.abs(top.feet[i][2] - top.knees[i][2]) < 0.52,
        `${position}: heel must be within shin length of knee`,
      );
      assert.ok(top.knees[i][1] <= 0.3, `${position}: knees belong on the mat`);
    }
  }
});

test("camera hands copy textured model skin without changing source geometry or materials", () => {
  const model = rig();
  const positions = [-0.04, 0, 0, 0.04, 0, 0, 0, 0.14, 0.02];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  geometry.translate(
    ...model
      .getObjectByName("LeftHand")!
      .getWorldPosition(new THREE.Vector3())
      .toArray(),
  );
  geometry.computeVertexNormals();
  const texture = new THREE.Texture(),
    material = new THREE.MeshStandardMaterial({
      map: texture,
      color: "#abcabc",
    });
  const source = new THREE.SkinnedMesh(geometry, material);
  model.add(source);
  model.updateMatrixWorld(true);
  source.bind(
    new THREE.Skeleton([model.getObjectByName("LeftHand") as THREE.Bone]),
  );
  const beforePosition = Array.from(geometry.attributes.position.array),
    beforeUV = Array.from(geometry.attributes.uv.array);
  const hands = new GrapplingHands();
  hands.setModel(model);
  hands.update("#d9a080", 1.4, true, false, 0, true);
  assert.equal(hands.hands[0].userData.modelSkin, true);
  assert.notEqual(hands.hands[0].geometry, geometry);
  assert.notEqual(hands.hands[0].material, material);
  assert.equal(
    (hands.hands[0].material as THREE.MeshStandardMaterial).map,
    texture,
  );
  assert.ok(
    hands.hands[0].scale.x > 0,
    "original left and right geometry must retain winding",
  );
  assert.deepEqual(
    Array.from(geometry.attributes.position.array),
    beforePosition,
  );
  assert.deepEqual(Array.from(geometry.attributes.uv.array), beforeUV);
  assert.equal(material.color.getHexString(), "abcabc");
  const normal = new THREE.Vector3();
  const copiedNormals = hands.hands[0].geometry.getAttribute("normal");
  for (let i = 0; i < copiedNormals.count; i++) {
    normal.fromBufferAttribute(copiedNormals, i);
    assert.ok(
      Math.abs(normal.length() - 1) < 1e-5,
      "copied source normals stay unit length",
    );
  }
  const copied = hands.hands[0].geometry;
  hands.setModel(model);
  assert.equal(
    hands.hands[0].geometry,
    copied,
    "a model's copied hand mesh should be reused",
  );
  const copiedMaterial = hands.hands[0].material as THREE.Material;
  let releasedGeometry = 0,
    releasedMaterial = 0,
    releasedSource = 0;
  copied.addEventListener("dispose", () => releasedGeometry++);
  copiedMaterial.addEventListener("dispose", () => releasedMaterial++);
  geometry.addEventListener("dispose", () => releasedSource++);
  material.addEventListener("dispose", () => releasedSource++);
  hands.releaseModel(model);
  hands.releaseModel(model);
  assert.equal(releasedGeometry, 1);
  assert.equal(releasedMaterial, 1);
  assert.equal(
    releasedSource,
    0,
    "the library owns source geometry, materials and textures",
  );
  assert.notEqual(hands.hands[0].geometry, copied);
});

test("first person keeps a bounded pitch and clears a close opponent's head", () => {
  const { bout, models, camera, presentation } = setup();
  for (const position of ["clinch", "guard", "mount", "back"] as const) {
    bout.grappling!.position = position;
    bout.grappling!.top = 1;
    for (const view of [0, 1]) {
      for (let frame = 0; frame < 5; frame++)
        presentation.update(bout, models, view, 1 / 30, false);
      const forward = camera.getWorldDirection(new THREE.Vector3());
      assert.ok(
        Math.abs(Math.asin(forward.y)) <= 0.49,
        `${position}: pitch must keep the opponent and mat readable`,
      );
      const head = models[1 - view]
        .getObjectByName("Head")!
        .getWorldPosition(new THREE.Vector3());
      assert.ok(
        camera.position.clone().sub(head).setY(0).length() >= 0.7,
        `${position}: camera must clear the opponent's head`,
      );
    }
  }
});

test("submission pressure follows the authoritative zero-to-one-hundred progress", () => {
  const { bout } = setup();
  const state = bout.grappling!;
  state.position = "back";
  state.top = 0;
  state.submission = { kind: "rear-choke", attacker: 0, progress: 0 };
  const relaxed = sampleGrapplingPair(state)[0].spine;
  state.submission.progress = 50;
  const half = sampleGrapplingPair(state)[0].spine;
  state.submission.progress = 100;
  const full = sampleGrapplingPair(state)[0].spine;
  assert.ok(half > relaxed && half < full);
  assert.ok(Math.abs((half - relaxed) * 2 - (full - relaxed)) < 1e-8);
});

test("a takedown keeps the first-person horizon bounded throughout the level change", () => {
  const { bout, models, camera, presentation } = setup();
  const state = bout.grappling!;
  state.position = "clinch";
  state.top = null;
  state.transition = {
    kind: "takedown",
    actor: 0,
    from: "clinch",
    to: "guard",
    top: 0,
    elapsed: 0,
    duration: 1,
    defended: false,
  };
  for (const elapsed of [0, 0.25, 0.5, 0.75, 1]) {
    state.transition.elapsed = elapsed;
    for (const view of [0, 1]) {
      const before = JSON.stringify(bout);
      presentation.update(bout, models, view, 0.05, false);
      const forward = camera.getWorldDirection(new THREE.Vector3());
      assert.ok(Math.abs(Math.asin(forward.y)) <= 0.481);
      assert.ok(camera.position.y >= 0.6);
      assert.equal(JSON.stringify(bout), before);
    }
  }
});

test("a mount armbar settles the attacker beside the shoulder instead of hovering above it", () => {
  const { bout } = setup();
  const state = bout.grappling!;
  state.position = "mount";
  state.top = 1;
  state.submission = { kind: "armbar", attacker: 1, progress: 70 };
  const [defender, attacker] = sampleGrapplingPair(state);
  assert.ok(attacker.pelvis[1] <= 0.34);
  assert.ok(attacker.pelvis[0] >= 0.55);
  assert.ok(
    defender.hands[0][0] >= 0.65,
    "isolated arm must extend across the attacker hip line",
  );
  assert.ok(
    Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(attacker.rotation).y) <
      0.1,
    "the attacker's back belongs on the mat",
  );
});
