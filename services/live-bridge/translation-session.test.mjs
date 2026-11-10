import test from "node:test";
import assert from "node:assert/strict";
import {translationSessionUpdate} from "./translation-session.mjs";

test("phone translation preserves the correct destination language",()=>{
  assert.equal(translationSessionUpdate("es").session.audio.output.language,"es");
  assert.equal(translationSessionUpdate("en").session.audio.output.language,"en");
});

test("phone translation disables extra noise reduction, retaining quiet speech",()=>{
  const update=translationSessionUpdate("es");
  assert.equal(update.type,"session.update");
  assert.equal(update.session.audio.input.noise_reduction,null);
});

test("rejects unrecognized target languages",()=>{
  assert.throws(()=>translationSessionUpdate("fr"),/unsupported_translation_language/);
});
