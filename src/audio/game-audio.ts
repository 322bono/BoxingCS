import type { Bout } from "../../shared/game";
import { CombatSoundTracker, type CombatSoundCue } from "./combat-sounds";
export type AudioScene = "menu" | "lobby" | "fight" | "result";
const files = {
  punch: ["punch-1", "punch-2", "punch-3"],
  heavy: ["heavy-1", "heavy-2", "heavy-3"],
  guard: ["guard-1", "guard-2"],
  cloth: ["guard-1"],
  swing: ["whoosh"],
  dodge: ["whoosh"],
  step: ["step-1", "step-2"],
  skill: ["whoosh"],
  "bell-start": ["bell-start"],
  "bell-end": ["bell-end"],
  fall: ["fall"],
  select: ["select"],
} as const;
type Sound = keyof typeof files;
const levels: Record<Sound, { gain: number; rate: number }> = {
  punch: { gain: 0.75, rate: 1 },
  heavy: { gain: 0.9, rate: 0.94 },
  guard: { gain: 0.55, rate: 1 },
  cloth: { gain: 0.12, rate: 1.07 },
  swing: { gain: 0.2, rate: 1.15 },
  dodge: { gain: 0.32, rate: 1 },
  step: { gain: 0.2, rate: 1 },
  skill: { gain: 0.4, rate: 0.9 },
  "bell-start": { gain: 0.55, rate: 1 },
  "bell-end": { gain: 0.5, rate: 1 },
  fall: { gain: 0.65, rate: 0.85 },
  select: { gain: 0.2, rate: 1 },
};
export class GameAudio {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  private voices = new Set<AudioBufferSourceNode>();
  private counts = new Map<Sound, number>();
  private scene: AudioScene = "menu";
  private sceneEpoch = 0;
  private visible = !document.hidden;
  private effectsEnabled: boolean;
  private musicEnabled: boolean;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  private tracker = new CombatSoundTracker();
  readonly music: HTMLAudioElement;
  constructor(preferences: { sound: boolean; music: boolean }) {
    this.effectsEnabled = preferences.sound;
    this.musicEnabled = preferences.music;
    const previous = document.getElementById("menu-music");
    if (previous instanceof HTMLMediaElement) {
      previous.pause();
      previous.remove();
    }
    this.music = new Audio("/audio/music/before-the-bell.mp3");
    this.music.id = "menu-music";
    this.music.hidden = true;
    this.music.loop = true;
    this.music.preload = "metadata";
    this.music.setAttribute("aria-label", "Before the Bell 메인 배경음악");
    document.body.append(this.music);
    const unlock = () => this.unlock();
    addEventListener("pointerdown", unlock, { capture: true });
    addEventListener(
      "keydown",
      (event) => {
        if (!event.repeat) unlock();
      },
      { capture: true },
    );
    document.addEventListener("visibilitychange", () =>
      this.setVisible(!document.hidden),
    );
    addEventListener("pagehide", () => this.setVisible(false));
    addEventListener("pageshow", () => this.setVisible(!document.hidden));
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = 0;
        this.context
          .createMediaElementSource(this.music)
          .connect(this.musicGain)
          .connect(this.context.destination);
        this.effectsGain = this.context.createGain();
        this.effectsGain.gain.value =
          this.effectsEnabled && this.visible ? 0.8 : 0;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -8;
        this.compressor.knee.value = 6;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.15;
        this.effectsGain
          .connect(this.compressor)
          .connect(this.context.destination);
        for (const file of new Set(Object.values(files).flat()))
          void this.load(file).catch(() => {});
      }
      void this.context
        .resume()
        .then(() => this.syncMusic())
        .catch(() => {});
      this.syncMusic();
    } catch {
      /* A later user gesture can retry browser audio activation. */
    }
  }
  setScene(scene: AudioScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.sceneEpoch++;
    if (scene !== "fight") this.tracker.reset();
    this.syncMusic();
  }
  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.syncMusic(true);
  }
  setEffectsEnabled(enabled: boolean) {
    this.effectsEnabled = enabled;
    if (this.context && this.effectsGain)
      this.effectsGain.gain.setTargetAtTime(
        enabled && this.visible ? 0.8 : 0,
        this.context.currentTime,
        0.01,
      );
    if (!enabled) this.stopVoices();
  }
  private setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    this.sceneEpoch++;
    if (!visible) this.stopVoices();
    if (this.context && this.effectsGain)
      this.effectsGain.gain.setTargetAtTime(
        this.effectsEnabled && visible ? 0.8 : 0,
        this.context.currentTime,
        0.01,
      );
    if (visible && this.context)
      void this.context
        .resume()
        .then(() => this.syncMusic())
        .catch(() => {});
    this.syncMusic(!visible);
  }
  private wantsMusic() {
    return this.musicEnabled && this.scene === "menu" && this.visible;
  }
  private syncMusic(immediate = false) {
    clearTimeout(this.pauseTimer);
    if (!this.wantsMusic()) {
      if (this.context && this.musicGain && !immediate && !this.music.paused) {
        this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
        this.musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
        this.pauseTimer = setTimeout(() => {
          if (!this.wantsMusic()) this.music.pause();
        }, 180);
      } else this.music.pause();
      return;
    }
    if (!this.context || !this.musicGain || this.context.state !== "running")
      return;
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(0.22, this.context.currentTime, 0.18);
    if (this.music.paused) void this.music.play().catch(() => {});
  }
  private load(file: string): Promise<AudioBuffer> {
    const ready = this.buffers.get(file);
    if (ready) return Promise.resolve(ready);
    let promise = this.loading.get(file);
    if (!promise) {
      const context = this.context;
      if (!context)
        return Promise.reject(Error("Audio is awaiting a user gesture"));
      promise = fetch(`/audio/sfx/${file}.wav`)
        .then((response) => {
          if (!response.ok) throw Error(`Audio sample unavailable: ${file}`);
          return response.arrayBuffer();
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          this.buffers.set(file, buffer);
          return buffer;
        });
      this.loading.set(file, promise);
      void promise.catch(() => this.loading.delete(file));
    }
    return promise;
  }
  play(
    sound: Sound,
    options: {
      pan?: number;
      rate?: number;
      gain?: number;
      delay?: number;
    } = {},
  ) {
    if (
      !this.effectsEnabled ||
      !this.visible ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    const count = this.counts.get(sound) || 0;
    this.counts.set(sound, count + 1);
    const variants = files[sound],
      file = variants[count % variants.length];
    const epoch = this.sceneEpoch;
    const start = (buffer: AudioBuffer) => {
      const tail =
        (sound === "bell-end" || sound === "fall") && this.scene === "result";
      if (
        (!tail && epoch !== this.sceneEpoch) ||
        !this.effectsEnabled ||
        !this.visible ||
        !this.context ||
        !this.effectsGain
      )
        return;
      const context = this.context,
        source = context.createBufferSource(),
        gain = context.createGain(),
        pan = context.createStereoPanner();
      source.buffer = buffer;
      const varied = ["punch", "heavy", "guard", "step"].includes(sound)
        ? (Math.random() - 0.5) * 0.05
        : 0;
      source.playbackRate.value = Math.max(
        0.7,
        Math.min(1.4, options.rate ?? levels[sound].rate + varied),
      );
      gain.gain.value = levels[sound].gain * (options.gain ?? 1);
      pan.pan.value =
        options.pan ?? (sound === "step" ? (count % 2 ? 0.13 : -0.13) : 0);
      source.connect(gain).connect(pan).connect(this.effectsGain);
      while (this.voices.size >= 10) {
        const oldest = this.voices.values().next().value;
        if (!oldest) break;
        this.voices.delete(oldest);
        try {
          oldest.stop();
        } catch {}
      }
      this.voices.add(source);
      source.onended = () => {
        this.voices.delete(source);
        source.disconnect();
        gain.disconnect();
        pan.disconnect();
      };
      source.start(context.currentTime + (options.delay ?? 0));
    };
    const ready = this.buffers.get(file);
    if (ready) start(ready);
    else
      void this.load(file)
        .then(start)
        .catch(() => {});
  }
  observeCombat(bout: Bout, view: number) {
    for (const cue of this.tracker.update(bout, view)) {
      if (this.scene === "fight") this.playCue(cue);
    }
  }
  private playCue(cue: CombatSoundCue) {
    if (cue.sound === "skill") {
      const beats =
        cue.character === "nova"
          ? [0, 0.12, 0.24]
          : cue.character === "specs"
            ? [0, 0.18]
            : [0];
      for (const [i, delay] of beats.entries())
        this.play("skill", { pan: cue.pan, delay, rate: 0.88 + i * 0.12 });
    } else
      this.play(cue.sound, {
        pan: cue.pan,
        delay: cue.sound === "fall" ? 0.1 : cue.sound === "bell-end" ? 0.22 : 0,
      });
  }
  private stopVoices() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
  }
}
