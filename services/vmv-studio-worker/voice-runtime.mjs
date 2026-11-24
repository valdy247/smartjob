/**
 * A recorded voiceover is the source of truth for scene cut timing.
 * Respect the selected length as an approximate target, not a hard FFmpeg
 * clamp that destroys already-paid images and a complete speech track.
 * Extreme deviations still fail before paying for animation.
 */
export function recordedVoiceRuntime(targetSeconds,recordedSeconds){
 const target=Number(targetSeconds),actual=Number(recordedSeconds);
 if(!Number.isFinite(target)||target<15||target>180||
  !Number.isFinite(actual)||actual<3||actual>300)
  throw Error("voice_duration_invalid");
 // A controlled grace band compensates for natural voice/accent variation.
 // Avoid arbitrary accelerating, deleting words or padding fake speech.
 if(actual<Math.max(8,target*.55)||actual>Math.min(300,target*1.5))
  throw Error("voice_duration_outside_safe_range");
 return actual;
}
