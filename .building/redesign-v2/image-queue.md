# Image queue — Stripe-cut marketing imagery (fill via imagegen pipeline)

Drop finished images at `apps/frontend/public/marketing/<slot>.png` (2x the
rendered size). Until a file exists, the site shows a palette gradient-art
fallback (.mk-imgslot), so nothing looks broken. When images land, swap the
fallback div for `<img src="/marketing/<slot>.png" …>` in page.tsx (slots are
labeled in-DOM via data-label="publishly · <slot>").

Global style prompt prefix (keep consistent across all slots):
"Premium SaaS marketing illustration, soft 3D-render aesthetic, deep navy
(#133458) environment with butter-cream (#FAF7BB), amber (#D99B21) and olive
(#838921) accent lighting, glossy floating UI panels, subtle depth of field,
no text, no logos, no people's faces, 16:9, clean studio lighting, Stripe-like
editorial quality"

| Slot | Size (CSS px) | Scene prompt (append to prefix) |
|---|---|---|
| composer | 760×336 | a floating post-composer window duplicating itself into five smaller network-shaped cards that fan out like dealt playing cards |
| calendar | 368×336 | a glossy weekly calendar grid tilted in 3D space with glowing amber post-cards snapping into slots |
| publishing | 368×336 | a rail-yard of glowing delivery tracks converging into one bright pipeline, small parcels traveling with motion trails |
| bulk | 368×336 | a cascading stack of spreadsheet rows transforming mid-air into neat glowing post cards on a conveyor |
| analytics | 368×336 | tall translucent bar-chart columns rising from a reflective navy floor, one amber column tallest, soft data-grid horizon |
| story-agencies | 380×300 | three isolated glass workspace cubes side by side, each containing its own miniature calendar and channels, connected by a thin amber thread |
| story-creators | 380×300 | one glowing draft page radiating ten light-threads outward to small floating network tiles arranged in an arc |
| story-teams | 380×300 | two translucent hands-free cursor arrows collaborating over one shared calendar panel, soft amber highlights on the active row |
| og-refresh (publishly-social.png) | 1200×630 | wide hero banner: the lava-gradient wave field in the four brand colors flowing diagonally, a single floating white calendar card upper right |

Notes: pipeline session = ChatGPT imagegen (extension workflow) — one batch of
9. Keep the palette EXACT; reject any output that introduces off-palette hues
or text artifacts. Nominative platform names never appear in images.
