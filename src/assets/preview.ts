import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FighterLibrary } from "./library";
import { RigController } from "./rig";
import { createBout, type CharacterId } from "../../shared/game";
export class CharacterPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private root: THREE.Group | null = null;
  private stopped = false;
  private last = performance.now();
  private state;
  private floor: THREE.Mesh;
  constructor(
    private element: HTMLElement,
    library: FighterLibrary,
    id: CharacterId,
  ) {
    this.state = createBout(["preview", "unused"], [id, id]).fighters[0];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.element.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "캐릭터 3D 미리보기");
    this.camera.position.set(0.4, 1.35, 4.7);
    this.scene.add(new THREE.HemisphereLight("#eff5ff", "#54556a", 3));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(2, 4, 3);
    this.scene.add(light);
    const rim = new THREE.DirectionalLight("#9bbcff", 2);
    rim.position.set(-2, 2, -1);
    this.scene.add(rim);
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 48),
      new THREE.MeshBasicMaterial({
        color: "#d3e8ff",
        transparent: true,
        opacity: 0.06,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.005;
    this.scene.add(this.floor);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.05, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 6;
    this.controls.minPolarAngle = 0.65;
    this.controls.maxPolarAngle = 1.8;
    this.controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.update();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.element);
    this.resize();
    void library
      .instantiate(id)
      .then((model) => {
        if (!model) throw Error("3D 모델이 아직 준비되지 않았습니다.");
        if (this.stopped) {
          (model.userData.rigController as RigController).dispose();
          return;
        }
        this.root = model;
        this.scene.add(model);
        this.element.dataset.ready = "true";
      })
      .catch(() => {
        if (!this.stopped) this.element.dataset.error = "true";
      });
    this.renderer.setAnimationLoop(() => {
      const now = performance.now(),
        dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.root) {
        const controller = this.root.userData.rigController as RigController;
        controller.update(this.state, dt);
        this.element.dataset.animation = controller.current;
      }
      this.state.attack = Math.max(0, this.state.attack - dt);
      this.controls.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }
  private resize() {
    const w = this.element.clientWidth,
      h = this.element.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  skill() {
    if (!this.root) return;
    this.state.skillSerial++;
    this.state.attack = 0.6;
    this.state.kind = "skill";
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    if (this.root)
      (this.root.userData.rigController as RigController).dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
