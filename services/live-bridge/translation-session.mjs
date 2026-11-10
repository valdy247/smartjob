// A phone call arrives with carrier-side echo cancellation/noise suppression.
// Avoid an additional translation-model noise gate that can remove quiet voices.
// The server must still submit continuous 24 kHz PCM16, including silence.
export function translationSessionUpdate(language){
  if(language!=="es"&&language!=="en")throw new Error("unsupported_translation_language");
  return {
    type:"session.update",
    session:{audio:{
      input:{noise_reduction:null},
      output:{language}
    }}
  };
}
