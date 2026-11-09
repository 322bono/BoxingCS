import * as THREE from "three";
import { CHARACTERS, type Bout } from "../shared/game";
import { GrapplingHands } from "./assets/grappling-hands";
import {
  sampleGrapplingPair,
  type GrapplingPose,
  type GrapplingStateView,
  type Point3,
} from "./assets/grappling-poses";

type Joint =
  | "hips"
  | "spine"
  | "head"
  | "leftArm"
  | "rightArm"
  | "leftForeArm"
  | "rightForeArm"
  | "leftHand"
  | "rightHand"
  | "leftUpLeg"
  | "rightUpLeg"
  | "leftLeg"
  | "rightLeg"
  | "leftFoot"
  | "rightFoot";
type SavedBone = {
  bone: THREE.Bone;
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
  scale: THREE.Vector3;
};
type Rig = {
  root: THREE.Group;
  bones: Partial<Record<Joint, THREE.Bone>>;
  saved: SavedBone[];
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  visible: boolean;
  neutralFeet: [THREE.Quaternion | null, THREE.Quaternion | null];
};
const aliases: Record<Joint, string[]> = {
  hips: ["hips", "pelvis"],
  spine: ["spine", "chest", "spine1"],
  head: ["head"],
  leftArm: ["leftarm", "leftupperarm", "upperarml"],
  rightArm: ["rightarm", "rightupperarm", "upperarmr"],
  leftForeArm: ["leftforearm", "leftlowerarm", "forearml"],
  rightForeArm: ["rightforearm", "rightlowerarm", "forearmr"],
  leftHand: ["lefthand", "handl"],
  rightHand: ["righthand", "handr"],
  leftUpLeg: ["leftupleg", "leftupperleg", "thighl"],
  rightUpLeg: ["rightupleg", "rightupperleg", "thighr"],
  leftLeg: ["leftleg", "leftlowerleg", "calfl"],
  rightLeg: ["rightleg", "rightlowerleg", "calfr"],
  leftFoot: ["leftfoot", "footl"],
  rightFoot: ["rightfoot", "footr"],
};
const V = () => new THREE.Vector3();
function clearCamera(
  eye: THREE.Vector3,
  obstacle: THREE.Vector3,
  fallback: THREE.Vector3,
) {
  const away = eye.clone().sub(obstacle).setY(0);
  const distance = away.length();
  if (distance >= 0.82) return;
  if (distance < 0.0001) away.copy(fallback).setY(0);
  eye.addScaledVector(away.normalize(), 0.82 - distance);
}
const bindPoses = new WeakMap<THREE.Group, SavedBone[]>();
function stopAndBind(root: THREE.Group): Rig {
  const controller = root.userData.rigController as
    { reset?: () => void; mixer?: THREE.AnimationMixer } | undefined;
  controller?.reset?.();
  controller?.mixer?.stopAllAction();
  root.updateMatrixWorld(true);
  // Mixer reset restores imported local transforms. Skeleton.pose() is unsuitable
  // here: the Meshy armature has a non-bone parent scaled by .01, which it applies
  // twice to root bones. Share the pristine local pose with preview instances.
  let saved = bindPoses.get(root);
  if (!saved) {
    saved = [];
    root.traverse((object) => {
      if (object instanceof THREE.Bone)
        saved!.push({
          bone: object,
          quaternion: object.quaternion.clone(),
          position: object.position.clone(),
          scale: object.scale.clone(),
        });
    });
    bindPoses.set(root, saved);
  }
  for (const bind of saved) {
    bind.bone.quaternion.copy(bind.quaternion);
    bind.bone.position.copy(bind.position);
    bind.bone.scale.copy(bind.scale);
  }
  const bones: Rig["bones"] = {};
  for (const joint of Object.keys(aliases) as Joint[]) {
    bones[joint] = saved.find(({ bone }) =>
      aliases[joint].includes(
        bone.name.toLowerCase().replace(/mixamorig\d*|armature|[^a-z0-9]/g, ""),
      ),
    )?.bone;
  }
  root.updateMatrixWorld(true);
  const inverseRoot = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const neutralFeet = [bones.leftFoot, bones.rightFoot].map((foot) =>
    foot
      ? inverseRoot
          .clone()
          .multiply(foot.getWorldQuaternion(new THREE.Quaternion()))
      : null,
  ) as Rig["neutralFeet"];
  return {
    root,
    bones,
    saved,
    position: root.position.clone(),
    quaternion: root.quaternion.clone(),
    visible: root.visible,
    neutralFeet,
  };
}
function restoreBones(rig: Rig) {
  for (const saved of rig.saved) {
    saved.bone.quaternion.copy(saved.quaternion);
    saved.bone.position.copy(saved.position);
    saved.bone.scale.copy(saved.scale);
  }
}
function worldQuaternion(bone: THREE.Bone, desired: THREE.Quaternion) {
  const parent =
    bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ??
    new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(desired));
  bone.updateMatrixWorld(true);
}
/** Two rigid segments; target is clamped to measured reach and a pole chooses the anatomical bend. */
function limb(
  a: THREE.Bone | undefined,
  b: THREE.Bone | undefined,
  c: THREE.Bone | undefined,
  target: THREE.Vector3,
  pole: THREE.Vector3,
) {
  if (!a || !b || !c) return;
  const start = a.getWorldPosition(V()),
    middle = b.getWorldPosition(V()),
    end = c.getWorldPosition(V());
  const upper = start.distanceTo(middle),
    lower = middle.distanceTo(end);
  if (upper < 0.001 || lower < 0.001) return;
  const direction = target.clone().sub(start);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    Math.abs(upper - lower) + 0.004,
    upper + lower - 0.008,
  );
  if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
  direction.normalize();
  const bend = pole
    .clone()
    .sub(start)
    .addScaledVector(direction, -pole.clone().sub(start).dot(direction));
  if (bend.lengthSq() < 1e-8)
    bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
  if (bend.lengthSq() < 1e-8)
    bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
  bend.normalize();
  const projection =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const elbow = start
    .clone()
    .addScaledVector(direction, projection)
    .addScaledVector(
      bend,
      Math.sqrt(Math.max(0, upper * upper - projection * projection)),
    );
  const rotate = new THREE.Quaternion().setFromUnitVectors(
    middle.clone().sub(start).normalize(),
    elbow.clone().sub(start).normalize(),
  );
  worldQuaternion(
    a,
    rotate.multiply(a.getWorldQuaternion(new THREE.Quaternion())),
  );
  const actualMiddle = b.getWorldPosition(V()),
    actualEnd = c.getWorldPosition(V());
  const limitedTarget = start.clone().addScaledVector(direction, distance);
  const forearmRotation = new THREE.Quaternion().setFromUnitVectors(
    actualEnd.sub(actualMiddle).normalize(),
    limitedTarget.sub(actualMiddle).normalize(),
  );
  worldQuaternion(
    b,
    forearmRotation.multiply(b.getWorldQuaternion(new THREE.Quaternion())),
  );
}
function solveLimbs(
  rig: Rig,
  pose: GrapplingPose,
  transform: (point: Point3) => THREE.Vector3,
) {
  const b = rig.bones;
  limb(
    b.leftArm,
    b.leftForeArm,
    b.leftHand,
    transform(pose.hands[0]),
    transform(pose.elbows[0]),
  );
  limb(
    b.rightArm,
    b.rightForeArm,
    b.rightHand,
    transform(pose.hands[1]),
    transform(pose.elbows[1]),
  );
  limb(
    b.leftUpLeg,
    b.leftLeg,
    b.leftFoot,
    transform(pose.feet[0]),
    transform(pose.knees[0]),
  );
  limb(
    b.rightUpLeg,
    b.rightLeg,
    b.rightFoot,
    transform(pose.feet[1]),
    transform(pose.knees[1]),
  );
}
function applyPose(
  rig: Rig,
  pose: GrapplingPose,
  anchor: THREE.Vector3,
  rotation: THREE.Quaternion,
) {
  const { root, bones } = rig;
  restoreBones(rig);
  root.quaternion.copy(rotation).multiply(pose.rotation);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const transform = (point: Point3) =>
    new THREE.Vector3(...point).applyQuaternion(rotation).add(anchor);
  if (bones.hips) {
    const current = bones.hips.getWorldPosition(V()),
      desired = transform(pose.pelvis);
    if (root.parent) {
      root.position.add(
        root.parent
          .worldToLocal(desired)
          .sub(root.parent.worldToLocal(current)),
      );
    } else root.position.add(desired.sub(current));
  } else root.position.copy(transform([pose.pelvis[0], 0.15, pose.pelvis[2]]));
  if (bones.spine)
    bones.spine.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.spine, 0, 0)),
    );
  root.updateMatrixWorld(true);
  solveLimbs(rig, pose, transform);
  const yaw = new THREE.Euler().setFromQuaternion(pose.rotation, "YXZ").y;
  const footFacing = rotation
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    );
  [bones.leftFoot, bones.rightFoot].forEach((foot, i) => {
    if (foot && rig.neutralFeet[i])
      worldQuaternion(foot, footFacing.clone().multiply(rig.neutralFeet[i]!));
  });
  root.updateMatrixWorld(true);
}

const fallback: GrapplingStateView = {
  position: "standing",
  top: null,
  grip: [0, 0],
  control: [0, 0],
  positionAge: 0,
  transition: null,
  submission: null,
};

export class GrapplingPresentation {
  readonly root: THREE.Group;
  private hands = new GrapplingHands();
  private rigs = new Map<THREE.Group, Rig>();
  private boutId = "";
  private viewKey = "";
  private time = 0;
  private cameraReady = false;
  private cameraTarget = V();
  constructor(private camera: THREE.PerspectiveCamera) {
    this.root = this.hands.root;
    this.root.visible = false;
  }
  reset() {
    for (const rig of this.rigs.values()) {
      this.hands.releaseModel(rig.root);
      restoreBones(rig);
      rig.root.position.copy(rig.position);
      rig.root.quaternion.copy(rig.quaternion);
      rig.root.visible = rig.visible;
      rig.root.updateMatrixWorld(true);
    }
    this.rigs.clear();
    this.root.visible = false;
    this.boutId = this.viewKey = "";
    this.time = 0;
    this.cameraReady = false;
  }
  update(
    bout: Bout,
    models: THREE.Group[],
    view: number,
    dt: number,
    reduced: boolean,
    mode: "first" | "broadcast" = "first",
  ) {
    if (this.boutId !== bout.id) {
      this.reset();
      this.boutId = bout.id;
    }
    if (models.length < 2) return;
    for (const [model, rig] of this.rigs)
      if (!models.includes(model)) {
        restoreBones(rig);
        model.visible = rig.visible;
        this.hands.releaseModel(model);
        this.rigs.delete(model);
      }
    for (const model of models)
      if (!this.rigs.has(model)) {
        this.rigs.set(model, stopAndBind(model));
        // Cache the real hands before applying any paired pose to this instance.
        this.hands.setModel(model);
      }
    const index = view === 1 ? 1 : 0;
    const key = `${index}:${mode}`;
    if (key !== this.viewKey) {
      this.viewKey = key;
      this.cameraReady = false;
      this.time = 0;
    }
    const frameDt = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    this.time += frameDt;
    const state =
      (bout as Bout & { grappling?: GrapplingStateView | null }).grappling ??
      fallback;
    const [a, b] = bout.fighters;
    const anchor = new THREE.Vector3(
      THREE.MathUtils.clamp((a.x + b.x) / 2, -2.0, 2.0),
      0,
      THREE.MathUtils.clamp((a.z + b.z) / 2, -2.0, 2.0),
    );
    const yaw = Math.atan2(a.x - b.x, a.z - b.z);
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const distance = THREE.MathUtils.clamp(
      Math.hypot(a.x - b.x, a.z - b.z),
      1.1,
      3.4,
    );
    const poses = sampleGrapplingPair(state, distance);
    models.slice(0, 2).forEach((model, i) => {
      const rig = this.rigs.get(model)!;
      applyPose(rig, poses[i], anchor, rotation);
      model.visible = mode === "broadcast" || i !== index;
    });
    const own = this.rigs.get(models[index])!,
      opponent = this.rigs.get(models[1 - index])!;
    const ground = state.position !== "standing" && state.position !== "clinch";
    let eye: THREE.Vector3, target: THREE.Vector3;
    const opponentHead = opponent.bones.head?.getWorldPosition(V());
    const retreat = new THREE.Vector3(...poses[index].pelvis)
      .sub(new THREE.Vector3(...poses[1 - index].pelvis))
      .setY(0)
      .applyQuaternion(rotation);
    if (retreat.lengthSq() < 0.0001)
      retreat.set(0, 0, index === 0 ? 1 : -1).applyQuaternion(rotation);
    if (mode === "broadcast") {
      const phone =
        1 / Math.sqrt(THREE.MathUtils.clamp(this.camera.aspect, 0.4, 1));
      eye = new THREE.Vector3(
        3.1 * phone,
        ground ? 2.8 * phone : 2.7 * phone,
        4.0 * phone,
      )
        .applyQuaternion(rotation)
        .add(anchor);
      target = anchor
        .clone()
        .add(new THREE.Vector3(0, ground ? 0.72 : 1.02, 0));
    } else {
      eye =
        own.bones.head?.getWorldPosition(V()) ??
        new THREE.Vector3(...poses[index].pelvis)
          .applyQuaternion(rotation)
          .add(anchor)
          .add(new THREE.Vector3(0, 0.65, 0));
      eye.y = Math.max(0.6, eye.y + 0.1);
      const focusBone = opponent.bones.spine ?? opponent.bones.hips;
      target =
        focusBone?.getWorldPosition(V()) ??
        new THREE.Vector3(...poses[1 - index].pelvis)
          .applyQuaternion(rotation)
          .add(anchor);
      if (opponentHead) target.lerp(opponentHead, 0.5);
      // Follow the upper chest instead of looking through a dipping head. The
      // relaxed head offset gives close clinches room without a sudden roll.
      clearCamera(eye, target, retreat);
      if (opponentHead) clearCamera(eye, opponentHead, retreat);
    }
    const blend = this.cameraReady
      ? 1 - Math.exp(-frameDt * (reduced ? 12 : 8))
      : 1;
    this.camera.position.lerp(eye, blend);
    this.cameraTarget.lerp(target, blend);
    if (mode === "first") {
      // Recheck after smoothing: a new transition can move the opponent faster
      // than the camera. Keep that head outside the near field on this frame.
      clearCamera(this.camera.position, target, retreat);
      if (opponentHead)
        clearCamera(this.camera.position, opponentHead, retreat);
      const horizontal = this.cameraTarget
        .clone()
        .sub(this.camera.position)
        .setY(0)
        .length();
      const rise = Math.tan(0.48) * Math.max(0.1, horizontal);
      this.cameraTarget.y = THREE.MathUtils.clamp(
        this.cameraTarget.y,
        this.camera.position.y - rise,
        this.camera.position.y + rise,
      );
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld(true);
    this.cameraReady = true;
    this.root.visible = mode === "first";
    const character = CHARACTERS.find(
      (character) => character.id === bout.fighters[index].character,
    );
    this.hands.setModel(models[index]);
    this.hands.update(
      character?.skin ?? "#e2b49b",
      this.camera.aspect,
      ground,
      !!state.transition || !!state.submission,
      this.time,
      reduced,
    );
  }
}

const previews = new WeakMap<THREE.Group, Rig>();
/** Neutral, open-hand grappling stance. Leaves the preview's placement and facing to its caller. */
export function applyGrapplingPreview(
  root: THREE.Group,
  time: number,
  skill = false,
) {
  let rig = previews.get(root);
  if (!rig) {
    rig = stopAndBind(root);
    previews.set(root, rig);
  }
  restoreBones(rig);
  const pose = sampleGrapplingPair(fallback, 1.3)[1];
  const sway = Math.sin(time * 1.7) * 0.008;
  if (rig.bones.spine)
    rig.bones.spine.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08 + sway, 0, 0)),
    );
  root.updateMatrixWorld(true);
  // This single-character stance has no imaginary opponent or retained contact anchor.
  pose.hands = [
    [0.25, 1.45 + sway, skill ? 0.48 : 0.37],
    [-0.25, 1.41 - sway, 0.36],
  ];
  pose.elbows = [
    [0.43, 1.24, 0.13],
    [-0.43, 1.23, 0.13],
  ];
  pose.feet = [
    [0.22, 0.2, -0.08],
    [-0.22, 0.2, 0.15],
  ];
  pose.knees = [
    [0.25, 0.61, 0.1],
    [-0.25, 0.61, 0.2],
  ];
  solveLimbs(rig, pose, (point) =>
    root.localToWorld(new THREE.Vector3(...point)),
  );
  root.updateMatrixWorld(true);
}
