import * as THREE from "three";
import { FighterLibrary, modelEntries } from "./assets/library";
import { RigController } from "./assets/rig";
import { createBoxingGlove } from "./assets/boxing-glove";
import { FirstPersonHands } from "./assets/first-person-hands";
import { CombatCameraMotion } from "./combat-camera";
import { createClubVenue } from "./club-venue";
import {
  GrapplingPresentation,
  applyGrapplingPreview,
} from "./grappling-world";
import { createBout } from "../shared/game";
import {
  CHARACTERS,
  PENDING_MODEL_IDS,
  type CharacterId,
  type Sport,
  type Bout,
  type Fighter,
} from "../shared/game";
const skin = (c: string) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
const geo = {
  sphere: new THREE.SphereGeometry(1, 20, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
};
function part(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  pos: number[],
  scale: number[],
) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...(pos as [number, number, number]));
  o.scale.set(...(scale as [number, number, number]));
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 90);
  clock = new THREE.Clock();
  mode: "menu" | "fight" = "menu";
  current: Bout | null = null;
  viewIndex = 0;
  shake = true;
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  fighters: THREE.Group[] = [];
  handRig = new FirstPersonHands();
  gloves = this.handRig.root;
  sport: Sport = "boxing";
  bjjCamera: "first" | "broadcast" = "first";
  private loadedSport: Sport = "boxing";
  private venue!: ReturnType<typeof createClubVenue>;
  private grappling = new GrapplingPresentation(this.camera);
  private lastSceneDraw = 0;
  private contactShadows: THREE.Mesh[] = [];
  private cameraMotion = new CombatCameraMotion();
  private cameraViewKey = "";
  textures = new Map<string, THREE.Texture>();
  models: CharacterId[] = ["nova", "blaze"];
  impactUntil = 0;
  freezeUntil = 0;
  impactStrength = 0;
  library = new FighterLibrary();
  assetRevision = 0;
  private charactersReady: Promise<boolean> = Promise.resolve(false);
  activeBoutId = "";
  lastFrame = performance.now();
  previewState = createBout(["preview-a", "preview-b"], ["nova", "blaze"]);
  onError: () => void;
  constructor(container: HTMLElement, onError: () => void) {
    this.onError = onError;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    const gl = this.renderer.getContext();
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = rendererInfo
      ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
      : "";
    // Software WebGL needs a lighter shadow budget for the detailed fighters.
    this.renderer.shadowMap.enabled =
      !/swiftshader|llvmpipe|software renderer/i.test(rendererName);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "3D 클럽 경기장");
    this.scene.background = new THREE.Color("#171b1e");
    this.scene.fog = new THREE.Fog("#171b1e", 13, 40);
    this.scene.add(new THREE.HemisphereLight("#e7efff", "#48402d", 2.6));
    const main = new THREE.SpotLight("#fff2dc", 160, 24, Math.PI / 4, 0.6);
    main.position.set(1, 8, 3);
    main.castShadow = true;
    main.shadow.mapSize.set(1024, 1024);
    main.shadow.bias = -0.0003;
    this.scene.add(main);
    const fill = new THREE.PointLight("#ed4939", 35, 15);
    fill.position.set(-5, 4, 0);
    this.scene.add(fill);
    const blue = new THREE.PointLight("#a9c8ff", 45, 15);
    blue.position.set(5, 3, -3);
    this.scene.add(blue);
    this.venue = createClubVenue(this.scene);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext("2d")!;
    const fade = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
    fade.addColorStop(0, "rgba(0,0,0,.55)");
    fade.addColorStop(0.5, "rgba(0,0,0,.25)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    shadowContext.fillStyle = fade;
    shadowContext.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: this.renderer.shadowMap.enabled ? 0.35 : 0.65,
    });
    for (let i = 0; i < 2; i++) {
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        shadowMaterial,
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.153;
      shadow.renderOrder = 1;
      this.scene.add(shadow);
      this.contactShadows.push(shadow);
    }
    this.scene.add(this.camera);
    this.camera.add(this.gloves, this.grappling.root);
    this.gloves.visible = false;
    // Keep hidden-menu initialization light; real rigs load on selection/fight.
    this.fighters = [this.model("nova", 0), this.model("blaze", 1)];
    this.scene.add(...this.fighters);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      onError();
    });
    this.renderer.setAnimationLoop(() => this.render());
  }
  resize() {
    const el = this.renderer.domElement.parentElement!;
    this.camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  }
  model(id: CharacterId, team: number, sport: Sport = this.sport) {
    const c = CHARACTERS.find((x) => x.id === id)!;
    const g = new THREE.Group();
    const s = skin(c.skin),
      jersey = skin(c.color),
      dark = skin("#20282a");
    part(g, geo.sphere, jersey, [0, 1.15, 0], [0.34, 0.43, 0.23]);
    part(g, geo.cylinder, s, [0, 1.58, 0], [0.1, 0.22, 0.1]);
    part(g, geo.sphere, s, [0, 1.88, 0], [0.255, 0.31, 0.24]);
    part(g, geo.sphere, s, [-0.255, 1.88, 0], [0.05, 0.08, 0.04]);
    part(g, geo.sphere, s, [0.255, 1.88, 0], [0.05, 0.08, 0.04]);
    // Keep a recognizable portrait while the full character rig finishes loading.
    let texture = this.textures.get(id);
    if (!texture) {
      const portrait =
        modelEntries.get(id)?.portrait ||
        (PENDING_MODEL_IDS.has(id)
          ? `/characters/models/${id}-hd-portrait.png`
          : `/characters/${id}-face.svg`);
      texture = new THREE.TextureLoader().load(portrait);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(id, texture);
    }
    const face = part(
      g,
      new THREE.PlaneGeometry(0.43, 0.46),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.1,
      }),
      [0, 1.87, 0.236],
      [1, 1, 1],
    );
    face.rotation.x = -0.01;
    const hair = skin("#242621");
    part(g, geo.sphere, hair, [0, 2.075, -0.025], [0.267, 0.16, 0.25]);
    for (let j = 0; j < 7; j++) {
      const tuft = part(
        g,
        geo.sphere,
        hair,
        [(j - 3) * 0.065, 2.18 + Math.sin(j * 9) * 0.035, 0.015],
        [0.085, 0.11, 0.11],
      );
      tuft.rotation.z = j * 0.4;
    }
    part(g, geo.sphere, dark, [0, 0.79, 0], [0.32, 0.22, 0.22]);
    part(
      g,
      geo.cylinder,
      skin("#e9e5d8"),
      [0, 0.91, 0.005],
      [0.325, 0.06, 0.23],
    );
    for (const side of [-1, 1]) {
      const leg = part(
        g,
        geo.cylinder,
        s,
        [side * 0.18, 0.5, -0.02],
        [0.1, 0.48, 0.1],
      );
      leg.rotation.z = side * 0.12;
      part(g, geo.box, dark, [side * 0.21, 0.22, 0.05], [0.2, 0.18, 0.35]);
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 1.38, 0);
      part(
        arm,
        geo.cylinder,
        s,
        [side * 0.04, -0.14, 0.05],
        [0.095, 0.36, 0.095],
      );
      const fore = part(
        arm,
        geo.cylinder,
        s,
        [side * 0.08, -0.08, 0.2],
        [0.09, 0.34, 0.09],
      );
      fore.rotation.x = -0.7;
      if (sport === "boxing") {
        const glove = createBoxingGlove(side as -1 | 1, team);
        glove.position.set(side * 0.08, -0.03, 0.25);
        glove.rotation.x = Math.PI / 4;
        arm.add(glove);
      } else
        part(arm, geo.box, s, [side * 0.08, 0.05, 0.3], [0.075, 0.12, 0.04]);
      g.add(arm);
      g.userData[side < 0 ? "left" : "right"] = arm;
    }
    return g;
  }
  setCharacters(a: CharacterId, b: CharacterId, sport: Sport = this.sport) {
    if (
      this.assetRevision > 0 &&
      this.loadedSport === sport &&
      this.fighters.length &&
      this.models[0] === a &&
      this.models[1] === b
    )
      return this.charactersReady;
    this.loadedSport = sport;
    this.models = [a, b];
    for (const f of this.fighters) {
      this.scene.remove(f);
      if (f.userData.generatedAsset) {
        (f.userData.rigController as RigController).dispose();
        continue;
      }
      f.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (!Object.values(geo).includes(o.geometry)) o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
    }
    this.fighters = [this.model(a, 0, sport), this.model(b, 1, sport)];
    this.scene.add(...this.fighters);
    const revision = ++this.assetRevision;
    this.charactersReady = Promise.all(
      [a, b].map((id, i) => {
        return this.library
          .instantiate(id, i, sport)
          .then((model) => {
            if (!model) return !PENDING_MODEL_IDS.has(id);
            if (revision !== this.assetRevision) {
              (model.userData.rigController as RigController).dispose();
              return false;
            }
            const old = this.fighters[i];
            model.position.copy(old.position);
            model.quaternion.copy(old.quaternion);
            model.visible = old.visible;
            this.scene.remove(old);
            old.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                if (!Object.values(geo).includes(o.geometry))
                  o.geometry.dispose();
                (Array.isArray(o.material) ? o.material : [o.material]).forEach(
                  (m) => m.dispose(),
                );
              }
            });
            this.fighters[i] = model;
            this.scene.add(model);
            dispatchEvent(
              new CustomEvent("fighter-model-ready", { detail: id }),
            );
            return true;
          })
          .catch((error) => {
            dispatchEvent(
              new CustomEvent("fighter-model-error", { detail: id }),
            );
            console.warn(
              "3D character load failed:",
              id,
              error instanceof Error ? error.message : error,
            );
            return false;
          });
      }),
    ).then((ready) => ready.every(Boolean));
    return this.charactersReady;
  }
  menu(sport: Sport = this.sport) {
    if (this.mode !== "menu" || sport !== this.sport) this.grappling.reset();
    this.sport = sport;
    this.cameraMotion.reset();
    this.cameraViewKey = "";
    if (this.activeBoutId) {
      for (const fighter of this.fighters) {
        (fighter.userData.rigController as RigController | undefined)?.reset();
      }
      this.activeBoutId = "";
    }
    this.mode = "menu";
    this.current = null;
    this.gloves.visible = false;
    this.fighters.forEach((f) => (f.visible = true));
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
  }
  fight(b: Bout, index: number) {
    const sport = b.sport || "boxing";
    if (sport !== this.sport) this.grappling.reset();
    this.sport = sport;
    this.mode = "fight";
    this.current = b;
    this.viewIndex = index;
    this.setCharacters(b.fighters[0].character, b.fighters[1].character, sport);
    if (this.activeBoutId !== b.id) {
      for (const fighter of this.fighters) {
        (fighter.userData.rigController as RigController | undefined)?.reset();
      }
      this.activeBoutId = b.id;
    }
    this.camera.fov =
      sport === "boxing" ? 75 : this.bjjCamera === "first" ? 72 : 52;
    this.camera.updateProjectionMatrix();
  }
  impact(strength: number) {
    if (!this.shake || this.reduced) return;
    this.impactStrength = strength;
    this.impactUntil = performance.now() + 220;
    this.freezeUntil = performance.now() + 45;
  }
  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (
      document.hidden ||
      !this.renderer.domElement.clientWidth ||
      !this.renderer.domElement.clientHeight
    )
      return;
    if (now < this.freezeUntil && this.sport === "boxing") return;
    const interval =
      this.mode === "menu"
        ? document.querySelector(".dialog")
          ? 500
          : 1000 / 30
        : 0;
    if (now - this.lastSceneDraw < interval) return;
    this.lastSceneDraw = now;
    const t = this.clock.getElapsedTime();
    this.venue.update(t, this.sport, this.reduced);
    if (this.mode === "menu") {
      this.grappling.root.visible = false;
      const motion = this.reduced ? 0 : Math.sin(t * 0.12);
      const portrait = this.camera.aspect < 0.8;
      this.camera.position.set(
        4.2 + motion * 0.16,
        portrait ? 2.6 : 2.35,
        portrait ? 7.6 : 6.2,
      );
      this.camera.lookAt(portrait ? -0.2 : -1.0, 1.05, 0);
      this.fighters.forEach((f, i) => {
        if (this.sport === "bjj")
          applyGrapplingPreview(f, this.reduced ? 0 : t + i, false);
        else
          (f.userData.rigController as RigController | undefined)?.update(
            this.previewState.fighters[i],
            this.reduced ? 0 : dt,
          );
        f.visible = true;
        f.position.set(i === 0 ? -0.2 : 1.0, 0.15, i === 0 ? 0.45 : -0.65);
        f.rotation.set(0, i === 0 ? 0.38 : -0.35, 0);
        this.contactShadows[i].position.set(f.position.x, 0.153, f.position.z);
        this.contactShadows[i].scale.set(0.8, 0.7, 1);
      });
    } else if (this.current) {
      const b = this.current;
      if (b.sport === "bjj") {
        this.gloves.visible = false;
        this.grappling.update(
          b,
          this.fighters,
          this.viewIndex,
          dt,
          this.reduced || !this.shake,
          this.bjjCamera,
        );
        const ground =
          b.grappling?.position !== "standing" &&
          b.grappling?.position !== "clinch";
        this.fighters.forEach((model, i) => {
          const hips = model.getObjectByName("Hips");
          const p =
            hips?.getWorldPosition(new THREE.Vector3()) || model.position;
          this.contactShadows[i].position.set(p.x, 0.153, p.z);
          this.contactShadows[i].scale.set(
            ground ? 1.45 : 0.8,
            ground ? 1.2 : 0.7,
            1,
          );
        });
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.grappling.root.visible = false;
      for (let i = 0; i < 2; i++) {
        const state = b.fighters[i],
          other = b.fighters[1 - i],
          f = this.fighters[i];
        f.visible = i !== this.viewIndex;
        f.position.lerp(new THREE.Vector3(state.x, 0.15, state.z), 0.3);
        f.rotation.y = Math.atan2(other.x - state.x, other.z - state.z);
        const rig = f.userData.rigController as RigController | undefined;
        this.contactShadows[i].position.set(state.x, 0.153, state.z);
        this.contactShadows[i].scale.set(0.8, 0.7, 1);
        if (rig) {
          if (b.ended && b.winner === i) rig.celebrate();
          rig.update(state, dt);
        } else this.animateArms(f, state, t);
      }
      const own = b.fighters[this.viewIndex],
        op = b.fighters[1 - this.viewIndex];
      this.camera.position.lerp(
        new THREE.Vector3(own.x, 1.9 + (own.evade > 0 ? -0.28 : 0), own.z),
        0.4,
      );
      this.camera.lookAt(op.x, 1.9, op.z);
      const viewKey = `${b.id}:${this.viewIndex}`;
      if (viewKey !== this.cameraViewKey) {
        this.cameraViewKey = viewKey;
        this.cameraMotion.reset();
      }
      const motion = this.cameraMotion.update(
        own,
        op,
        dt,
        this.shake && !this.reduced && !b.ended && b.countdown <= 0,
      );
      this.camera.translateX(motion.x);
      this.camera.position.y += motion.y;
      this.camera.rotation.x += motion.pitch;
      this.camera.rotation.z += motion.roll;
      if (now < this.impactUntil) {
        const amount = ((this.impactUntil - now) / 220) * this.impactStrength;
        this.camera.rotation.z += Math.sin(now * 0.11) * 0.025 * amount;
        this.camera.position.y += Math.sin(now * 0.09) * 0.03 * amount;
      }
      this.gloves.visible = !b.ended;
      this.handRig.update(
        own,
        this.viewIndex,
        this.camera.aspect,
        t,
        this.reduced,
      );
    }
    this.renderer.render(this.scene, this.camera);
  }
  animateArms(g: THREE.Group, f: Fighter, t: number) {
    for (const key of ["left", "right"]) {
      const arm = g.userData[key] as THREE.Group;
      const active =
        f.attack > 0 &&
        (f.kind === "skill" ||
          (f.kind === "jab" ? key === "left" : key === "right"));
      arm.rotation.x = f.guard
        ? -0.5
        : active
          ? -Math.sin(
              (f.attack /
                (f.kind === "skill" ? 0.6 : f.kind === "hook" ? 0.34 : 0.2)) *
                Math.PI,
            ) * 1.3
          : Math.sin(t * 3) * 0.025;
      arm.rotation.z = active && f.kind === "hook" ? 0.55 : 0;
    }
  }
}
