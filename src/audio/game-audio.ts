import type { Bout } from "../../shared/game";
import { CombatSoundTracker, type CombatSoundCue } from "./combat-sounds";
import { GrapplingSoundTracker } from "./grappling-sounds";
import { MatchAtmosphereTracker, type ArenaFrame } from "./match-atmosphere";
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
  "crowd-cheer": ["arena-cheer"],
  "crowd-roar": ["arena-roar"],
  "crowd-finish": ["arena-roar"],
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
  "crowd-cheer": { gain: 0.6, rate: 1 },
  "crowd-roar": { gain: 0.9, rate: 1 },
  "crowd-finish": { gain: 0.95, rate: 1 },
};
export class GameAudio {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdLoop: AudioBufferSourceNode | null = null;
  private crowdLoopGain: GainNode | null = null;
  private crowdGeneration = 0;
  private crowdPending: number | null = null;
  private crowdVoices = new Map<
    AudioBufferSourceNode,
    { sound: Sound; gain: GainNode }
  >();
  private crowdVolume: number;
  private crowdDuckUntil = 0;
  private duckTimer: ReturnType<typeof setTimeout> | undefined;
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
  private grapplingTracker = new GrapplingSoundTracker();
  private atmosphere = new MatchAtmosphereTracker();
  private arena: ArenaFrame | null = null;
  private combatKey = "";
  private combatGeneration = 0;
  private crowdCueGeneration = 0;
  readonly music: HTMLAudioElement;
  constructor(preferences: { sound: boolean; music: boolean; crowd?: number }) {
    this.effectsEnabled = preferences.sound;
    this.musicEnabled = preferences.music;
    this.crowdVolume = Number.isFinite(preferences.crowd)
      ? Math.max(0, Math.min(1, preferences.crowd!))
      : 0.7;
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
    this.music.setAttribute("aria-label", "Before the Bell 메인·대기실 배경음악");
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
        this.crowdGain = this.context.createGain();
        this.crowdGain.gain.value = this.crowdVolume;
        this.crowdGain.connect(this.effectsGain);
        for (const file of new Set(
          Object.entries(files)
            .filter(([sound]) => !sound.startsWith("crowd-"))
            .flatMap(([, list]) => list),
        ))
          void this.load(file).catch(() => {});
        if (this.scene === "fight") this.preloadCrowd();
      }
      void this.context
        .resume()
        .then(() => {
          this.syncMusic();
          this.syncCrowd();
        })
        .catch(() => {});
      this.syncMusic();
      this.syncCrowd();
    } catch {
      /* A later user gesture can retry browser audio activation. */
    }
  }
  setScene(scene: AudioScene) {
    if (scene === this.scene) return;
    if (scene === "result" && this.scene === "fight" && this.arena?.active)
      this.play("crowd-finish", { delay: 0.25 });
    this.scene = scene;
    this.sceneEpoch++;
    if (scene !== "fight") {
      if (scene !== "result") {
        this.combatGeneration++;
        this.crowdCueGeneration++;
      }
      this.tracker.reset();
      this.grapplingTracker.reset();
      this.atmosphere.reset();
      this.arena = null;
      this.combatKey = "";
      this.stopCrowdReactions(scene === "result");
    } else this.preloadCrowd();
    this.syncMusic();
    this.syncCrowd();
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
    if (!enabled) {
      this.sceneEpoch++;
      this.crowdCueGeneration++;
      this.stopVoices();
    }
    this.syncCrowd();
  }
  setCrowdVolume(value: number) {
    this.crowdVolume = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : 0.7;
    if (!this.crowdVolume) {
      this.crowdCueGeneration++;
      this.stopCrowdReactions();
    } else if (this.scene === "fight") this.preloadCrowd();
    this.syncCrowd();
  }
  private preloadCrowd() {
    if (!this.context || !this.crowdVolume) return;
    for (const file of ["arena-bed", "arena-cheer", "arena-roar"])
      void this.load(file).catch(() => {});
  }
  private applyCrowdLevel() {
    if (!this.context || !this.crowdGain) return;
    const ducked = this.context.currentTime < this.crowdDuckUntil;
    const level =
      this.effectsEnabled && this.visible
        ? this.crowdVolume * (ducked ? 0.42 : 1)
        : 0;
    this.crowdGain.gain.setTargetAtTime(
      level,
      this.context.currentTime,
      ducked ? 0.008 : 0.08,
    );
  }
  private duckCrowd() {
    if (!this.context) return;
    this.crowdDuckUntil = this.context.currentTime + 0.14;
    this.applyCrowdLevel();
    clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.applyCrowdLevel(), 160);
  }
  private wantsCrowd() {
    return !!(
      this.context?.state === "running" &&
      this.scene === "fight" &&
      this.arena?.active &&
      this.visible &&
      this.effectsEnabled &&
      this.crowdVolume > 0
    );
  }
  private syncCrowd() {
    this.applyCrowdLevel();
    if (!this.wantsCrowd()) {
      this.stopCrowdLoop();
      return;
    }
    const gain = 0.8 + (this.arena?.energy || 0) * 1.1;
    if (this.crowdLoopGain && this.context)
      this.crowdLoopGain.gain.setTargetAtTime(
        gain,
        this.context.currentTime,
        0.3,
      );
    if (this.crowdLoop || this.crowdPending === this.crowdGeneration) return;
    const generation = this.crowdGeneration;
    this.crowdPending = generation;
    void this.load("arena-bed")
      .then((buffer) => {
        if (
          generation !== this.crowdGeneration ||
          !this.wantsCrowd() ||
          this.crowdLoop ||
          !this.context ||
          !this.crowdGain
        )
          return;
        const context = this.context,
          source = context.createBufferSource(),
          level = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        level.gain.value = 0;
        level.gain.setTargetAtTime(
          0.8 + (this.arena?.energy || 0) * 1.1,
          context.currentTime,
          0.4,
        );
        source.connect(level).connect(this.crowdGain);
        this.crowdLoop = source;
        this.crowdLoopGain = level;
        source.onended = () => {
          source.disconnect();
          level.disconnect();
        };
        source.start();
      })
      .catch(() => {})
      .finally(() => {
        if (this.crowdPending === generation) this.crowdPending = null;
      });
  }
  private stopCrowdLoop() {
    this.crowdGeneration++;
    const source = this.crowdLoop,
      gain = this.crowdLoopGain,
      context = this.context;
    this.crowdLoop = null;
    this.crowdLoopGain = null;
    if (!source || !gain || !context) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(0, context.currentTime, 0.02);
    try {
      source.stop(context.currentTime + 0.1);
    } catch {}
  }
  private stopCrowdReactions(keepFinish = false) {
    for (const [source, info] of this.crowdVoices) {
      if (keepFinish && info.sound === "crowd-finish") continue;
      if (this.context) {
        info.gain.gain.cancelScheduledValues(this.context.currentTime);
        info.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
      }
      try {
        source.stop((this.context?.currentTime || 0) + 0.05);
      } catch {}
      this.crowdVoices.delete(source);
    }
  }
  private setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    this.sceneEpoch++;
    if (!visible) {
      this.crowdCueGeneration++;
      this.stopVoices();
    }
    if (this.context && this.effectsGain)
      this.effectsGain.gain.setTargetAtTime(
        this.effectsEnabled && visible ? 0.8 : 0,
        this.context.currentTime,
        0.01,
      );
    if (visible && this.context)
      void this.context
        .resume()
        .then(() => {
          this.syncMusic();
          this.syncCrowd();
        })
        .catch(() => {});
    this.syncMusic(!visible);
    this.syncCrowd();
  }
  private wantsMusic() {
    return (
      this.musicEnabled &&
      (this.scene === "menu" || this.scene === "lobby") &&
      this.visible
    );
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
    const crowd = sound.startsWith("crowd-");
    if (
      !this.effectsEnabled ||
      !this.visible ||
      !this.context ||
      this.context.state !== "running" ||
      (crowd && !this.crowdVolume)
    )
      return;
    const count = this.counts.get(sound) || 0;
    this.counts.set(sound, count + 1);
    const variants = files[sound],
      file = variants[count % variants.length];
    const epoch = this.sceneEpoch;
    const combatGeneration = this.combatGeneration;
    const crowdGeneration = crowd
      ? ++this.crowdCueGeneration
      : this.crowdCueGeneration;
    const start = (buffer: AudioBuffer) => {
      const tail =
        (sound === "bell-end" ||
          sound === "fall" ||
          sound === "crowd-finish") &&
        this.scene === "result" &&
        combatGeneration === this.combatGeneration;
      if (
        (!tail && epoch !== this.sceneEpoch) ||
        !this.effectsEnabled ||
        !this.visible ||
        !this.context ||
        !this.effectsGain ||
        (crowd &&
          (!this.crowdVolume || crowdGeneration !== this.crowdCueGeneration))
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
      source
        .connect(gain)
        .connect(pan)
        .connect(crowd && this.crowdGain ? this.crowdGain : this.effectsGain);
      while (this.voices.size >= 10) {
        const oldest = this.voices.values().next().value;
        if (!oldest) break;
        this.voices.delete(oldest);
        try {
          oldest.stop();
        } catch {}
      }
      this.voices.add(source);
      if (crowd) this.crowdVoices.set(source, { sound, gain });
      source.onended = () => {
        this.voices.delete(source);
        this.crowdVoices.delete(source);
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
  observeCombat(bout: Bout, view: number, paused = false): ArenaFrame {
    // Finished room snapshots must not cancel the celebration retained by setScene.
    if (this.scene !== "fight") return this.atmosphere.update(bout, view, true);
    const key = `${bout.id}:${view}:${paused}`;
    if (key !== this.combatKey) {
      this.combatGeneration++;
      this.crowdCueGeneration++;
      this.combatKey = key;
      this.sceneEpoch++;
      this.tracker.reset();
      this.grapplingTracker.reset();
      this.atmosphere.reset();
      this.stopCrowdLoop();
      this.stopCrowdReactions();
    }
    const cues =
      bout.sport === "bjj"
        ? this.grapplingTracker.update(bout, view)
        : this.tracker.update(bout, view);
    for (const cue of cues) {
      if (this.scene === "fight" && !paused) {
        if (bout.sport === "bjj") {
          if (cue.sound === "fall") this.duckCrowd();
          this.play(cue.sound, {
            pan: cue.pan,
            gain: cue.sound === "fall" ? 0.55 : 1,
            rate: cue.sound === "fall" ? 1.1 : 1,
          });
        } else this.playCue(cue);
      }
    }
    this.arena = this.atmosphere.update(
      bout,
      view,
      paused || this.scene !== "fight",
    );
    if (this.scene === "fight" && this.arena.reaction) {
      this.stopCrowdReactions();
      this.play(`crowd-${this.arena.reaction}`, {
        delay: this.arena.reaction === "finish" ? 0.35 : 0.12,
      });
    }
    if (this.scene === "fight" && this.arena.warning) {
      this.play("bell-start", { gain: 0.4, rate: 1.4 });
      this.play("bell-start", { gain: 0.3, rate: 1.5, delay: 0.16 });
    }
    this.syncCrowd();
    return this.arena;
  }
  private playCue(cue: CombatSoundCue) {
    if (["punch", "heavy", "skill"].includes(cue.sound)) this.duckCrowd();
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
    this.crowdVoices.clear();
  }
}
