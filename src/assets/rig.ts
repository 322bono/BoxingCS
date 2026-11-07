import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Fighter } from "../../shared/game";
export const signatureIds = [
  "mint",
  "ace",
  "ink",
  "stone",
  "nova",
  "blaze",
  "specs",
  "volt",
] as const;
type Joint =
  | "hips"
  | "spine"
  | "head"
  | "leftArm"
  | "rightArm"
  | "leftForeArm"
  | "rightForeArm"
  | "leftLeg"
  | "rightLeg";
type Pose = Partial<Record<Joint, [number, number, number]>>;
const alias: Record<Joint, string[]> = {
  hips: ["hips", "pelvis"],
  spine: ["spine", "spine1", "spine01", "chest"],
  head: ["head"],
  leftArm: ["leftarm", "upperarml", "lupperarm", "leftupperarm"],
  rightArm: ["rightarm", "upperarmr", "rupperarm", "rightupperarm"],
  leftForeArm: ["leftforearm", "forearml", "leftlowerarm", "lowerarml"],
  rightForeArm: ["rightforearm", "forearmr", "rightlowerarm", "lowerarmr"],
  leftLeg: ["leftupleg", "upperlegl", "thighl"],
  rightLeg: ["rightupleg", "upperlegr", "thighr"],
};
function joints(root: THREE.Object3D) {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
  });
  const found: Partial<Record<Joint, THREE.Bone>> = {};
  for (const joint of Object.keys(alias) as Joint[]) {
    found[joint] = bones.find((b) => {
      const n = b.name
        .toLowerCase()
        .replace(/mixamorig\d*|armature|[^a-z0-9]/g, "");
      return alias[joint].includes(n);
    });
  }
  return found;
}
const guard: Pose = {
  leftArm: [-0.4, 0, 0.7],
  rightArm: [-0.4, 0, -0.7],
  leftForeArm: [-1.25, 0, 0],
  rightForeArm: [-1.25, 0, 0],
};
// Separate authored pose timelines. Values are rotations relative to the imported bind pose.
const signatures: Record<(typeof signatureIds)[number], Pose[]> = {
  mint: [
    { spine: [-0.2, -0.25, 0], rightArm: [-0.7, 0, -0.9] },
    {
      spine: [0.12, 0.6, 0],
      rightArm: [-1.5, -0.4, -0.4],
      rightForeArm: [-0.2, 0, 0],
    },
    { spine: [0, 0.1, 0] },
  ],
  ace: [
    { spine: [0.23, 0.4, 0.12], leftArm: [-0.4, 0, 0.8] },
    {
      spine: [0.12, -0.5, 0],
      leftArm: [-1.6, 0.3, 0.1],
      leftForeArm: [-0.1, 0, 0],
    },
    {
      spine: [0.04, 0.55, -0.08],
      rightArm: [-1.7, -0.4, -0.15],
      rightForeArm: [-0.05, 0, 0],
    },
  ],
  ink: [
    { spine: [-0.18, -0.75, -0.15], rightArm: [0.2, -0.5, -1.2] },
    {
      spine: [0.25, 0.85, 0.17],
      rightArm: [-1.3, 0.85, -0.7],
      rightForeArm: [-0.6, 0, 0],
    },
    { spine: [0.15, 0.35, 0.08], head: [0.1, -0.2, 0] },
  ],
  stone: [
    { spine: [0.5, 0, 0], leftArm: [0.3, 0, 0.5], rightArm: [0.3, 0, -0.5] },
    {
      spine: [-0.25, 0.2, 0],
      leftArm: [-1.8, 0, 0.2],
      rightArm: [-1.8, 0, -0.2],
    },
    { spine: [-0.12, 0, 0], head: [-0.1, 0, 0] },
  ],
  nova: [
    { spine: [0.2, -0.2, 0], leftArm: [-0.8, 0, 0.5] },
    { spine: [0.05, -0.6, 0], leftArm: [-1.7, 0.2, 0], leftForeArm: [0, 0, 0] },
    {
      spine: [0.2, 0.7, -0.1],
      rightArm: [-1.5, -0.6, -0.2],
      rightForeArm: [-0.1, 0, 0],
    },
  ],
  blaze: [
    { spine: [-0.2, -0.6, -0.2], rightArm: [-2, 0, -0.7] },
    {
      spine: [0.6, 0.9, 0.15],
      rightArm: [-1, 0.3, -0.6],
      rightForeArm: [-0.15, 0, 0],
    },
    { spine: [0.35, 0.5, 0], head: [0.1, 0, 0] },
  ],
  specs: [
    {
      spine: [-0.4, -0.3, 0],
      leftForeArm: [-1.6, 0, 0],
      rightForeArm: [-1.6, 0, 0],
    },
    {
      spine: [0.07, 0.65, 0],
      rightArm: [-1.65, -0.1, -0.1],
      rightForeArm: [-0.05, 0, 0],
    },
    { spine: [-0.1, 0.1, 0], leftArm: [-0.8, 0, 0.5] },
  ],
  volt: [
    { spine: [0.6, -0.5, 0.2], rightArm: [0.5, 0, -0.3] },
    {
      spine: [-0.35, 0.65, -0.1],
      rightArm: [-2.3, -0.5, -0.2],
      rightForeArm: [-0.8, 0, 0],
    },
    { spine: [-0.1, 0.3, 0], leftLeg: [-0.3, 0, 0], head: [-0.15, 0, 0] },
  ],
};
export function buildCombatClips(root: THREE.Object3D): THREE.AnimationClip[] {
  const bones = joints(root);
  if (!bones.spine || !bones.leftArm || !bones.rightArm)
    throw Error("Unsupported rig: spine and both upper arms are required");
  function clip(name: string, duration: number, poses: Pose[], loop = false) {
    const frames = name === "ko" ? [guard, ...poses] : [guard, ...poses, guard],
      tracks: THREE.QuaternionKeyframeTrack[] = [];
    for (const [joint, bone] of Object.entries(bones) as [
      Joint,
      THREE.Bone | undefined,
    ][]) {
      if (!bone) continue;
      const values: number[] = [];
      for (const frame of frames) {
        const rotation = { ...guard, ...frame }[joint] || [0, 0, 0];
        const q = bone.quaternion
          .clone()
          .multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
          );
        values.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${bone.uuid}.quaternion`,
          frames.map((_, i) => (duration * i) / (frames.length - 1)),
          values,
        ),
      );
    }
    const result = new THREE.AnimationClip(name, duration, tracks);
    return result;
  }
  return [
    clip(
      "idle",
      1.8,
      [{ spine: [0.035, 0, 0.015] }, { spine: [-0.025, 0, -0.015] }],
      true,
    ),
    clip(
      "walk",
      0.65,
      [
        { leftLeg: [-0.35, 0, 0], rightLeg: [0.25, 0, 0], spine: [0, 0, 0.06] },
        {
          leftLeg: [0.25, 0, 0],
          rightLeg: [-0.35, 0, 0],
          spine: [0, 0, -0.06],
        },
      ],
      true,
    ),
    clip("jab", 0.24, [
      {
        spine: [0, -0.25, 0],
        leftArm: [-1.6, 0.2, 0.1],
        leftForeArm: [-0.1, 0, 0],
      },
    ]),
    clip("hook", 0.4, [
      { spine: [0, -0.45, 0], rightArm: [-0.5, 0, -1] },
      { spine: [0.05, 0.55, 0], rightArm: [-1, 0.7, -0.5] },
    ]),
    clip(
      "guard",
      1,
      [
        {
          spine: [0.1, 0, 0],
          leftForeArm: [-1.55, 0, 0],
          rightForeArm: [-1.55, 0, 0],
        },
      ],
      true,
    ),
    clip("hit", 0.25, [{ spine: [-0.24, -0.14, 0.08], head: [-0.15, 0, 0] }]),
    clip("ko", 1, [
      { hips: [-0.55, 0, 0.3], spine: [-0.4, 0, 0] },
      { hips: [-1.4, 0, 0.2], spine: [-0.3, 0, 0] },
    ]),
    ...signatureIds.map((id) =>
      clip("skill-" + id, id === "ink" ? 1.15 : 0.95, signatures[id]),
    ),
  ];
}
export function prepareFighter(source: THREE.Object3D): THREE.Group {
  let rigged = false;
  source.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.skeleton.bones.length)
      rigged = true;
  });
  if (!rigged)
    throw Error("Unrigged model: a skinned humanoid rig is required");
  const model = clone(source);
  const outer = new THREE.Group();
  outer.add(model);
  outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model),
    size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0)
    throw Error("Invalid rig bounds");
  const scale = 2.1 / size.y;
  model.scale.multiplyScalar(scale);
  outer.updateMatrixWorld(true);
  const normalized = new THREE.Box3().setFromObject(model),
    center = normalized.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, normalized.min.y, center.z));
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  outer.updateMatrixWorld(true);
  return outer;
}
export function disposeOwnedAccessories(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.ownedAccessory) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
export class RigController {
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current = "";
  lockedUntil = 0;
  lastSkill = 0;
  lastHp = 100;
  previousX = 0;
  previousZ = 0;
  initialized = false;
  elapsed = 0;
  movingUntil = 0;
  victorious = false;
  constructor(
    public root: THREE.Group,
    public character: string,
    clips: THREE.AnimationClip[] = [],
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of [...clips, ...buildCombatClips(root)]) {
      if (!this.actions.has(clip.name))
        this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }
  play(name: string, lock = 0) {
    if (this.current === name && this.actions.get(name)?.isRunning()) return;
    const previous = this.actions.get(this.current),
      action = this.actions.get(name);
    if (!action) return;
    action
      .reset()
      .setLoop(
        ["idle", "walk", "guard"].includes(name)
          ? THREE.LoopRepeat
          : THREE.LoopOnce,
        ["idle", "walk", "guard"].includes(name) ? Infinity : 1,
      );
    const duration = this.duration(name);
    action.setDuration(duration);
    action.clampWhenFinished = true;
    action.fadeIn(0.075).play();
    if (previous !== action) previous?.fadeOut(0.075);
    this.current = name;
    this.lockedUntil = this.elapsed + lock;
  }
  private duration(name: string) {
    return name.startsWith("skill-")
      ? this.character === "blaze" || this.character === "ink"
        ? 1.05
        : 0.85
      : {
          jab: 0.24,
          hook: 0.4,
          hit: 0.25,
          dodge: 0.3,
          ko: 1.2,
          taunt: 1.8,
          walk: 0.8,
          idle: 2,
          guard: 2,
        }[name] || 1;
  }
  celebrate() {
    if (this.victorious || !this.actions.has("taunt")) return;
    this.victorious = true;
    this.play("taunt", Infinity);
  }
  update(state: Fighter, dt: number) {
    this.elapsed += dt;
    if (
      this.initialized &&
      Math.hypot(state.x - this.previousX, state.z - this.previousZ) > 0.001
    )
      this.movingUntil = this.elapsed + 0.12;
    const moving = this.initialized && this.elapsed < this.movingUntil;
    this.previousX = state.x;
    this.previousZ = state.z;
    this.initialized = true;
    if (state.hp <= 0) {
      if (this.current !== "ko") this.play("ko", 10);
    } else if (state.skillSerial > this.lastSkill) {
      const name = "skill-" + this.character;
      this.play(name, this.duration(name));
    } else if (
      state.evade > 0 &&
      this.current !== "dodge" &&
      this.actions.has("dodge")
    )
      this.play("dodge", 0.3);
    else if (state.hp < this.lastHp) this.play("hit", 0.2);
    else if (this.elapsed >= this.lockedUntil) {
      if (state.attack > 0 && state.kind !== "skill")
        this.play(state.kind, state.attack);
      else this.play(state.guard ? "guard" : moving ? "walk" : "idle");
    }
    this.lastHp = state.hp;
    this.lastSkill = state.skillSerial;
    this.mixer.update(dt);
  }
  reset() {
    this.mixer.stopAllAction();
    this.mixer.setTime(0);
    this.current = "";
    this.victorious = false;
    this.lockedUntil = 0;
    this.elapsed = 0;
    this.movingUntil = 0;
    this.lastSkill = 0;
    this.lastHp = 100;
    this.previousX = 0;
    this.previousZ = 0;
    this.initialized = false;
  }
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    const skeletons = new Set<THREE.Skeleton>();
    this.root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
    disposeOwnedAccessories(this.root);
  }
}
