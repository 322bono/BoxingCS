import * as THREE from "three";

export type GrapplingPosition =
  "standing" | "clinch" | "guard" | "side" | "mount" | "back";
export type Point3 = [number, number, number];
export type GrapplingPose = {
  pelvis: Point3;
  rotation: THREE.Quaternion;
  hands: [Point3, Point3];
  elbows: [Point3, Point3];
  feet: [Point3, Point3];
  knees: [Point3, Point3];
  spine: number;
};
export type GrapplingStateView = {
  position: GrapplingPosition;
  top: 0 | 1 | null;
  grip: [number, number];
  control: [number, number];
  positionAge: number;
  transition: {
    kind: string;
    actor: 0 | 1;
    from: GrapplingPosition;
    to: GrapplingPosition;
    top: 0 | 1 | null;
    elapsed: number;
    duration: number;
    defended: boolean;
  } | null;
  submission: {
    attacker: 0 | 1;
    kind: "armbar" | "triangle" | "rear-choke";
    progress: number;
  } | null;
};

const q = (pitch = 0, yaw = 0, roll = 0) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
const copy = (pose: GrapplingPose): GrapplingPose => ({
  pelvis: [...pose.pelvis],
  rotation: pose.rotation.clone(),
  spine: pose.spine,
  hands: pose.hands.map((p) => [...p]) as [Point3, Point3],
  elbows: pose.elbows.map((p) => [...p]) as [Point3, Point3],
  feet: pose.feet.map((p) => [...p]) as [Point3, Point3],
  knees: pose.knees.map((p) => [...p]) as [Point3, Point3],
});
const pointMix = (a: Point3, b: Point3, t: number): Point3 =>
  a.map((n, i) => THREE.MathUtils.lerp(n, b[i], t)) as Point3;
export function blendGrapplingPose(
  a: GrapplingPose,
  b: GrapplingPose,
  t: number,
): GrapplingPose {
  return {
    pelvis: pointMix(a.pelvis, b.pelvis, t),
    rotation: a.rotation.clone().slerp(b.rotation, t),
    spine: THREE.MathUtils.lerp(a.spine, b.spine, t),
    hands: [
      pointMix(a.hands[0], b.hands[0], t),
      pointMix(a.hands[1], b.hands[1], t),
    ],
    elbows: [
      pointMix(a.elbows[0], b.elbows[0], t),
      pointMix(a.elbows[1], b.elbows[1], t),
    ],
    feet: [
      pointMix(a.feet[0], b.feet[0], t),
      pointMix(a.feet[1], b.feet[1], t),
    ],
    knees: [
      pointMix(a.knees[0], b.knees[0], t),
      pointMix(a.knees[1], b.knees[1], t),
    ],
  };
}
function standing(
  index: number,
  clinch: boolean,
  distance: number,
): GrapplingPose {
  const sign = index === 0 ? 1 : -1;
  const z = sign * (clinch ? 0.42 : distance / 2);
  // The imported LeftArm is on the model's positive X side.
  const left = index === 0 ? -1 : 1;
  const reach = clinch ? 0.04 : Math.max(0.04, Math.abs(z) - 0.48);
  return {
    pelvis: [0, 1.06, z],
    rotation: q(clinch ? 0.17 : 0.08, index === 0 ? Math.PI : 0),
    spine: 0.03,
    hands: [
      [left * 0.23, 1.48, sign * reach],
      [-left * 0.23, 1.4, sign * reach],
    ],
    elbows: [
      [left * 0.43, 1.26, z - sign * 0.15],
      [-left * 0.43, 1.25, z - sign * 0.15],
    ],
    feet: [
      [left * 0.22, 0.23, z - sign * 0.16],
      [-left * 0.22, 0.23, z + sign * 0.19],
    ],
    knees: [
      [left * 0.25, 0.6, z - sign * 0.23],
      [-left * 0.25, 0.6, z - sign * 0.07],
    ],
  };
}
function bottom(): GrapplingPose {
  return {
    pelvis: [0, 0.31, -0.02],
    rotation: q(-Math.PI / 2),
    spine: -0.035,
    hands: [
      [0.25, 0.63, -0.16],
      [-0.25, 0.63, -0.16],
    ],
    elbows: [
      [0.39, 0.34, -0.43],
      [-0.39, 0.34, -0.43],
    ],
    feet: [
      [0.28, 0.25, 0.7],
      [-0.28, 0.25, 0.7],
    ],
    knees: [
      [0.31, 0.64, 0.39],
      [-0.31, 0.64, 0.39],
    ],
  };
}
function pair(
  position: GrapplingPosition,
  top: 0 | 1 | null,
  distance: number,
): [GrapplingPose, GrapplingPose] {
  if (position === "standing" || position === "clinch")
    return [
      standing(0, position === "clinch", distance),
      standing(1, position === "clinch", distance),
    ];
  let low = bottom(),
    high: GrapplingPose;
  if (position === "guard") {
    low.feet = [
      [0.25, 0.68, 0.78],
      [-0.25, 0.66, 0.78],
    ];
    low.knees = [
      [0.45, 0.59, 0.3],
      [-0.45, 0.59, 0.3],
    ];
    high = {
      pelvis: [0, 0.62, 0.65],
      rotation: q(0.47, Math.PI),
      spine: 0.06,
      hands: [
        [-0.22, 0.63, -0.02],
        [0.22, 0.63, -0.02],
      ],
      elbows: [
        [-0.4, 0.86, 0.24],
        [0.4, 0.86, 0.24],
      ],
      feet: [
        [-0.27, 0.23, 0.96],
        [0.27, 0.23, 0.96],
      ],
      knees: [
        [-0.28, 0.25, 0.47],
        [0.28, 0.25, 0.47],
      ],
    };
  } else if (position === "side") {
    low.hands = [
      [0.31, 0.5, -0.39],
      [0.08, 0.51, -0.09],
    ];
    low.knees = [
      [0.3, 0.41, 0.37],
      [-0.25, 0.44, 0.4],
    ];
    high = {
      pelvis: [0.6, 0.47, -0.34],
      rotation: q(1.39, -Math.PI / 2),
      spine: 0.035,
      hands: [
        [-0.24, 0.26, -0.61],
        [-0.12, 0.29, 0.03],
      ],
      elbows: [
        [0.02, 0.45, -0.72],
        [0.2, 0.5, -0.03],
      ],
      feet: [
        [1.11, 0.23, -0.72],
        [1.09, 0.23, 0.18],
      ],
      knees: [
        [0.65, 0.25, -0.63],
        [0.66, 0.25, 0.09],
      ],
    };
  } else if (position === "mount") {
    high = {
      pelvis: [0, 0.62, -0.09],
      rotation: q(0.62, Math.PI),
      spine: 0.055,
      hands: [
        [-0.25, 0.52, -0.65],
        [0.25, 0.52, -0.65],
      ],
      elbows: [
        [-0.43, 0.78, -0.4],
        [0.43, 0.78, -0.4],
      ],
      feet: [
        [-0.37, 0.23, 0.43],
        [0.37, 0.23, 0.43],
      ],
      knees: [
        [-0.39, 0.25, -0.04],
        [0.39, 0.25, -0.04],
      ],
    };
    low.hands = [
      [0.24, 0.6, -0.27],
      [-0.24, 0.6, -0.27],
    ];
  } else {
    low = {
      pelvis: [0, 0.39, -0.04],
      rotation: q(0.16),
      spine: 0.035,
      hands: [
        [0.19, 1.01, 0.25],
        [-0.19, 1.01, 0.25],
      ],
      elbows: [
        [0.35, 0.77, 0.16],
        [-0.35, 0.77, 0.16],
      ],
      feet: [
        [0.28, 0.23, 0.67],
        [-0.28, 0.23, 0.67],
      ],
      knees: [
        [0.29, 0.31, 0.31],
        [-0.29, 0.31, 0.31],
      ],
    };
    high = {
      pelvis: [0, 0.41, -0.5],
      rotation: q(0.28),
      spine: 0.02,
      hands: [
        [0.14, 1.06, 0.1],
        [-0.14, 1.05, 0.1],
      ],
      elbows: [
        [0.35, 0.89, -0.19],
        [-0.35, 0.89, -0.19],
      ],
      feet: [
        [0.26, 0.34, 0.3],
        [-0.26, 0.34, 0.3],
      ],
      knees: [
        [0.44, 0.3, -0.08],
        [-0.44, 0.3, -0.08],
      ],
    };
  }
  return top === 1 ? [low, high] : [high, low];
}

/** Authored approximations in one shared mat coordinate frame; never writes simulation state. */
export function sampleGrapplingPair(
  state: GrapplingStateView,
  distance = 1.3,
): [GrapplingPose, GrapplingPose] {
  const source = pair(state.position, state.top, distance);
  let result = source;
  const transition = state.transition;
  if (transition) {
    const sourcePair = pair(transition.from, state.top, distance);
    const target = pair(transition.to, transition.top, distance);
    const t = THREE.MathUtils.clamp(
      transition.elapsed / Math.max(0.001, transition.duration),
      0,
      1,
    );
    const ease = t * t * (3 - 2 * t);
    result = [
      blendGrapplingPose(sourcePair[0], target[0], ease),
      blendGrapplingPose(sourcePair[1], target[1], ease),
    ];
    const drive = Math.sin(t * Math.PI);
    if (transition.kind === "takedown" || transition.kind === "sprawl") {
      // A level change and the opponent's hips moving back make defended shots readable.
      const actor = result[transition.actor],
        opponent = result[1 - transition.actor];
      actor.pelvis[1] -= drive * 0.22;
      actor.rotation.multiply(q(drive * 0.33));
      if (transition.defended || transition.kind === "sprawl") {
        opponent.rotation.multiply(q(drive * 0.3));
        opponent.pelvis[2] += (transition.actor === 0 ? -1 : 1) * drive * 0.22;
      }
    }
    if (
      ["sweep", "escape", "scramble", "submission-escape"].includes(
        transition.kind,
      )
    ) {
      result[0].rotation.multiply(q(0, 0, drive * 0.2));
      result[1].rotation.multiply(q(0, 0, -drive * 0.2));
      result[0].pelvis[0] += drive * 0.13;
      result[1].pelvis[0] -= drive * 0.13;
    }
  }
  const submission = state.submission;
  if (submission) {
    result = result.map(copy) as [GrapplingPose, GrapplingPose];
    const attacker = result[submission.attacker],
      defender = result[1 - submission.attacker];
    const pressure = THREE.MathUtils.clamp(submission.progress / 100, 0, 1);
    if (submission.kind === "rear-choke") {
      attacker.hands = [
        [-0.08, 1.1, 0.14],
        [0.08, 1.09, 0.11],
      ];
      defender.hands = [
        [0.15, 1.08, 0.23],
        [-0.15, 1.05, 0.23],
      ];
      attacker.spine += pressure * 0.06;
    } else if (submission.kind === "triangle") {
      attacker.knees = [
        [0.36, 0.7, 0.12],
        [-0.38, 0.69, 0.18],
      ];
      attacker.feet = [
        [-0.12, 0.91, 0.27],
        [0.13, 0.88, 0.34],
      ];
      attacker.hands = [
        [0.18, 0.64, -0.02],
        [-0.18, 0.64, -0.02],
      ];
      defender.rotation.multiply(q(0.45 + pressure * 0.12));
      defender.pelvis[1] -= 0.08;
    } else {
      // Isolate one arm across the hips while the legs control the shoulder line.
      const target: GrapplingPose = {
        ...copy(attacker),
        pelvis: [0.62, 0.31, -0.4],
        rotation: q(-Math.PI / 2, -Math.PI / 2),
        hands: [
          [0.72, 0.47, -0.37],
          [0.71, 0.46, -0.43],
        ],
        elbows: [
          [0.99, 0.39, -0.16],
          [0.99, 0.39, -0.64],
        ],
        knees: [
          [0.2, 0.57, -0.65],
          [0.18, 0.55, -0.1],
        ],
        feet: [
          [-0.15, 0.47, -0.75],
          [-0.22, 0.48, 0.17],
        ],
      };
      result[submission.attacker] = blendGrapplingPose(
        attacker,
        target,
        0.92 + pressure * 0.08,
      );
      defender.hands[0] = [0.73, 0.45, -0.4];
    }
  }
  return result;
}
