import { addBoxingGloves } from "../src/assets/gloves.ts";
import { prepareNativeClips } from "../src/assets/native-clips.ts";
import { createBout } from "../shared/game.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  buildCombatClips,
  prepareFighter,
  signatureIds,
  RigController,
  disposeOwnedAccessories,
} from "../src/assets/rig.ts";
function fixture() {
  const root = new T.Group();
  const hips = new T.Bone();
  hips.name = "mixamorigHips";
  root.add(hips);
  for (const name of [
    "Spine",
    "Head",
    "LeftArm",
    "RightArm",
    "LeftForeArm",
    "RightForeArm",
    "LeftUpLeg",
    "RightUpLeg",
  ]) {
    const b = new T.Bone();
    b.name = "mixamorig" + name;
    b.position.y = 0.2;
    hips.add(b);
  }
  const geometry = new T.BoxGeometry(0.5, 2, 0.3);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "skinIndex",
    new T.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
  );
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  const mesh = new T.SkinnedMesh(
    geometry,
    new T.MeshStandardMaterial({ color: "red" }),
  );
  mesh.add(hips);
  mesh.bind(new T.Skeleton([hips, ...(hips.children as T.Bone[])]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}
test("each character has a distinct playable skill clip and normal combat clips", () => {
  const model = fixture();
  const clips = buildCombatClips(model);
  for (const name of [
    "idle",
    "walk",
    "jab",
    "hook",
    "guard",
    "hit",
    "ko",
    ...signatureIds.map((id) => "skill-" + id),
  ])
    assert.ok(
      clips.some((c) => c.name === name && c.duration > 0),
      name,
    );
  const skill = clips.filter((c) => c.name.startsWith("skill-"));
  assert.equal(
    new Set(
      skill.map((c) =>
        JSON.stringify(c.tracks.map((t) => Array.from(t.values))),
      ),
    ).size,
    8,
  );
  const mixer = new T.AnimationMixer(model);
  const arm = model.getObjectByName("mixamorigRightArm")!;
  const before = arm.quaternion.clone();
  mixer.clipAction(skill[0]).play();
  mixer.update(0.4);
  assert.ok(arm.quaternion.angleTo(before) > 0.01);
});
test("fighter instances preserve skinning but have independent bones", () => {
  const template = fixture();
  const a = prepareFighter(template),
    b = prepareFighter(template);
  const boneA = a.getObjectByName("mixamorigRightArm")!,
    boneB = b.getObjectByName("mixamorigRightArm")!;
  boneA.rotation.x = 1;
  assert.ok(Math.abs(boneB.rotation.x) < 1e-8);
  assert.ok(a.getObjectByProperty("isSkinnedMesh", true));
  assert.ok(new T.Box3().setFromObject(a).getSize(new T.Vector3()).y > 1.9);
});
test("unrigged input is rejected instead of pretending that a static model is animated", () => {
  const root = new T.Group();
  root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
  assert.throws(() => prepareFighter(root), /rig/i);
});
test("a controller reset starts a rematch out of a prior KO pose", () => {
  const root = prepareFighter(fixture());
  const controller = new RigController(root, "ace");
  const f = createBout(["a", "b"], ["ace", "mint"]).fighters[0];
  f.hp = 0;
  controller.update(f, 1);
  assert.equal(controller.current, "ko");
  controller.reset();
  controller.update(
    createBout(["a", "b"], ["ace", "mint"]).fighters[0],
    1 / 30,
  );
  assert.equal(controller.current, "idle");
  assert.equal(controller.lastSkill, 0);
});
test("disposing an instance releases its bone texture without disposing the source skeleton", () => {
  const template = fixture();
  const source = template.getObjectByProperty(
    "isSkinnedMesh",
    true,
  ) as T.SkinnedMesh;
  source.skeleton.computeBoneTexture();
  const instance = prepareFighter(template),
    mesh = instance.getObjectByProperty("isSkinnedMesh", true) as T.SkinnedMesh;
  mesh.skeleton.computeBoneTexture();
  new RigController(instance, "ace").dispose();
  assert.equal(mesh.skeleton.boneTexture, null);
  assert.ok(source.skeleton.boneTexture);
  source.skeleton.dispose();
});
test("native clips override fallback clips and are retimed for responsive combat", () => {
  const root = prepareFighter(fixture());
  const bone = root.getObjectByName("mixamorigRightArm")!;
  const native = new T.AnimationClip("jab", 3, [
    new T.QuaternionKeyframeTrack(
      bone.uuid + ".quaternion",
      [0, 3],
      [0, 0, 0, 1, 0.5, 0, 0, 0.8660254],
    ),
  ]);
  const controller = new RigController(root, "nova", [native]);
  assert.equal(controller.actions.get("jab")!.getClip(), native);
  controller.play("jab");
  controller.mixer.update(0.01);
  assert.ok(
    Math.abs(controller.actions.get("jab")!.getEffectiveTimeScale() - 12.5) <
      0.01,
  );
});
test("dodge and victory states use their own clips and reset between bouts", () => {
  const root = prepareFighter(fixture());
  const clips = buildCombatClips(root);
  const dodge = clips.find((c) => c.name === "hook")!.clone();
  dodge.name = "dodge";
  const taunt = clips.find((c) => c.name === "idle")!.clone();
  taunt.name = "taunt";
  const controller = new RigController(root, "nova", [dodge, taunt]);
  const f = createBout(["a", "b"], ["nova", "blaze"]).fighters[0];
  f.evade = 0.2;
  controller.update(f, 1 / 30);
  assert.equal(controller.current, "dodge");
  controller.celebrate();
  assert.equal(controller.current, "taunt");
  controller.reset();
  f.evade = 0;
  controller.update(f, 1 / 30);
  assert.equal(controller.current, "idle");
});
test("native animation root motion is removed without changing cached clips", () => {
  const root = fixture();
  const clip = new T.AnimationClip("OriginalJab", 2, [
    new T.VectorKeyframeTrack(
      "mixamorigHips.position",
      [0, 2],
      [10, 1, 20, 15, 2, 25],
    ),
    new T.QuaternionKeyframeTrack(
      "mixamorigRightArm.quaternion",
      [0, 2],
      [0, 0, 0, 1, 0.5, 0, 0, 0.8660254],
    ),
  ]);
  const prepared = prepareNativeClips(root, [clip], { jab: "OriginalJab" });
  const moved = prepared.find((c) => c.name === "jab")!.tracks[0].values;
  assert.equal(moved[0], 0);
  assert.equal(moved[2], 0);
  assert.equal(moved[3], 0);
  assert.equal(moved[5], 0);
  assert.equal(clip.tracks[0].values[0], 10);
  for (const name of ["guard", "idle", "walk", "hit"])
    assert.ok(prepared.some((c) => c.name === name));
});
test("boxing gloves follow hand bones at the same world size across differently scaled rigs", () => {
  for (const factor of [0.01, 1]) {
    const root = new T.Group();
    root.scale.setScalar(factor);
    const hand = new T.Bone();
    hand.name = "LeftHand";
    root.add(hand);
    addBoxingGloves(root);
    root.updateMatrixWorld(true);
    const glove = hand.children[0] as T.Mesh;
    assert.equal(hand.children.length, 2);
    assert.ok(Math.abs(glove.getWorldScale(new T.Vector3()).x - 0.105) < 1e-6);
    let released = false;
    (glove.material as T.Material).addEventListener("dispose", () => {
      released = true;
    });
    disposeOwnedAccessories(root);
    assert.equal(released, true);
  }
});
test("walking survives render frames between lower-frequency simulation snapshots", () => {
  const root = prepareFighter(fixture()),
    controller = new RigController(root, "nova");
  const f = createBout(["a", "b"], ["nova", "blaze"]).fighters[0];
  controller.update(f, 1 / 60);
  f.x += 0.1;
  controller.update(f, 1 / 60);
  assert.equal(controller.current, "walk");
  controller.update(f, 1 / 60);
  assert.equal(controller.current, "walk");
  for (let i = 0; i < 20; i++) controller.update(f, 1 / 60);
  assert.equal(controller.current, "idle");
});

test("gloves enclose open fingertips on a rig with longer hands", () => {
  for (const scale of [1, 0.01]) {
    const root = new T.Group();
    root.scale.setScalar(scale);
    const hand = new T.Bone();
    hand.name = "LeftHand";
    const tips = [
      new T.Vector3(0, 0.254, 0.03),
      new T.Vector3(0.067, 0.18, 0.06),
      new T.Vector3(-0.086, 0.16, -0.057),
      new T.Vector3(0, 0.01, 0),
    ];
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        tips.flatMap((v) => v.clone().divideScalar(scale).toArray()),
        3,
      ),
    );
    geometry.setAttribute(
      "skinIndex",
      new T.Uint16BufferAttribute(new Array(tips.length * 4).fill(0), 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new T.Float32BufferAttribute(
        tips.flatMap(() => [1, 0, 0, 0]),
        4,
      ),
    );
    const mesh = new T.SkinnedMesh(geometry, new T.MeshBasicMaterial());
    root.add(hand, mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton([hand]));
    addBoxingGloves(root);
    root.updateMatrixWorld(true);
    const mitt = hand.children[0] as T.Mesh;
    for (let i = 0; i < tips.length; i++) {
      const vertex = mesh.applyBoneTransform(
        i,
        new T.Vector3().fromBufferAttribute(
          geometry.getAttribute("position"),
          i,
        ),
      );
      mesh.localToWorld(vertex);
      assert.ok(
        mitt.worldToLocal(vertex).length() < 1,
        "skin must stay inside the glove",
      );
    }
    disposeOwnedAccessories(root);
    geometry.dispose();
    (mesh.material as T.Material).dispose();
  }
});
