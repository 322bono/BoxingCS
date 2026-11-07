import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareFighter, RigController } from "./rig";
import { prepareNativeClips } from "./native-clips";
import { addBoxingGloves } from "./gloves";
import type { CharacterId } from "../../shared/game";
export type ModelEntry = {
  status: "pending" | "ready";
  model: string | null;
  source: string;
  taskId: string | null;
  portrait?: string;
  clips?: Record<string, string>;
};
export const modelEntries = new Map<string, ModelEntry>();
export class FighterLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<
    string,
    Promise<Awaited<ReturnType<GLTFLoader["loadAsync"]>>>
  >();
  readonly initialized: Promise<void>;
  constructor() {
    this.initialized = this.initialize();
  }
  private async initialize() {
    try {
      const response = await fetch("/characters/models/manifest.json");
      if (!response.ok) throw Error("모델 목록을 읽을 수 없습니다.");
      const data = await response.json();
      if (data.version !== 1 || typeof data.characters !== "object")
        throw Error("잘못된 모델 목록입니다.");
      for (const [id, entry] of Object.entries(data.characters)) {
        const item = entry as ModelEntry;
        if (
          item.status === "ready" &&
          (!item.model?.startsWith("/characters/models/") ||
            item.model.includes("..") ||
            !item.model.endsWith(".glb"))
        )
          throw Error("모델 경로를 확인해 주세요.");
        modelEntries.set(id, item);
      }
      dispatchEvent(new Event("fighter-assets-ready"));
    } catch (e) {
      console.warn(
        "3D character manifest:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  async instantiate(id: CharacterId, corner = 0) {
    await this.initialized;
    const entry = modelEntries.get(id);
    if (entry?.status !== "ready" || !entry.model) return null;
    let promise = this.cache.get(id);
    if (!promise) {
      promise = this.loader.loadAsync(entry.model);
      this.cache.set(id, promise);
    }
    try {
      const asset = await promise,
        root = prepareFighter(asset.scene);
      const controller = new RigController(
        root,
        id,
        entry.clips
          ? prepareNativeClips(root, asset.animations, entry.clips)
          : asset.animations,
      );
      addBoxingGloves(root, corner);
      root.userData.generatedAsset = true;
      root.userData.rigController = controller;
      return root;
    } catch (e) {
      this.cache.delete(id);
      throw e;
    }
  }
}
