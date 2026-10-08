# Design — apartment planner

This file is binding. It consists of two parts:

1. **Application rules (this section)** — how the Night Signal system is applied to this app. Where
   the two conflict, this section wins.
2. **Night Signal** (below, unchanged) — the source design system for tokens, typography, components
   and motion.

## A. Scope: the UI is Night Signal, the apartment is not

Core principle of the brief: *the UI steps back, the colour belongs to the apartment.*

- Night Signal applies to the **UI chrome**: toolbar, side panel (tree + inspector), time bar,
  library bar, workshop chrome, documents view, dialogs, toasts, forms. Tokens, fonts, panels, chips,
  focus rings and neon states come from Night Signal.
- **Nothing sits on top of the 3D viewport.** No grain, scanlines, VHS streaks, vignette or backdrop
  glow over the scene; the rendered apartment stays colour-true. This overrides Night Signal §1.2.3 and
  §5 ("texture is always on") for the viewport.
- Texture layers (grain, scanlines, vignette) may be used on **non-3D surfaces** only (e.g. the
  documents overview background, empty states), at the low opacities from §5.
- Film grain and vignette over the scene exist only as the optional **mood layer** (`<MoodLayer />`),
  switched on by the user or a lighting preset.
- **Dashboard, not poster.** This is a tool. The editorial headline pattern (§3.2), poster composition
  (§4.2), HUD corners (§6.7), spin-blur page transitions (§8.3), glitch effects (§8.4) and the
  illustration characters (§7) are **not** used in the editor and workshop. They may appear sparingly
  in the documents view header and in empty states.
- Panels are compact: `--radius-sm` for inner elements, `--radius` only for floating panels; the side
  panel and bars are flat ink surfaces with a hairline edge.
- Motion in the tool UI: short `rise`/`pop` easings, 150–250 ms. No slam, shake or flash.
- Fonts are self-hosted (`apps/web/src/assets/fonts/`), never loaded from Google Fonts at runtime — the
  app must work offline and inside Electron.
- Dark is the default; the paper theme is not built in the first iteration.

## B. State vocabulary (UI and 3D viewport)

Every state below must look the same in the tree, the inspector and — where it applies — the viewport.

| State | Look | Viewport |
|---|---|---|
| Selected | `--blue-bright` outline + `--neon-blue` | blue outline around the object |
| Estimated (`estimated: true`) | dashed `--mustard` outline + mustard marker | dashed mustard outline on walls/openings |
| Collision / passage too narrow | `--red` outline + `--neon-red` | red outline, red measurement line |
| Locked | lock icon in `--cream2`, no glow | no change |
| Hidden | 40 % opacity, struck-through eye icon | object not rendered |
| Adjusted slider value (clamped / differs from default) | `--mustard` dot next to the value | — |
| "Claude arbeitet …" | LED chip (`.chip.led`) with a pulsing status dot | — |
| Photo rendering | LED dot-matrix sample counter + `--mustard` progress bar | — |
| In trash | desaturated thumbnail, `--cream2` text, `--ink3` surface | — |

Semantics stay as in Night Signal: red = danger / primary action, blue = selection / focus / info,
LED = live / AI working / success, mustard = highlight / estimated / adjusted.

---

# Design System: Night Signal

> A complete design specification for AI models and developers. It defines every visual and interactive rule needed to build websites in the **Night Signal** style: a late-night broadcast from 1986, laid out like an album poster, starring hand-made critters.
>
> Origin: distilled from the motion design of the video *"Der Linux-Kernel: Architektur & Bootvorgang"*. The mood board behind it: a black editorial album poster with chrome and LED-dot details, a pixel serif on glitched VHS texture, scratchy ink raccoons, fuzzy felt dogs on mustard paper, and a spin-blurred flash photo in red and blue.

---

## 1. Brand Identity

### 1.1 Personality

- **Editorial first.** Pages read like a printed poster: a huge condensed serif headline with one italic word, a small line above it, a rule, a column of fine print. Hierarchy comes from scale and restraint, not from boxes.
- **Broadcast texture.** Everything sits under film grain, faint VHS streaks and scanlines. The screen feels like a tape, not a monitor.
- **Neon as a signal, not as wallpaper.** Red and blue glow only where something *happens*: an active state, a warning, a live value. Most of the page is ink and cream.
- **Hand-made characters.** Two illustration families carry the warmth: scratchy cream ink creatures (the "raccoon") and fuzzy felt creatures in saturated colours (the "critters"). They are guides, not decoration.
- **Machine details.** LED dot-matrix readouts, terminal windows, `PLAY ▶ 00:42` counters and footnotes with code references. Precise, a little nerdy, always legible.

### 1.2 Design Principles

1. **Poster over dashboard.** One dominant headline per viewport. Supporting content is small, calm and aligned to a rule.
2. **Ink and cream carry 90 % of the surface.** Colour is spent on meaning: red = kernel / danger / primary action, blue = user / info / links, LED green = live / success, mustard and pink = critters and highlights.
3. **Texture is always on.** Grain + scanlines + vignette are part of the page chrome, never removed on "clean" pages. They are subtle enough to read through.
4. **Every glow earns its place.** A neon edge appears on hover, focus, active or live states. A static page with six glowing boxes is a design error.
5. **Mix three voices, never more.** Serif display (emotion), condensed grotesk (information), mono/pixel (machine). A fourth font family is never introduced.
6. **Motion has weight and a camera.** Things slam in, rise out of blur, or arrive through a rotational spin blur. Nothing slides in politely at 200 ms linear.
7. **Accessibility is not optional.** All text meets WCAG AA against its real background, texture never drops contrast below that, and all motion respects `prefers-reduced-motion`.

---

## 2. Color System

### 2.1 Core Tokens (dark, default)

| Token | Value | Usage |
|---|---|---|
| `--ink` | `#0b0a0d` | Page background — near-black with a violet cast |
| `--ink2` | `#17151b` | Raised surfaces: panels, terminals, cards |
| `--ink3` | `#24212a` | Inset surfaces, tracks, disabled fills |
| `--cream` | `#efe6d6` | Primary text, headlines, rules, ink illustrations |
| `--cream2` | `#b8afa2` | Secondary text, labels, footnotes, inactive states |
| `--red` | `#ec4a34` | Signal red: primary actions, kernel, warnings, active neon |
| `--blue` | `#3f6dff` | Electric blue: user space, info, focus rings, neon accents |
| `--blue-bright` | `#6d8fff` | Blue for **small text and links** on dark surfaces |
| `--mustard` | `#e8bf57` | Highlights, numbers, code emphasis, critter fur |
| `--pink` | `#f4a7be` | Critter eyes and mouths, soft tags |
| `--led` | `#a8f34c` | LED green: live values, success, "online", terminal output |
| `--moss` | `#1f3b2f` | Critter noses and pupils, deep accent on paper |

### 2.2 Derived Tokens

| Token | Value | Usage |
|---|---|---|
| `--neon-red` | `0 0 6px var(--red), 0 0 22px var(--red), 0 0 52px rgba(236,74,52,.45)` | Three-layer glow: core, halo, bloom |
| `--neon-blue` | `0 0 6px var(--blue), 0 0 22px var(--blue), 0 0 52px rgba(63,109,255,.45)` | Same for blue |
| `--neon-led` | `0 0 5px var(--led), 0 0 16px rgba(168,243,76,.6)` | Tighter glow for LED readouts |
| `--chrome` | `linear-gradient(180deg,#fff 0%,#d9d4e6 38%,#6d6880 50%,#f0e9ff 58%,#9a93ad 80%,#fff 100%)` | 80s chrome fill for rare hero words |
| `--shadow` | `0 18px 50px rgba(0,0,0,.6)` | Default lift for panels |
| `--backdrop` | radial violet glow top-centre + faint red glow bottom (see §12) | Page atmosphere behind content |

### 2.3 Contrast (measured, WCAG 2.1)

| Foreground | on `--ink` | on `--ink2` | Allowed for |
|---|---|---|---|
| `--cream` | 15.9 : 1 | 14.6 : 1 | everything |
| `--cream2` | 9.1 : 1 | 8.4 : 1 | everything |
| `--mustard` | 11.3 : 1 | 10.4 : 1 | everything |
| `--led` | 14.7 : 1 | 13.4 : 1 | everything |
| `--pink` | 10.5 : 1 | 9.6 : 1 | everything |
| `--blue-bright` | 6.6 : 1 | 6.1 : 1 | small text, links |
| `--red` | 5.3 : 1 | 4.8 : 1 | text ≥ 16px, UI, headlines |
| `--blue` | 4.6 : 1 | 4.2 : 1 | **large text (≥ 24px) and UI only** — use `--blue-bright` below that |

Filled buttons: `--ink` text on `--red` (5.3 : 1) or on `--led` (14.7 : 1). **Never cream text on red or blue fills** (3.0 : 1 / 3.5 : 1).

### 2.4 Rules

- **One neon hue per component.** A card glows red *or* blue, never both.
- **Red means kernel, action or danger; blue means user, info or focus.** Keep the semantics stable across a site.
- **Mustard, pink and moss belong to critters and highlights.** They are never used for large UI surfaces.
- **LED green is reserved for live and success states** (status dots, terminal output, counters that are "on").
- **No gradients on surfaces** except the backdrop glow and the chrome text fill. Panels are flat ink with a hairline edge.
- **No raw values in components.** Everything references the tokens.

---

## 3. Typography

### 3.1 Font Families

| Role | Font | Fallback | Usage |
|---|---|---|---|
| **Display** | `Instrument Serif` (regular + italic) | `serif` | Headlines, hero claims, section titles, big quotes |
| **Information** | `Archivo` (variable: width 62–125 %, weight 400–900) | `sans-serif` | Body, labels, navigation, buttons, captions, small caps |
| **Machine** | `VT323` | `monospace` | Terminals, code, counters, timestamps |
| **Pixel accent** | `Jacquard 24` | `serif` | Numerals, footnote markers, tiny section ornaments |

All four are on Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Serif:ital@0;1&family=Jacquard+24&family=VT323&display=swap" rel="stylesheet">
```

> **Note for AI models:** `Jacquard 24` renders a capital `I` like a blackletter `J`. Use it for **digits and short ornaments only**, never for Roman numerals or words that start with `I`. Roman numerals are set in Instrument Serif italic.

### 3.2 The Editorial Headline Pattern (signature)

Every hero and section title follows the album-poster rhythm:

```
small line above          ← Archivo 500, 16–26px, cream, sentence case
Der Linux-*Kernel.*       ← Instrument Serif 400, one word or phrase in italic, ends with a period
──────────────            ← optional 1.5px cream rule
FINE PRINT IN CAPS        ← Archivo 800, width 75 %, uppercase, letter-spacing .12–.16em, cream2
```

- The italic part is the *meaning* of the headline ("Ein *Monolith.*", "Lazy *Loading.*", "Boot*vorgang.*").
- Headlines end with a period. It is part of the voice.
- Display text is never bold. Emphasis in a serif headline is italic, not weight.

### 3.3 Type Scale (fluid)

| Name | Size | Font / weight | Line height |
|---|---|---|---|
| `--fs-hero` | `clamp(3.5rem, 9vw, 11rem)` | Instrument Serif 400 | 0.95 |
| `--fs-h1` | `clamp(2.75rem, 6vw, 7rem)` | Instrument Serif 400 | 0.95 |
| `--fs-h2` | `clamp(2.25rem, 4.2vw, 4.5rem)` | Instrument Serif 400 | 1.0 |
| `--fs-h3` | `clamp(1.5rem, 2.4vw, 2.25rem)` | Instrument Serif 400 | 1.1 |
| `--fs-lead` | `clamp(1.125rem, 1.6vw, 1.375rem)` | Archivo 500, width 90 % | 1.5 |
| `--fs-body` | `1rem` (16px), `1.0625rem` at ≥ 1200px | Archivo 450, width 95 % | 1.6 |
| `--fs-small` | `0.875rem` | Archivo 500, width 85 % | 1.45 |
| `--fs-caps` | `0.8125rem` | Archivo 800, width 75 %, uppercase, `letter-spacing: .12em` | 1.3 |
| `--fs-mono` | `1.25rem` (VT323 runs small) | VT323 400 | 1.2 |
| `--fs-led` | dot size 6–16px (see §6.6) | LED matrix | — |

Headlines use `letter-spacing: -0.015em`. Caps labels use positive tracking. Body text never goes below 16px.

### 3.4 Text Effects

| Class | Effect | Use |
|---|---|---|
| `.neon-red` / `.neon-blue` | colour + `text-shadow: var(--neon-*)` | One live word or one section title per viewport |
| `.neon-led` | LED colour + tight glow | Live values, "online", counters |
| `.chrome` | `--chrome` as clipped background + blue drop-shadow | Max one word per page (logo, hero word) |
| `.italic-meaning` | Instrument Serif italic | The meaningful part of a headline |

---

## 4. Spacing & Layout

### 4.1 Grid

| Property | Value |
|---|---|
| Columns | 12, gap `clamp(16px, 2vw, 32px)` |
| Max width | `1440px` for poster layouts, `720px` for reading columns |
| Side padding | `clamp(20px, 5vw, 80px)` |
| Section rhythm | `padding-block: clamp(96px, 14vh, 200px)`; hero sections `min-height: 100svh` |

### 4.2 Poster Composition

- **Centre axis.** Heroes and section openers are centred like a poster: small line, headline, rule, fine print, then one visual.
- **Two-column fine print.** Longer intros sit in two justified columns under the headline (`text-align: justify; hyphens: auto;` at ≥ 900px), like the liner notes on an album back.
- **Tracklist lists.** Feature lists and agendas are set as one centred line of caps separated by ` · ` (`RINGE · SYSCALLS · MONOLITH · …`), or as a numbered "tracklist".
- **Corners are HUD.** The four corners carry chrome: section marker top-left (`I · ARCHITEKTUR`), a VHS counter top-right (`PLAY ▶ 00:42`), footnotes bottom-left, scroll hint or page number bottom-right.

### 4.3 Tokens

| Token | Value | Usage |
|---|---|---|
| `--radius` | `22px` | Panels, cards, terminals, modals |
| `--radius-sm` | `12px` | Inputs, tiles, table rows |
| `--radius-pill` | `999px` | Chips, buttons |
| `--hairline` | `1.5px solid rgba(239,230,214,.18)` | Default panel edge |
| `--rule` | `1.5px solid rgba(239,230,214,.5)` | Editorial rules |
| `--space-1 … --space-9` | `4, 8, 12, 16, 24, 32, 48, 72, 120px` | Spacing scale |

---

## 5. Texture & Atmosphere (always on)

The page chrome is a stack of fixed, `pointer-events: none` layers above the content:

| Layer | Recipe | Opacity |
|---|---|---|
| Backdrop | `radial-gradient(ellipse 70% 55% at 50% 38%, rgba(63,60,120,.28), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 110%, rgba(236,74,52,.12), transparent 70%)` behind content | 1 |
| VHS streaks | SVG `feTurbulence baseFrequency="0.0015 0.045"` → cream alpha via `feColorMatrix`, drifting horizontally | .08–.10, `mix-blend-mode: screen` |
| Film grain | 256px noise tile (generated once), `background-position` jumping in `steps()` at ~12 fps | .14–.18, `mix-blend-mode: overlay` |
| Scanlines | `repeating-linear-gradient(0deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px)` | .06–.08 |
| Vignette | `radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.8) 100%)` | 1 |

Rules:
- Grain and streaks are **fixed to the viewport**, not to the document, so they do not scroll.
- Under `prefers-reduced-motion`, grain and streaks stop moving but stay visible.
- Texture never sits between a form field and its label focus ring. Raise focused elements above it (`z-index`), or keep the texture opacity low enough that the ring passes 3 : 1.

---

## 6. Component Library

### 6.1 Buttons

| Variant | Spec |
|---|---|
| **Primary** | Pill, `padding: 14px 28px`, `background: var(--red)`, `color: var(--ink)`, Archivo 800 width 75 % uppercase `letter-spacing: .08em` 14–16px. Hover: `box-shadow: var(--neon-red)`, `translateY(-2px)`. Active: `scale(.97)`. |
| **Secondary** | Pill, transparent, `border: 1.5px solid var(--cream)`, cream text. Hover: border and text turn `--blue-bright`, `box-shadow: var(--neon-blue)`. |
| **Ghost / text link** | Archivo 600, cream, 1.5px underline offset 4px in `--cream2`. Hover: underline turns red and thickens to 2px. Links inside body copy use `--blue-bright`. |
| **Play button** | Circle 64px, cream border, `▶` glyph. Hover: fills red, glyph ink. Use for anything that starts media or a demo. |

Focus (all buttons): `outline: 2px solid var(--blue-bright); outline-offset: 4px;` plus `--neon-blue`.

### 6.2 Chips & Tags

- Pill, `padding: 8px 22px`, `background: rgba(23,21,27,.9)`, `border: 1.5px solid rgba(239,230,214,.35)`, Archivo 700 width 80 %, 14–18px.
- State variants: `.chip.red`, `.chip.blue`, `.chip.led` swap the border colour and add the matching neon glow. LED chips also turn their text LED green.
- Chips can carry a 10px status dot on the left (`--cream2` idle → `--led` live).

### 6.3 Panel (the default surface)

```
background: linear-gradient(160deg, rgba(36,33,42,.92), rgba(18,16,22,.92));
border: var(--hairline);
border-radius: var(--radius);
box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,.08);
```

- **Panel title:** top-left, 22px in, Archivo 800 width 75 %, uppercase, `letter-spacing: .08em`, `--cream2`, 13–14px (`KERNEL · EIN ADRESSRAUM · RING 0`).
- **Edge variants:** `.red-edge`, `.blue-edge`, `.led-edge` set the border to the hue and add its neon. Use for the one panel that matters on screen.
- Panels do not nest more than once.

### 6.4 Terminal Window

- Panel with `--radius: 16px`, background `linear-gradient(180deg,#121014,#0c0b0e)`.
- 40px title bar: three 13px dots (red, mustard, LED), then a small title in `--cream2` (`~/api — node`).
- Body in VT323, `--fs-mono`, cream; output lines in `--led`; comments in `--cream2`; highlighted tokens in `--mustard`; errors in `--red`.
- Internal scanline overlay: `repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)`.
- Typing animation: characters appear at 35–60 chars/s, output lines appear at once.

### 6.5 Editorial Card

For articles, projects and features:
- No box by default. A 4:3 or 1:1 visual with the grain overlay, then the small line, a Instrument Serif title (`--fs-h3`) with one italic word, and 2–3 lines of `--fs-small` fine print.
- Hover: the visual gets a 6° rotational motion-blur flick (see §8.3), the title's italic word turns red.
- Optional variant **"paper card"**: cream background (`--cream`), ink text, `border-radius: 6px`, rotated `-2°…+2°`, `--shadow` — like a note pinned to the page. Use for quotes, file names, callouts.

### 6.6 LED Dot-Matrix Display

The signature machine detail. Text is rendered as a 5×7 dot grid, lit dots in the hue, unlit dots at 8 % opacity:

- Dot size: 6px (inline), 10–12px (section), 14–16px (hero). Dot pitch = `1.35 × dot`.
- Glow: `filter: drop-shadow(0 0 .5dot color) drop-shadow(0 0 1.5dot color/40%)`.
- Colours: `--led` (live), `--red` (fault/kernel), `--blue` (user), `--mustard` (numbers), `--cream` (neutral, e.g. `UEFI`).
- Reveal: characters light up left to right, 50–80 ms per character.
- Always add the plain text for assistive tech: `<svg role="img" aria-label="PID 1">`.

A tiny reference renderer is in §12.3.

### 6.7 HUD Corners

| Element | Spec |
|---|---|
| Section marker (top-left) | Archivo 800 width 75 %, uppercase, `letter-spacing: .14em`, 13–16px, cream: `I · ARCHITEKTUR` |
| VHS counter (top-right) | VT323 22–28px, cream: `PLAY ▶ 01:23` — shows scroll progress or reading time; blinks at 1 Hz (`steps(1)`), paused under reduced motion |
| Footnotes (bottom-left) | Numbered with a red Jacquard digit, Archivo 500 width 85 % 14px `--cream2`, inline code in VT323 cream |

### 6.8 Navigation

- Fixed top bar, transparent, no background until scroll; after scroll: `rgba(11,10,13,.72)` + `backdrop-filter: blur(12px)` + bottom hairline.
- Left: wordmark in Instrument Serif with an italic part. Right: links in Archivo 700 width 80 %, 15px, uppercase, `letter-spacing: .08em`.
- Active link: red underline 2px + red glow. Hover: underline grows from the left (`scaleX` 0 → 1, 250 ms).
- Mobile: full-screen ink overlay, links set as `--fs-h1` Instrument Serif, each with a Jacquard index number (`01`, `02`, …).

### 6.9 Forms

- Inputs: `background: var(--ink2)`, `border: var(--hairline)`, `border-radius: var(--radius-sm)`, `padding: 14px 16px`, Archivo 16px cream, placeholder `--cream2`.
- Label above in caps style (`--fs-caps`).
- Focus: border `--blue-bright` + `--neon-blue`. Error: border `--red` + `--neon-red`, message below in red Archivo 600. Success: LED dot + LED text.
- Checkboxes and radios are drawn as small LED dots: off = ink3 ring, on = LED fill with glow.

### 6.10 Captions / Marquee

- Word-by-word highlight strip for video, demos or quotes: Archivo 700 width 80 %, 24–42px, words at `--cream2` 55 % opacity, the active word full cream with a red glow `0 0 14px var(--red)`.
- A marquee variant runs a tracklist line (`… · SCHEDULER · SPEICHER · VFS · …`) across the section boundary at 40 px/s.

### 6.11 Data & Stats

- Big numbers in Jacquard 24 (digits are safe) with red or mustard neon, a caps label next to them (`30.000.000+  ZEILEN C`).
- Count up from 0 when the number enters the viewport (1–1.2 s, `power2.out`).
- Progress and load bars: 10px track in `--ink3`, fill in `--mustard` or `--led`, radius 5px.

---

## 7. Illustration System

Characters are part of the brand. They explain, react and point. They are always built from SVG so they stay crisp and can be animated.

### 7.1 The Ink Creature ("raccoon")

- **Look:** cream strokes on ink — a head outlined by ~60 short radial strokes, dense stroke masks around two ringed eyes (ink circle, cream ring, cream pupil), solid triangular ears, a small triangle nose, two scribbled paws resting on a horizontal line it peeks over.
- **Stroke:** 3.6px, round caps, passed through the `rough` filter (§12.2) for a hand-drawn wobble.
- **Role:** the wise guide / the system / the one in charge. It peeks over section dividers, sits in the corner of empty states, pops up for "behind the scenes" content.
- **Motion:** rises from behind its line with `back.out(1.6)`; pupils glance left/right; never walks around.

### 7.2 The Felt Critters

- **Look:** a bean-shaped head with a snout and one floppy ear, flat fill in `--blue`, `--mustard`, `--pink` or `--red`, fuzzy edges via the `fur` filter (§12.2), white speckles inside, eyes as pink rings with a moss pupil, moss nose, pink-red mouth line.
- **Role:** users, processes, items, "you". They queue, hop, wave, bounce off barriers, get dazed (eyes become pink ×) on errors.
- **Motion:** idle bob (6–10px, 1–1.4 s, `sine.inOut`), hops along arcs, squash on landing.

### 7.3 Hand-drawn Diagrams

- Arrows, rings, loops and brackets are SVG paths with `stroke-linecap: round`, 2.5–4px, `rough` filter, drawn on with `stroke-dashoffset` (0.4–0.9 s).
- Dashed arrows (`10 10`) mean "request / asks for"; solid arrows mean "does / calls".
- Diagrams stay in cream; only the one element that matters gets red, blue or LED.

### 7.4 Rules

- Maximum two characters per viewport, one of each family.
- Characters never carry text inside their body; labels sit under them in caps.
- Photography, if used, is grained, slightly desaturated, with spin blur or motion blur — never clean stock.

---

## 8. Motion System

### 8.1 Easing & Timing

| Name | Curve | Duration | Use |
|---|---|---|---|
| `slam` | `expo.out` from `scale 2.2, blur(20px), opacity 0` | 0.4 s | Headlines, key words, stamps |
| `rise` | `power3.out` from `y 40px, blur(10px), opacity 0` | 0.55 s | Body, panels, lists (stagger .06–.12 s) |
| `pop` | `back.out(2)` from `scale 0` | 0.5 s | Chips, badges, characters |
| `bounce-in` | `bounce.out` from `y -700px` | 0.45 s | Things dropping into place (cartridges, boxes) |
| `vanish` | `power2.in` to `scale .9, blur(10px), opacity 0` | 0.3 s | Exits |
| `draw` | `power2.inOut` on `stroke-dashoffset` | 0.4–0.9 s | Lines, arrows, rings |
| `type` | linear, 35–60 chars/s | — | Terminals |
| `led-reveal` | per character, 50–80 ms | — | LED displays |

CSS equivalents: `slam ≈ cubic-bezier(.16,1,.3,1)`, `rise ≈ cubic-bezier(.22,1,.36,1)`, `pop ≈ cubic-bezier(.34,1.56,.64,1)`.

### 8.2 Scroll Choreography

- Sections enter with the editorial order: small line (0 s) → headline slam (0.15 s) → rule draws (0.4 s) → fine print rises (0.5 s) → visual (0.7 s).
- Trigger at 20–30 % visibility (`IntersectionObserver` or GSAP ScrollTrigger). Animate once; do not replay on scroll-up.
- Big stats count up; diagrams draw themselves; terminals type when visible.

### 8.3 Spin-Blur Transition (signature)

Page and section changes use a rotational motion blur, like a flash photo taken while spinning:

- Outgoing: `rotate(-8deg) scale(1.28)`, `filter: blur(24px)`, `opacity 0` in 0.42 s (`power2.in`).
- Incoming: from `rotate(7deg) scale(.82) blur(22px)` to rest in 0.6 s (`expo.out`).
- Overlay: a 2600px conic gradient (red → transparent → blue → transparent → cream) with `blur(40px)` and `mix-blend-mode: screen` spins 280° while fading 0 → .55 → 0.
- Alternate the rotation direction between consecutive transitions.
- With the View Transitions API: apply the outgoing recipe to `::view-transition-old(root)` and the incoming one to `::view-transition-new(root)`.

### 8.4 Glitch & Impact

- **Tracking bars:** 4–6 horizontal cream/blue bars flicker across the screen for 0.35 s on errors, form failures or dramatic reveals.
- **Shake:** the page camera shakes 8–26px with falloff over 0.3–0.5 s on impacts. Use at most once per interaction.
- **Flash:** a cream `mix-blend-mode: screen` layer fades from .2–.5 to 0 over 0.45 s on big reveals.
- **CRT off:** for "power down" moments, two ink bars close from top and bottom, leaving a bright line that shrinks to a dot.

### 8.5 Reduced Motion

Under `@media (prefers-reduced-motion: reduce)`:
- All transitions become 150 ms opacity fades; no scale, rotation, blur or shake.
- Grain, streaks and the VHS counter stop animating (static texture remains).
- Typing and LED reveals show their final state immediately.
- Characters stay still (no idle bob).

---

## 9. Light Mode: "Paper"

The paper variant flips the page to the cream sheet of the ink-raccoon drawings and the mustard paper of the felt critters. Effects stay; colours adapt.

| Token | Paper value | Contrast on `#efe6d6` |
|---|---|---|
| `--bg` | `#efe6d6` (cream) | — |
| `--surface` | `#e4d9c5` | — |
| `--text` | `#0b0a0d` | 15.9 : 1 |
| `--text-muted` | `#5c5448` | 6.0 : 1 |
| `--red-text` | `#a82816` | 5.7 : 1 |
| `--blue-text` | `#2447c9` | 6.0 : 1 |
| `--mustard-text` | `#7a5a10` | 5.1 : 1 |
| `--moss` | `#1f3b2f` | 9.8 : 1 |

Rules:
- Ink creatures invert to **ink strokes on cream** (exactly the source drawing).
- Felt critters keep their colours; mustard sections (`#e8bf57` background, ink text 11.3 : 1) are allowed as full-bleed "poster" bands.
- Neon glows become **print glows**: same hue, outer bloom at 25 % opacity, no screen blending.
- Grain switches to `mix-blend-mode: multiply` at .10; scanlines drop to .04; the vignette uses `rgba(60,40,20,.25)`.
- Terminals and LED displays stay dark (ink panels on paper) — they are devices, not paper.

Toggle with `[data-theme="paper"]` on `<html>`; default follows `prefers-color-scheme`, dark wins when unset.

---

## 10. Responsive Behaviour

| Breakpoint | Changes |
|---|---|
| `< 640px` | Single column; hero headline `--fs-hero` still fills ~90 % width; two-column liner notes collapse to one; HUD corners reduce to section marker + counter; characters scale to 60 %; LED dot size ≤ 8px |
| `640–1023px` | 6-column grid; panels stack; tracklist lines wrap centred |
| `≥ 1024px` | 12-column grid; two-column liner notes; footnotes visible bottom-left |
| `≥ 1440px` | Max width reached; extra space goes to margins, not to larger text |

- Touch targets ≥ 44 × 44px; chips grow their padding on touch devices.
- Hover-only effects (italic word turns red, spin flick on cards) have a focus-visible equivalent and do nothing harmful on touch.

---

## 11. Accessibility

- All colour pairs in §2.3 and §9 are measured. Small blue text uses `--blue-bright` on dark and `--blue-text` on paper.
- Texture layers are `aria-hidden="true"` and `pointer-events: none`; their combined effect must not drop any text below AA — verify with the texture on.
- LED displays and hand-drawn diagrams get `role="img"` and an `aria-label` with the plain meaning.
- Critter reactions (dazed, bouncing off) never carry information alone; the state is also in text.
- Focus is always visible: 2px `--blue-bright` outline, 4px offset, plus glow.
- Semantic structure: one `h1` per page (the editorial headline), sections with `h2`, footnotes as a real `<aside>` or `<ol>`.

---

## 12. Implementation Reference

### 12.1 CSS Variables

```css
:root {
  /* Fonts */
  --display: "Instrument Serif", serif;
  --sans: "Archivo", sans-serif;
  --mono: "VT323", monospace;
  --pixel: "Jacquard 24", serif;

  /* Palette (dark, default) */
  --ink: #0b0a0d;  --ink2: #17151b;  --ink3: #24212a;
  --cream: #efe6d6; --cream2: #b8afa2;
  --red: #ec4a34;  --blue: #3f6dff;  --blue-bright: #6d8fff;
  --mustard: #e8bf57; --pink: #f4a7be; --led: #a8f34c; --moss: #1f3b2f;

  /* Semantic */
  --bg: var(--ink); --surface: var(--ink2); --text: var(--cream); --text-muted: var(--cream2);
  --action: var(--red); --info: var(--blue-bright); --live: var(--led);

  /* Glow & depth */
  --neon-red: 0 0 6px var(--red), 0 0 22px var(--red), 0 0 52px rgba(236, 74, 52, .45);
  --neon-blue: 0 0 6px var(--blue), 0 0 22px var(--blue), 0 0 52px rgba(63, 109, 255, .45);
  --neon-led: 0 0 5px var(--led), 0 0 16px rgba(168, 243, 76, .6);
  --chrome: linear-gradient(180deg, #fff 0%, #d9d4e6 38%, #6d6880 50%, #f0e9ff 58%, #9a93ad 80%, #fff 100%);
  --shadow: 0 18px 50px rgba(0, 0, 0, .6);

  /* Geometry */
  --radius: 22px; --radius-sm: 12px; --radius-pill: 999px;
  --hairline: 1.5px solid rgba(239, 230, 214, .18);
  --rule: 1.5px solid rgba(239, 230, 214, .5);

  /* Type scale */
  --fs-hero: clamp(3.5rem, 9vw, 11rem);
  --fs-h1: clamp(2.75rem, 6vw, 7rem);
  --fs-h2: clamp(2.25rem, 4.2vw, 4.5rem);
  --fs-h3: clamp(1.5rem, 2.4vw, 2.25rem);
  --fs-lead: clamp(1.125rem, 1.6vw, 1.375rem);
  --fs-body: 1rem; --fs-small: .875rem; --fs-caps: .8125rem; --fs-mono: 1.25rem;

  /* Motion */
  --ease-slam: cubic-bezier(.16, 1, .3, 1);
  --ease-rise: cubic-bezier(.22, 1, .36, 1);
  --ease-pop: cubic-bezier(.34, 1.56, .64, 1);
}

[data-theme="paper"] {
  --bg: #efe6d6; --surface: #e4d9c5; --text: #0b0a0d; --text-muted: #5c5448;
  --action: #a82816; --info: #2447c9; --live: #1f3b2f;
  --neon-red: 0 0 6px rgba(236, 74, 52, .5), 0 0 22px rgba(236, 74, 52, .25);
  --neon-blue: 0 0 6px rgba(63, 109, 255, .5), 0 0 22px rgba(63, 109, 255, .25);
  --shadow: 0 14px 40px rgba(60, 40, 20, .22);
  --hairline: 1.5px solid rgba(11, 10, 13, .2);
  --rule: 1.5px solid rgba(11, 10, 13, .6);
}

body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: var(--fs-body); line-height: 1.6; font-stretch: 95%; }
.display { font-family: var(--display); font-weight: 400; line-height: .95; letter-spacing: -.015em; }
.display i, .display em { font-style: italic; }
.caps { font-family: var(--sans); font-weight: 800; font-stretch: 75%; text-transform: uppercase; letter-spacing: .12em; font-size: var(--fs-caps); }
```

### 12.2 SVG Filters (put once in the page)

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <!-- Felt fur: fuzzy edges + light speckles -->
  <filter id="fur" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G" result="fuzzy"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.7" numOctaves="1" seed="9" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.4 1.4" result="speck"/>
    <feComposite in="speck" in2="fuzzy" operator="in" result="speckIn"/>
    <feComposite in="speckIn" in2="fuzzy" operator="arithmetic" k1="0" k2="0.22" k3="1" k4="0"/>
  </filter>
  <!-- Hand-drawn wobble for ink strokes, arrows, rings -->
  <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="11" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- VHS streaks: use on a full-width rect, then drift it horizontally -->
  <filter id="vhs" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0015 0.045" numOctaves="3" seed="4"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.94  0 0 0 0 0.9  0 0 0 0 0.84  0 0 0 6 -3.2"/>
  </filter>
</svg>
```

### 12.3 Grain and LED (vanilla JS)

```js
// Film grain: one 256px noise tile, moved in steps so it flickers like film.
function mountGrain(layer) {
  const canvas = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
  const context = canvas.getContext("2d");
  const image = context.createImageData(256, 256);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.random() * 255;
    image.data.set([value, value, value, 255], i);
  }
  context.putImageData(image, 0, 0);
  layer.style.backgroundImage = `url(${canvas.toDataURL()})`;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let frame = 0;
  setInterval(() => { frame += 1; layer.style.backgroundPosition = `${frame * 137}px ${frame * 91}px`; }, 83);
}

// LED dot-matrix: 5x7 glyphs, lit dots in colour, unlit at 8 %.
const LED_FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"], B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"], D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"], H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"], J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"], L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"], R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"], T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"], X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "10001", "01010", "00100", "00100", "00100"], Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"], ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"], "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"], "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"], _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"], ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
};
function led(text, { dot = 10, color = "var(--led)" } = {}) {
  const pitch = dot * 1.35;
  const chars = text.toUpperCase().split("");
  const circles = chars.flatMap((ch, index) => (LED_FONT[ch] ?? LED_FONT[" "]).flatMap((row, y) =>
    [...row].map((bit, x) => `<circle cx="${index * 6 * pitch + x * pitch + pitch / 2}" cy="${y * pitch + pitch / 2}" r="${dot / 2}" fill="${color}" opacity="${bit === "1" ? 1 : 0.08}"/>`)));
  const width = chars.length * 6 * pitch, height = 7 * pitch;
  return `<svg role="img" aria-label="${text}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
    style="filter:drop-shadow(0 0 ${dot / 2}px ${color})">${circles.join("")}</svg>`;
}
```

The glyph table covers digits, A–Z and `. : - + # / _ ! >`; add glyphs in the same 5×7 format as needed.

### 12.4 Building a New Page

1. Start from the texture stack (§5) and the HUD corners (§6.7).
2. Open with the editorial headline pattern (§3.2) — one italic word, ending with a period.
3. Put one visual under it: a character, an LED readout, a terminal or a hand-drawn diagram.
4. Spend neon on exactly one element per viewport.
5. Add footnotes for precise details instead of cluttering the main copy.
6. Choreograph the entrance (§8.2) and wire the spin-blur transition (§8.3) between pages.
7. Test in dark and paper mode, with texture on, and with reduced motion.

---

## 13. Do / Don't

| Do | Don't |
|---|---|
| One huge Instrument Serif headline with an italic word | Bold serif headlines or all-caps serif |
| Ink and cream for most of the page | Colourful backgrounds or gradient cards |
| Neon on the one element that is active, live or wrong | Glow on every card "because it looks cool" |
| Red = action/kernel/danger, blue = user/info/focus | Swapping colour meaning between pages |
| Grain, scanlines and vignette on every page | "Clean" pages without texture |
| Jacquard for digits and ornaments | Jacquard for words or Roman numerals (`I` looks like `J`) |
| VT323 for terminals, counters, code | VT323 for body copy |
| `--blue-bright` for small blue text | `--blue` below 24px on dark |
| Ink text on red and LED fills | Cream text on red or blue fills |
| Scratchy ink creature as guide, felt critters as users | Stock illustrations, emoji or 3D blobs |
| Hand-drawn arrows with the `rough` filter | Perfect geometric connector lines |
| Slam, rise, pop and spin-blur with real easing | Linear 200 ms fades everywhere |
| Footnotes for technical detail | Long parentheses in the main copy |
| Texture and motion off-switch for reduced motion | Autoplaying shake, flicker or blinking without a reduced-motion fallback |
