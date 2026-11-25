/** A real, continuously moving Ken Burns clip from one approved image.
 * zoompan processes a SINGLE image and produces all frames in one pass;
 * avoid looping the source with d=1, which can lead to effectively static
 * framing and a zoom too subtle to notice on a mobile screen.
 */
export function buildZoomMotion(duration,fps=24){
 if(!Number.isFinite(duration)||duration<0.5||duration>20||
  !Number.isInteger(fps)||fps<12||fps>60)throw Error("studio_zoom_duration_invalid");
 const frames=Math.max(2,Math.ceil(duration*fps));
 const vf=[
  "scale=760:1360:force_original_aspect_ratio=increase",
  "crop=760:1360",
  "zoompan=z='1+0.18*min(on/"+(frames-1)+",1)'"+
   ":x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"+
   ":d="+frames+":s=720x1280:fps="+fps,
  "format=yuv420p"
 ].join(",");
 return {frames,vf};
}
