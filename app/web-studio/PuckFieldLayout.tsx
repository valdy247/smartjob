"use client";

// Puck's server entry does not export editor-only FieldTab/FieldGroup.
// Keep these helpers behind a client boundary; public site RSC renders only <Render>.
export {FieldTab,FieldGroup} from "@puckeditor/core";
