/** Persist only a reference to a video job. Never cache user scripts, media or access tokens.
 * The actual job must always be reloaded through the authenticated, owner-checked API.
 */
export type StudioRestorableStage="progress"|"images"|"result";
export type StudioPersistedJob={
 id:string;status:string;scenes?:Array<{requiresReview?:boolean}>;
};
const savedStatus=new Set(["queued_images","generating_images","awaiting_image_approval",
 "queued_animation","animating","assembling","verifying","completed","failed"]);
export function isStudioJobRestorable(status:unknown):boolean{
 return typeof status==="string"&&savedStatus.has(status);
}
export function studioJobKey(owner:unknown):string|null{
 return typeof owner==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(owner)?
  "vmv-video-studio-current-job-v1:"+owner:null;
}
export function validStudioJobId(value:unknown):value is string{
 return typeof value==="string"&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function studioStageForJob(job:StudioPersistedJob):StudioRestorableStage{
 if(job.status==="completed")return "result";
 if(job.status==="awaiting_image_approval"&&
  (!Array.isArray(job.scenes)||!job.scenes.length||
    !job.scenes.every(s=>s.requiresReview===false)))
  return "images";
 return "progress";
}
