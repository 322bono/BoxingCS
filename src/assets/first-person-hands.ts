import * as THREE from "three";
import { CHARACTERS, type Fighter } from "../../shared/game";
import { createBoxingGlove, cornerColor } from "./boxing-glove";

const mix = THREE.MathUtils.lerp;
const pulse = (progress: number, center: number, width: number) =>
  Math.max(0, 1 - Math.abs(progress - center) / width) ** 0.7;

export class FirstPersonHands {
  root = new THREE.Group();
  hands: THREE.Group[] = [];
  private forearms: THREE.Mesh[] = [];
  private wrist = new THREE.Vector3();
  private elbow = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private skin = new THREE.MeshStandardMaterial({
    color: "#c89478",
    roughness: 0.82,
  });
  private styleKey = "";
  constructor() {
    this.root.name = "first-person-hands";
    for (const side of [-1, 1] as const) {
      const hand = new THREE.Group();
      hand.name = side < 0 ? "lead-hand" : "rear-hand";
      hand.add(createBoxingGlove(side));
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.043, 0.07, 1, 16),
        this.skin,
      );
      forearm.name = side < 0 ? "lead-forearm" : "rear-forearm";
      this.forearms.push(forearm);
      this.root.add(forearm);
      this.root.add(hand);
      this.hands.push(hand);
    }
  }
  update(
    state: Fighter,
    corner: number,
    aspect: number,
    time: number,
    reduced: boolean,
  ) {
    const key = `${state.character}:${corner}`;
    if (this.styleKey !== key) {
      this.styleKey = key;
      this.skin.color.set(
        CHARACTERS.find((c) => c.id === state.character)!.skin,
      );
      this.root.traverse((part) => {
        if (part instanceof THREE.Mesh && part.userData.cornerLeather)
          (part.material as THREE.MeshStandardMaterial).color.set(
            cornerColor(corner),
          );
      });
    }
    const narrow = THREE.MathUtils.clamp(aspect / 1.2, 0.38, 1);
    const size = Math.sqrt(narrow);
    const progress =
      1 -
      state.attack /
        (state.kind === "skill" ? 0.6 : state.kind === "hook" ? 0.34 : 0.2);
    for (const [i, hand] of this.hands.entries()) {
      const side = i === 0 ? -1 : 1;
      let x = side * (state.guard ? 0.255 + (1 - narrow) * 0.095 : 0.34),
        y = state.guard ? -0.17 : -0.36,
        z = state.guard ? -0.72 : -0.66,
        pitch = state.guard ? -0.3 : -0.78,
        yaw = -side * 0.12,
        roll = -side * 0.12;
      if (!reduced) y += Math.sin(time * 3.4 + i * 1.4) * 0.005;
      if (state.evade > 0) {
        y -= 0.035;
        roll -= side * 0.12;
      }
      if (state.attack > 0 && !state.guard) {
        let extension = 0,
          arc = "straight";
        if (state.kind === "jab" && i === 0)
          extension = Math.sin(Math.PI * progress) ** 0.65;
        if (state.kind === "hook" && i === 1) {
          extension = Math.sin(Math.PI * progress);
          arc = "hook";
        }
        if (state.kind === "skill") {
          switch (state.character) {
            case "nova":
              extension = pulse(progress, i === 0 ? 0.23 : 0.56, 0.24);
              break;
            case "ace":
              extension = pulse(progress, i === 0 ? 0.34 : 0.65, 0.3);
              break;
            case "volt":
            case "stone":
              extension = i === 1 ? Math.sin(Math.PI * progress) : 0;
              arc = "uppercut";
              break;
            case "blaze":
            case "ink":
              extension = i === 1 ? Math.sin(Math.PI * progress) : 0;
              arc = "overhand";
              break;
            case "specs":
              extension = i === 1 ? pulse(progress, 0.63, 0.34) : 0;
              break;
            case "mint":
              extension = i === 0 ? pulse(progress, 0.58, 0.36) : 0;
              break;
          }
        }
        if (arc === "hook") {
          x = mix(x, -0.075, extension);
          y += extension * 0.19;
          z -= extension * 0.22;
          yaw -= extension * 1.05;
          roll -= extension * 0.65;
          pitch -= extension * 0.55;
        } else if (arc === "uppercut") {
          x = mix(x, 0.1, extension);
          y += extension * 0.34;
          z -= extension * 0.23;
          pitch += extension * 0.75;
          roll -= extension * 0.4;
        } else if (arc === "overhand") {
          x = mix(x, 0.05, extension);
          y += extension * 0.36;
          z -= extension * 0.3;
          pitch -= extension * 1.0;
          roll -= extension * 0.48;
        } else {
          x = mix(x, side * 0.11, extension);
          y += extension * 0.18;
          z -= extension * 0.38;
          pitch -= extension * 0.78;
          yaw += side * extension * 0.18;
          roll += side * extension * 0.24;
        }
      }
      hand.scale.setScalar(size);
      hand.position.set(x * narrow, y, z);
      hand.rotation.set(pitch, yaw, roll);
      hand.updateMatrix();
      this.wrist.set(0, -0.055, 0).applyMatrix4(hand.matrix);
      this.elbow.set(side * 0.45 * narrow, -0.78, -0.38);
      this.direction.copy(this.wrist).sub(this.elbow);
      const forearm = this.forearms[i];
      forearm.position.copy(this.elbow).add(this.wrist).multiplyScalar(0.5);
      forearm.scale.set(size, this.direction.length(), size);
      forearm.quaternion.setFromUnitVectors(
        this.up,
        this.direction.normalize(),
      );
    }
  }
}
