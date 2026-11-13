# Web Services — Visual element inspector (Nov 13, 2026)

Changes exclusively in Web Studio / Puck composition and public rendering. Shared branch feat/vmv-smart-call-control-center. No modifications to VMV Home, Marketing, AI Agents, Smart Call, Mayuli Bakery domain or existing customer documents.

## Touch / click flow

1. In Puck select an **Imagen editable**, **Portada con fotografía**, **Título editable** or **Texto editable**.
2. The selected-element action bar opens a compact, accessible menu over the Puck canvas. It includes:
   - Image: replace from owner library/upload, remove from **this location only**, size slider (25–100%), corner radius slider (0–80px), transparency (0–100%), border width/color and bounded X/Y offset.
   - Text: direct editing, six curated font choices, type-size slider, text color swatches/custom color, bold/italic, shadow styles, and optional safe internal/HTTPS/email/phone link.
   - HeroVisual: separate Foto/Título tabs inside the selected menu; title typography and link apply without replacing the hero.
3. Photo & compositional text blocks expose a **Mover** touch/pointer handle on canvas for offsets within the current section; the native Puck drag handle is still used for reordering and moving between compatible slots.
4. Puck autosave persists inspector state in draft first. Explicit publication is still required; restoring revisions remains available. Deleting a selected image changes only its Puck field and does not physically delete a photo from another page.
5. Controls exist both in the selected-element menu and in grouped Puck properties. All new properties pass through the same normalizer used by the public site.

## Evidence

- Vercel Next build and type checking must show READY for this branch SHA.
- Build-time invariant in app/web-studio/demos/composition/page.tsx checks nested headings and image properties survive normalization: text shadow, link, corner radius, opacity, border, image X position.
- Supabase regression supabase/tests/vmv_web_context_controls.sql PASS in a rolled-back transaction:
  - Two unrelated image blocks preserved.
  - Cover typography/link and photo sliders persisted and published.
  - Draft transparency edit leaves public version unchanged until republish.
  - Republish retains modified transparency without modifying neighbor.
- No actual client image, site, or business was changed. No paid services invoked.

## Bounds and remaining QA

- "Mover" is **bounded translation of ±150px inside the existing composition**. It is not unrestricted free positioning across the entire webpage. Responsive layout/columns still take precedence.
- Existing legacy single-photo and catalog-item grids keep their original editor semantics; current image direct sliders apply to ComposeImage and HeroVisual. Older standalone Image supports replacing and removing but does not yet have contextual size/border sliders; per-product image selection inside OfferingGrid remains a future improvement.
- Signed-in mobile and desktop interaction tests are **not yet verified** (Puck selection hit targets, action-bar clipping, touch pointer capture, upload interaction, visual parity). Do not describe these as tested until measured in actual browsers.
- Undo/redo comes from Puck's current history; permanent deletion of uploaded Storage objects is a separate protected library action.
