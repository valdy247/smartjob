import {AudioLines} from "lucide-react";
/** Shared VMV CALL mark across splash, login, registration, header and setup. */
export function Brand(){
 return <span className="brand" aria-label="VMV Call">
  <span className="brandmark" aria-hidden="true"><AudioLines size={23} strokeWidth={2.8}/></span>
  <span className="brandname">VMV<em> CALL</em></span>
 </span>;
}
