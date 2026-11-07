import * as THREE from "three";
// Preserve the delivered skeleton's coordinate system and use the actual guard pose.
export function prepareNativeClips(
  root: THREE.Object3D,
  source: THREE.AnimationClip[],
  roles: Record<string, string>,
) {
  const clips: THREE.AnimationClip[] = [];
  for (const [role, name] of Object.entries(roles)) {
    const original = source.find((c) => c.name === name);
    if (!original) throw Error(`Missing animation: ${name}`);
    const clip = original.clone();
    clip.name = role;
    for (const track of clip.tracks) {
      if (!/(?:Hips|Pelvis|Root|Armature)\.position$/i.test(track.name))
        continue;
      const node = root.getObjectByName(track.name.slice(0, -9));
      const values = track.values;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = node?.position.x ?? values[0];
        values[i + 2] = node?.position.z ?? values[2];
      }
    }
    clips.push(clip);
  }
  const jab = clips.find((c) => c.name === "jab");
  if (!jab) return clips;
  function pose(name: string) {
    const duration = name === "walk" ? 0.8 : 2;
    const tracks = jab!.tracks.map((sourceTrack) => {
      const track = sourceTrack.clone(),
        size = track.getValueSize(),
        base = Array.from(track.values.slice(0, size));
      const values: number[] = [];
      for (let frame = 0; frame < 3; frame++) {
        const value = [...base];
        if (size === 4 && track.name.endsWith(".quaternion")) {
          let offset = 0;
          if (
            name === "walk" &&
            /(?:LeftUpLeg|RightUpLeg)\.quaternion$/.test(track.name)
          )
            offset =
              (frame === 1 ? -0.22 : 0.22) *
              (track.name.includes("Left") ? 1 : -1);
          else if (
            (name === "idle" || name === "hit") &&
            /Spine01\.quaternion$/.test(track.name) &&
            frame === 1
          )
            offset = name === "hit" ? -0.18 : 0.025;
          if (offset) {
            const q = new THREE.Quaternion()
              .fromArray(base)
              .multiply(
                new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(offset, 0, 0),
                ),
              );
            value.splice(0, 4, q.x, q.y, q.z, q.w);
          }
        }
        values.push(...value);
      }
      track.times = new Float32Array([0, duration / 2, duration]);
      track.values = new Float32Array(values);
      return track;
    });
    return new THREE.AnimationClip(name, duration, tracks);
  }
  clips.push(pose("idle"), pose("guard"), pose("walk"), pose("hit"));
  return clips;
}
