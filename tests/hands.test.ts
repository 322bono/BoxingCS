import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createBout } from "../shared/game.ts";
import { FirstPersonHands } from "../src/assets/first-person-hands.ts";
import { addBoxingGloves } from "../src/assets/gloves.ts";
import { disposeOwnedAccessories } from "../src/assets/rig.ts";

test("rig gloves remove only open hand surfaces on instance-owned geometry", () => {
  for (const scale of [1, 0.01]) {
    const root = new T.Group();
    root.scale.setScalar(scale);
    const bones = ["Hips", "LeftHand", "RightHand"].map((name) => {
      const bone = new T.Bone();
      bone.name = name;
      root.add(bone);
      return bone;
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [
          -0.05, 0, 0, 0.05, 0, 0, 0, 0.27, 0, -0.05, 0, 0, 0.05, 0, 0, 0, 0.27,
          0, -0.3, -0.5, 0, 0.3, -0.5, 0, 0, -0.1, 0,
        ].map((v) => v / scale),
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 3, 1);
    geometry.setAttribute(
      "skinIndex",
      new T.Uint16BufferAttribute(
        Array.from({ length: 9 }, (_, i) => [
          i < 3 ? 1 : i < 6 ? 2 : 0,
          0,
          0,
          0,
        ]).flat(),
        4,
      ),
    );
    geometry.setAttribute(
      "skinWeight",
      new T.Float32BufferAttribute(
        Array.from({ length: 9 }, () => [1, 0, 0, 0]).flat(),
        4,
      ),
    );
    const material = new T.MeshStandardMaterial();
    const mesh = new T.SkinnedMesh(geometry, material);
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    addBoxingGloves(root);
    assert.notEqual(
      mesh.geometry,
      geometry,
      "cached source geometry must remain intact",
    );
    assert.deepEqual(
      Array.from(geometry.index!.array),
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(
      Array.from(mesh.geometry.index!.array),
      [6, 7, 8],
      "body triangle survives, open hands do not",
    );
    assert.deepEqual(mesh.geometry.groups, [
      { start: 0, count: 3, materialIndex: 1 },
    ]);
    for (const hand of bones.slice(1)) {
      const box = new T.Box3().setFromObject(hand);
      const size = box.getSize(new T.Vector3());
      assert.ok(
        size.x < 0.28 && size.y < 0.34 && size.z < 0.23,
        "gloves stay human-sized regardless of rig units",
      );
    }
    const owned = mesh.geometry;
    addBoxingGloves(root);
    assert.equal(
      mesh.geometry,
      owned,
      "installing twice must not create another geometry",
    );
    assert.equal(bones[1].children.length, 1);
    let released = false,
      sourceReleased = false,
      materialReleased = false;
    owned.addEventListener("dispose", () => {
      released = true;
    });
    geometry.addEventListener("dispose", () => {
      sourceReleased = true;
    });
    material.addEventListener("dispose", () => {
      materialReleased = true;
    });
    disposeOwnedAccessories(root);
    assert.ok(released);
    assert.equal(sourceReleased, false);
    assert.equal(materialReleased, false);
    geometry.dispose();
    material.dispose();
  }
});

test("resting and guarding gloves leave a central sightline on wide and narrow screens", () => {
  const view = new FirstPersonHands();
  const fighter = createBout(["a", "b"], ["nova", "volt"]).fighters[0];
  const camera = new T.PerspectiveCamera(75, 1, 0.05, 90);
  camera.add(view.root);
  for (const aspect of [16 / 9, 4 / 3, 390 / 844]) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    for (const guard of [false, true]) {
      fighter.guard = guard;
      view.update(fighter, 0, aspect, 0, true);
      camera.updateMatrixWorld(true);
      const boxes = view.hands.map((hand) => {
        const glove = hand.getObjectByName("boxing-glove")!;
        const box = new T.Box3().setFromObject(glove);
        const projected: T.Vector3[] = [];
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z])
              projected.push(new T.Vector3(x, y, z).project(camera));
        return new T.Box3().setFromPoints(projected);
      });
      assert.ok(
        boxes[0].max.x < -0.1 && boxes[1].min.x > 0.1,
        `clear central sightline: ${aspect}/${guard}`,
      );
      assert.ok(
        boxes.every((b) => b.min.y > -1.5 && b.max.y < 0.5),
        "gloves stay near lower screen edges",
      );
    }
  }
});

test("phone layout keeps glove proportions and forearms continue below the visible screen", () => {
  const view = new FirstPersonHands();
  const fighter = createBout(["a", "b"], ["volt", "nova"]).fighters[0];
  const camera = new T.PerspectiveCamera(75, 390 / 844, 0.05, 90);
  camera.add(view.root);
  for (const attack of [0, 0.3]) {
    fighter.kind = "skill";
    fighter.attack = attack;
    view.update(fighter, 0, camera.aspect, 0, true);
    camera.updateMatrixWorld(true);
    for (const hand of view.hands) {
      const scale = hand.getWorldScale(new T.Vector3());
      assert.ok(
        Math.abs(scale.x - scale.y) < 0.001 &&
          Math.abs(scale.y - scale.z) < 0.001,
        "gloves must not be flattened to fit the phone",
      );
    }
    for (const name of ["lead-forearm", "rear-forearm"]) {
      const arm = view.root.getObjectByName(name)!;
      assert.ok(arm, "each wrist has a continuous forearm");
      const elbow = arm.localToWorld(new T.Vector3(0, -0.5, 0)).project(camera);
      assert.ok(
        elbow.y < -1.05,
        "the elbow end must remain below the viewport, including uppercuts",
      );
    }
  }
});

test("jab, hook and all signatures remain in front of the near plane and change only the rendered hands", () => {
  const view = new FirstPersonHands();
  const fighter = createBout(["a", "b"], ["nova", "volt"]).fighters[0];
  for (const character of ["nova", "blaze", "specs", "volt"] as const) {
    fighter.character = character;
    for (const kind of ["jab", "hook", "skill"] as const) {
      fighter.kind = kind;
      for (const progress of [0.05, 0.3, 0.5, 0.8, 1]) {
        fighter.attack =
          progress * (kind === "jab" ? 0.2 : kind === "hook" ? 0.34 : 0.6);
        const snapshot = structuredClone(fighter);
        view.update(fighter, 1, 390 / 844, 4, true);
        view.root.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(view.root);
        assert.ok(
          box.max.z < -0.08 && box.min.z > -1.8,
          `${character}/${kind} must not clip camera`,
        );
        assert.deepEqual(
          fighter,
          snapshot,
          "presentation cannot mutate gameplay state",
        );
      }
    }
  }
  fighter.attack = 0;
  fighter.guard = false;
  view.update(fighter, 0, 16 / 9, 1, true);
  const before = view.hands.map((h) => h.position.toArray());
  view.update(fighter, 0, 16 / 9, 10, true);
  assert.deepEqual(
    view.hands.map((h) => h.position.toArray()),
    before,
    "reduced motion disables idle sway",
  );
});
