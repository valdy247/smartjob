import { createHmac, timingSafeEqual } from "node:crypto";

export const e164 = (value) => /^\+[1-9]\d{7,14}$/.test(value || "");
export const callSid = (value) => /^CA[a-f\d]{32}$/i.test(value || "");
export const accountSid = (value) => /^AC[a-f\d]{32}$/i.test(value || "");

export function routeSignature(secret, {bridge, customer, twilio, owner, customerLanguage, ownerLanguage}) {
  return createHmac("sha256", secret)
    .update(["smartjob-relay-v2", bridge, customer, twilio, owner, customerLanguage, ownerLanguage].join("\n"))
    .digest("hex");
}
export function matchesRouteSignature(secret, route, provided) {
  if (!/^[a-f\d]{64}$/i.test(provided || "")) return false;
  const a = Buffer.from(routeSignature(secret, route), "hex"), b = Buffer.from(provided, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Keep prices, dates, phone numbers, allergies, measurements and quantities in the
// verified full-response lane. We never stream them before quality checks complete.
export function needsVerifiedTranslation(source) {
  return /[$€£%]|\d|(?<![\p{L}\d])(?:alérgic[oa]s?|alergias?|sesenta|setenta|ochenta|noventa|cuarenta|cincuenta|treinta|cientos?|millones?|millions?|hundreds?|date|fecha|tomorrow|mañana|yesterday|ayer|today|hoy|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miércoles|jueves|viernes|sábado|domingo|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|allerg(?:y|ies|ic|ia|ias)|peanut|nuts?|gluten|milk|dairy|egg|huevo|leche|nuez|cacahuate|maní|precio|price|cost|dollar|dólar|dólares|pesos?|euros?|cent|kilos?|kilograms?|pounds?|libras?|grams?|gramos?|ounces?|onzas?|veinte|twenty|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil|half|quarter|medio|media|hora|hour|minute|minuto)(?![\p{L}\d])/iu.test(source);
}

export function makeStreamingTokens(send) {
  let pending = "", finished = false, count = 0;
  return {
    next(token) {
      if (finished || typeof token !== "string" || !token) return;
      if (pending) { send(pending, false); count++; }
      pending = token;
    },
    finish() {
      if (finished) return count;
      finished = true;
      if (pending) { send(pending, true); count++; }
      return count;
    },
    get count() { return count; },
  };
}
