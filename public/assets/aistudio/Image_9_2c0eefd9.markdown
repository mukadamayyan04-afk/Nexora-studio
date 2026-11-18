---
name: Synthetic Hyper-Engine
colors:
  surface: '#131318'
  surface-dim: '#131318'
  surface-bright: '#39383e'
  surface-container-lowest: '#0e0e13'
  surface-container-low: '#1b1b20'
  surface-container: '#1f1f25'
  surface-container-high: '#2a292f'
  surface-container-highest: '#35343a'
  on-surface: '#e4e1e9'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e4e1e9'
  inverse-on-surface: '#303036'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#4d8eff'
  on-tertiary-container: '#00285d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#131318'
  on-background: '#e4e1e9'
  surface-variant: '#35343a'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
  code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system expresses high-octane engineering intelligence and creative omnipotence for world-class technical creators, AI architects, and modern game developers. It merges the surgical density and ergonomic precision of next-generation developer tooling (Linear, Cursor) with the spatial, immersive atmosphere of real-time 3D creation suites (Unreal Engine).

### Visual Aesthetic & Atmosphere
The design language is **Deep Glassmorphism & Cyber-Precision**. It deliberately rejects flat, generic corporate dashboards in favor of high-contrast volumetric depth. Dark, near-void obsidian layers create the canvas, illuminated by targeted spectral backlights (electric violet and kinetic cyan). The interface evokes a high-performance HUD cockpit:
- **Translucent Obsidian Slabs:** Surfaces appear as ultra-thin sheets of darkened aerospace glass suspended over infinite computational space.
- **Directional Chromatic Edge Lit:** Borders are never static flat gray lines; they act as optical conduits that capture ambient purple and cyan radiance.
- **Surgical Density:** Compact layouts, sub-pixel rendering clarity, and precise monoline iconography communicate relentless speed and zero friction.
- **Atmospheric Focus:** Glows are never decorative clutter; they indicate active compilation states, generative pipelines, node connections, and live focus targets.

## Colors

The palette is engineered around dark-field luminescence. Surfaces build upward from pitch black into subtle tinted dark neutrals, punctuated by energetic violet and cyan accents.

### Palette Architecture
- **Primary (`#8b5cf6` - Electric Violet):** Represents synthesis, AI orchestration, and core platform commands. Carries a high-intensity variant (`#a855f7`) for hover states and active focus rings.
- **Secondary (`#06b6d4` - Kinetic Cyan):** Highlights real-time computation, node execution, runtime health, and interactive data telemetry.
- **Tertiary (`#3b82f6` - Hyper Blue):** Bridges violet and cyan in dynamic gradients; acts as an informative link and state anchor for standard selections.
- **Base Canvas (`#0a0a0f`):** The foundational infinite space. All window panels and tool docks contrast subtly against this vacuum level.

### Surface Tiers & Translucency
- **Surface Canvas:** `#0a0a0f` (solid)
- **Surface Layer 1 (Dock / Base Panels):** `rgba(13, 13, 22, 0.75)` with `backdrop-filter: blur(24px)`
- **Surface Layer 2 (Cards / Nodes / Toolbars):** `rgba(20, 20, 35, 0.65)` with `backdrop-filter: blur(16px)`
- **Surface Layer 3 (Overlays / Modals / Popovers):** `rgba(28, 28, 48, 0.85)` with `backdrop-filter: blur(32px)`

### Functional Borders & Glows
- **Passive Border:** `rgba(255, 255, 255, 0.08)`
- **Interactive Border:** `linear-gradient(135deg, rgba(139, 92, 246, 0.45) 0%, rgba(6, 182, 212, 0.3) 100%)`
- **Active / Focused Node Glow:** `0 0 20px -3px rgba(139, 92, 246, 0.4), 0 0 8px rgba(6, 182, 212, 0.3)`

## Typography

The typographic hierarchy balances structural technical geometry with human-centric readability. 

### Typographic Roles
- **Headlines & Metric Headers (Space Grotesk):** Provides a tech-forward, engineering identity with distinct geometric apexes and tight letterforms. Always set with negative tracking to convey momentum.
- **Body & Interactive Content (Plus Jakarta Sans):** Selected for its clear tall x-height, neutral open counters, and supreme legibility across dense dashboard tools, node property panes, and complex configuration trees.
- **Labels, Telemetry, and Metatags (Space Grotesk):** Capitalized or tracking-boosted tokens used for status pills, runtime values, and view mode indicators.
- **Code & Console Streams (JetBrains Mono):** Reserved for algorithmic scripts, generative node expressions, compile logs, and API payload definitions.

## Layout & Spacing

The layout is built around a split IDE/Workbench philosophy combining flexible viewport canvas areas with modular docking panels.

### Grid & Panel Architecture
- **Desktop (>= 1200px):** Studio Viewport. Utilizes a responsive docking column framework: fixed-collapsible primary sidebar (260px), central fluid infinite viewport or editor pane, and a contextual multi-tab property/node inspector (320px to 420px). Gutters set to `1.5rem` between split views.
- **Tablet (768px - 1199px):** Overlay Workstation. Central canvas stays primary; utility panels collapse into sliding bottom sheets and off-canvas slide-overs. Margins standard at `1.25rem`.
- **Mobile (< 768px):** Single-pane stream with sticky bottom control decks and sheet-driven contextual inspectors. Margins standard at `1rem`.

### Spacing Cadence
A strictly enforced 4px base rhythm dictates internal padding:
- `space-xs` (4px): Dense chip spacing, icon-to-label inline gaps.
- `space-sm` (8px): Form input inner vertical padding, button grouping, node connection pads.
- `space-md` (16px): Card internal padding, toolbar module separation.
- `space-lg` (24px): Panel headers, modal interior guttering.
- `space-xl` (40px): Section divides, welcome wizard onboarding stages.

## Elevation & Depth

Visual hierarchy does not use soft gray dropshadows; it relies on **Luminescent Glass Layering** and **Edge Refraction**.

### Depth Layers
1. **Level 0 (Infinite Void - Canvas):** `#0a0a0f`. Unlit background where node graphs, 3D scenes, and game canvases execute.
2. **Level 1 (Dock & Sidebars):** Translucent backdrop (`rgba(13, 13, 22, 0.7)`) with a 1px solid border of `rgba(255, 255, 255, 0.05)`.
3. **Level 2 (Cards, Floating Toolbars, Nodes):** Elevated glass (`rgba(20, 20, 35, 0.65)`), blurred at `16px`, bordered with subtle directional white-to-violet linear gradients. Shadow is a dark diffuse field: `0 8px 32px 0 rgba(0, 0, 0, 0.6)`.
4. **Level 3 (Modals, Overlays, Active HUD Prompts):** Highest frosted glass (`rgba(28, 28, 48, 0.85)`), blur `32px`. Edge glow is powered by an outer pseudo-ring: `0 0 0 1px rgba(139, 92, 246, 0.3), 0 16px 48px -8px rgba(0, 0, 0, 0.8)`.

### Ambient Glows & Focus Radiance
When interactive elements are focused or processing:
- **Violet Glow (Synthetic Processing):** `box-shadow: 0 0 24px -2px rgba(139, 92, 246, 0.35)`
- **Cyan Glow (Live / Connected / Compiling):** `box-shadow: 0 0 24px -2px rgba(6, 182, 212, 0.35)`
- **Spectral Edge Highlight:** Subtly illuminated top border lines using `linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent)`.

## Shapes

The design uses a refined, engineered radius (`roundedness: 2`), achieving a clean balance between modern software ergonomics and technical precision.

### Geometric Discipline
- **Interactive Controls (Inputs, Buttons, Dropdowns):** `rounded-md` (0.5rem / 8px). Creates a cohesive, compact interactive fingerprint.
- **Containers, Nodes, Cards:** `rounded-lg` (1rem / 16px). Softens larger surface boundaries without feeling playful or bulbous.
- **Large Studio Panels, Drawers, Modals:** `rounded-xl` (1.5rem / 24px).
- **Data Chips, Status Pills, Execution Badges:** Fully circular / pill capsules (`9999px`) to immediately distinguish contextual metadata from clickable rectangular tooling.

## Components

### Buttons
- **Primary (Synthetic Core):** Rich electric violet gradient (`linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)`), white text, micro-inset top shadow (`inset 0 1px 0 rgba(255, 255, 255, 0.25)`). Hover triggers an expanded violet aura.
- **Secondary (Kinetic Glass):** Translucent backdrop (`rgba(255, 255, 255, 0.05)`), border `1px solid rgba(255, 255, 255, 0.12)`. Hover shifts border to `rgba(6, 182, 212, 0.6)` with text adopting kinetic cyan accentuation.
- **Studio Action (Ghost/Icon):** Transparent base, active state lights up with a subtle cyan dot indicator and `rgba(139, 92, 246, 0.15)` surface tint.

### Input Fields & Command Bars
- **Surface:** `rgba(10, 10, 15, 0.8)` inset into the glass container with a `1px solid rgba(255, 255, 255, 0.08)` border.
- **Typography:** `JetBrains Mono` for inputs requiring prompt logic, variables, or code; `Plus Jakarta Sans` for general titles.
- **Active State:** Border transitions into an illuminated gradient running from `#8b5cf6` to `#06b6d4`, accompanied by an inner cyan glow (`0 0 12px rgba(6, 182, 212, 0.15)`).

### High-Contrast Data Chips & Badges
- **Build / Runtime Status Chips:** Pill-shaped, black glass fill (`rgba(0, 0, 0, 0.6)`), 1px solid border tinted to match semantic context.
- **Active AI Agent Chip:** Violet border (`rgba(139, 92, 246, 0.5)`), glowing pulse ring, label in Space Grotesk.
- **Engine FPS / Telemetry Chip:** Cyan border (`rgba(6, 182, 212, 0.5)`), monospace data values.

### Cards & Studio Graph Nodes
- **Node Cards:** Built using Frosted Glass Layer 2. Features an internal header dividing line (`1px solid rgba(255, 255, 255, 0.06)`). Ports (inputs/outputs) stick to edges as glowing, self-illuminated socket dots (Cyan = Stream, Violet = Transform).
- **Asset / Generation Preview Cards:** Aspect-ratio locked, subtle hover zoom, glass footer dock featuring action shortcuts and AI synthesis fidelity tags.

### Checkboxes, Radio Buttons, Switches
- **Checkboxes:** Square with `rounded: 4px`, base background `rgba(255, 255, 255, 0.05)`. Active state fills with `#8b5cf6` and a crisp white SVG check icon.
- **Switches:** Pill container with recessed deep black cavity (`#07070a`). Thumb is a crisp white sphere that blooms into glowing cyan (`#06b6d4`) when toggled on.

### Specialized Studio Components
- **Prompt-to-Engine Command Deck:** A floating dock positioned centrally at the canvas bottom. Glassmorphic frosted obsidian container housing model selectors, token counters, dynamic voice/text inputs, and immediate generate action buttons.
- **Live Pipeline Breadcrumbs:** Connected nodes with gradient thread-lines indicating AI pipeline compilation flow across the canvas.