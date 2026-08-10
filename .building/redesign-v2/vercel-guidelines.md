# Vercel Web Interface Guidelines (operator-supplied reference, 2026-08-09)

Source: vercel.com/design — pasted by the operator as the governing spec for the
Publishly marketing remake v2. "Take all aspects of design from them."

## Interactions
- Keyboard works everywhere; WAI-ARIA Authoring Patterns.
- Clear focus: visible focus ring on every focusable element; prefer :focus-visible; :focus-within for grouped controls.
- Manage focus (traps, move & return per WAI-ARIA).
- Hit targets ≥ 24px (44px mobile) even when visual target is smaller.
- Mobile input font-size ≥ 16px (prevents iOS zoom).
- Never disable browser zoom.
- Hydration-safe inputs (no lost focus/value).
- Never block paste.
- Loading buttons: spinner + keep original label.
- Loading states: ~150-300ms show-delay + ~300-500ms minimum visible time.
- URL as state (share/refresh/Back-Forward safe).
- Optimistic updates with rollback/Undo on failure.
- Ellipsis ("…") for further-input menu options & loading states.
- Confirm destructive actions or provide Undo.
- touch-action: manipulation (no double-tap zoom); set -webkit-tap-highlight-color.
- Generous, forgiving interactions; tooltip group timing (first delayed, peers immediate).
- overscroll-behavior: contain in modals/drawers.
- Scroll positions persist on Back/Forward.
- Autofocus single primary input on desktop only.
- No dead zones; looks interactive = is interactive.
- Deep-link everything (filters, tabs, pagination, panels).
- Clean drag: disable selection, apply inert while dragging.
- Links are <a>/<Link> — never button/div for navigation.
- aria-live (polite) for async updates (toasts, validation).
- Locale-aware keyboard shortcuts; platform-specific symbols.

## Animations
- Honor prefers-reduced-motion with a real variant.
- CSS > Web Animations API > JS libraries; avoid main-thread JS animation.
- Compositor-friendly: transform/opacity only; never width/height/top/left.
- Necessity check: animate only to clarify cause/effect or deliberate delight.
- Easing fits the subject; animations interruptible; input-driven (no autoplay).
- Correct transform-origin (anchor where motion physically starts).
- Never `transition: all` — list properties explicitly.
- SVG: animate <g> wrappers with transform-box: fill-box; transform-origin: center.

## Layout
- Optical alignment (±1px when perception beats geometry).
- Deliberate alignment: everything aligns to grid/baseline/edge/optical center.
- Balance contrast in icon+text lockups.
- Verify mobile, laptop, ultra-wide (zoom 50% to simulate).
- Respect safe areas (notches, insets).
- No excessive scrollbars; fix overflow.
- Let the browser size things (flex/grid/intrinsic; no JS measuring).

## Content
- Inline help first; tooltips last resort.
- Skeletons mirror final content exactly (no shift).
- Accurate <title> per context. No dead ends — every screen offers a next step.
- Design empty/sparse/dense/error states.
- Curly quotes (" ") over straight. Tidy widows/orphans.
- Tabular numbers for comparisons (font-variant-numeric: tabular-nums / Geist Mono).
- Redundant status cues (never color alone). Icons have text labels/aria-label.
- Use the ellipsis character (…) not three periods.
- scroll-margin-top on anchored headings.
- Resilient to short/average/very-long user content.
- Locale-aware dates/numbers/currency; language from Accept-Language, never IP.
- translate="no" on brand names, code tokens, technical identifiers.
- Semantics before ARIA; hierarchical h1-h6 + "Skip to content" link.
- Right-click the nav logo surfaces brand assets.
- Non-breaking spaces for glued terms (10&nbsp;MB, ⌘&nbsp;+&nbsp;K).

## Forms
- Enter submits (single control) / last control; textarea ⌘+Enter submits.
- Labels everywhere; label click focuses control.
- Submit enabled until submission starts; then disable + spinner + idempotency key.
- Don't block typing; don't pre-disable submit; validation feedback instead.
- No dead zones on checkbox/radio (label+control one hit target).
- Errors next to fields; focus first error on submit.
- autocomplete + meaningful name; spellcheck off for emails/codes/usernames.
- Correct type/inputmode; placeholders = example values ending with ….
- Warn on unsaved changes; password-manager & 2FA compatible; allow OTP paste.
- Don't trigger password managers for non-auth fields.
- Trim trailing whitespace from text-expansion inputs.
- Windows native <select>: set background-color & color explicitly.

## Performance
- Test iOS Low Power Mode & macOS Safari; measure without extensions.
- Track & minimize re-renders; throttle CPU/network when profiling.
- Batch layout reads/writes. POST/PATCH/DELETE < 500ms budgets.
- Prefer uncontrolled inputs. Virtualize large lists.
- Preload only above-the-fold images; lazy-load rest; explicit image dimensions (no CLS).
- Preconnect to asset origins; preload critical fonts; subset fonts (unicode-range).
- Move long tasks to Web Workers.

## Design
- Layered shadows (ambient + direct, ≥2 layers). Crisp borders (semi-transparent + shadow).
- Nested radii: child ≤ parent, concentric.
- Hue consistency: tint borders/shadows/text toward background hue on non-neutral backgrounds.
- Color-blind-friendly chart palettes. Prefer APCA contrast over WCAG 2.
- Interactions increase contrast (hover/active/focus > rest).
- <meta name="theme-color"> matches page background; color-scheme on <html>.
- Animate wrappers, not text nodes (anti-aliasing); avoid gradient banding.

## Vercel copywriting (brand voice)
- Active voice; action-oriented; second person; clear & concise; & over and.
- Marketing pages: sentence case headings. Product UI: Title Case (Chicago).
- Consistent nouns; minimal unique terms.
- Placeholders: YOUR_API_TOKEN_HERE / 0123456789.
- Numerals for counts ("8 deployments"). Currency: 0 or 2 decimals, never mixed.
- Number + unit separated by non-breaking space (10 MB).
- Positive framing, even errors; error messages guide the exit with a clear action.
- Unambiguous labels ("Save API key", not "Continue").
