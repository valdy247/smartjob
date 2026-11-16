import {createHash} from "node:crypto";

/** A public, non-sensitive revision for approved and active catalog rows.
 * Any insert, edit, approval change or removal changes this fingerprint.
 */
export function publishedCatalogVersion(rows:ReadonlyArray<{id:string;updated_at:string}>):string{
 const canonical=rows.map(row=>row.id+":"+row.updated_at).sort().join("|");
 return createHash("sha256").update(canonical).digest("hex").slice(0,24);
}
