# Design System: Championship Print

This document defines the visual theme, design tokens, and CSS conventions for the FC Sim application, based on the Championship Print aesthetic.

## 1. Visual Theme and Atmosphere
The Championship Print theme evokes the feeling of premium digital sports journalism: bold, high-contrast, structured, and active. It combines high typography density, bold condensed headings, clean horizontal line layout separators, and vivid athletic colors to make the league's stats and match stories feel immediate and engaging.

## 2. Color Palette and Roles
The color system utilizes perceptually uniform OKLCH values. All neutral colors are subtly tinted with a touch of blue-slate hue to maintain visual coherence.

| Color Token | Value | Hex Equivalent | Functional Role |
| :--- | :--- | :--- | :--- |
| `color-canvas` | `oklch(0.14 0.02 240)` | `#0f121d` | Root application background |
| `color-panel` | `oklch(0.18 0.02 240)` | `#151b2a` | Sidebar background, secondary surface panels |
| `color-border` | `oklch(0.26 0.03 240)` | `#232a3d` | Default borders, table cell horizontal gridlines |
| `color-border-hover` | `oklch(0.32 0.04 240)` | `#303951` | Focused or hovered border states |
| `color-text-primary` | `oklch(0.98 0.01 240)` | `#f8f9fa` | Main titles, table headers, primary text |
| `color-text-secondary` | `oklch(0.75 0.01 240)` | `#bbc2cf` | Roster stats, list details, secondary labels |
| `color-text-muted` | `oklch(0.55 0.02 240)` | `#828b9d` | Captions, settings notes, column subheadings |
| `color-accent` | `oklch(0.75 0.16 145)` | `#00c07f` | Sporting emerald: active indicators, highlights, win states |
| `color-warning` | `oklch(0.80 0.12 70)` | `#e2a445` | Amber-yellow: pending actions, draw states, winter transfers |
| `color-danger` | `oklch(0.65 0.18 25)` | `#e84f5c` | Red: loss states, destructive actions, summer transfers |

## 3. Typography Rules
Display typography uses condensed, heavy sans-serif fonts to mimic classic athletic magazine headings. UI copy uses a legible geometric sans-serif, and tabular numbers are strictly enforced for statistical alignment.

* **Primary Display/Headings**: Archivo Narrow (Google Fonts), fallback to Arial Narrow, sans-serif. Letter-spacing is set to `-0.01em` on large titles.
* **Primary UI/Body**: Rubik (Google Fonts), fallback to system-ui, -apple-system, sans-serif.
* **Numbers**: Rubik with tabular spacing enabled (`font-variant-numeric: tabular-nums`) on all data tables, standings, ratings, and stats columns.
* **Heading Tag Formatting**: Always write `<h1>` tags inline on a single line (e.g. `<h1>Title</h1>`) rather than splitting text across multiple lines. This prevents compiler and browser layout engines from rendering extra vertical spacing or whitespace height shifts from leading/trailing newlines.

| Hierarchy | Font Size | Font Weight | Line Height | Letter Spacing | Example Use |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title (h1)** | `32px` (2rem) | `800` (Extra Bold) | `1.1` | `-0.02em` | Main page titles, match result highlights |
| **Section Title (h2)** | `20px` (1.25rem) | `700` (Bold) | `1.2` | `-0.01em` | Sidebar category headers, card group titles |
| **Subsection Header (h3)** | `14px` (0.875rem) | `600` (Semi Bold) | `1.4` | `0.02em` | Form labels, table subheaders |
| **Body Text** | `13px` (0.8125rem) | `400` (Regular) | `1.6` | `0` | Team reports, news items, details |
| **Table Header** | `11px` (0.6875rem) | `700` (Bold) | `1.4` | `0.08em` | Standings headers, stats headers |

## 4. Component Stylings
All active UI elements must speak the same visual language.

### Buttons
* **Primary**: Background `color-accent`, text `color-canvas` (dark), weight `600`, radius `6px`. Hover: `oklch(0.80 0.18 145)`. Active: `scale(0.96)`.
* **Secondary**: Background `transparent`, border 1px `color-border`, text `color-text-primary`. Hover: background `color-panel`, border `color-border-hover`. Active: `scale(0.96)`.
* **Destructive**: Background `transparent`, border 1px `color-danger`, text `color-danger`. Hover: background `oklch(0.20 0.05 25)`, border `color-danger`. Active: `scale(0.96)`.

### Navigation (Sidebar)
* Navigation items are stacked vertically and styled via the global `@utility nav-link` class.
* **Active State**: Active links are decorated with the `.active-nav` class, setting background to `color-canvas`, text to bold `color-text-primary`, and scaling up the left vertical indicator bar.
* **Hover State**: Highlights the link with a subtle transparent canvas overlay and slides in the left vertical indicator.
* **Scale on press**: Shrinks the link item (`scale(0.98)`) on active mouse press.

### Cards & Tables
* Cards are border-only (no heavy drop shadows). Border radius is consistently `8px`.
* Tables have no vertical borders: only horizontal separators of `1px solid color-border`.
* Table rows highlight on hover using `background-color: color-panel`.
* **User Highlights**: To highlight the user's team or players, rows are decorated with `row-user-highlight` (a transparent `8%` emerald tint background) and the first cell is styled with `cell-user-highlight` (adding a solid `4px` left accent border and adjusting padding to keep column alignment aligned).

## 5. Layout Principles
* **Spacing Scale**: Increments of `4px` (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`).
* **Section Padding**: Standard desktop page content padding is `48px`. Outer container padding matches inner element gaps for consistent vertical flow.
* **Max Text Width**: Informational paragraphs and news body elements are constrained to a maximum width of `65ch` (characters) to ensure readable line lengths.
* **Page Header & Navigation Decoupling**:
  - All page headers must remain structurally uniform (using a standard bottom border and spacing).
  - Do not embed local navigation buttons/breadcrumbs (e.g., "Back to Profile") inside the page title header container.
  - Relocate any essential breadcrumbs/back links completely above the header container so the bottom border baseline aligns perfectly when navigating between screens.
  - Rely on global sidebar navigation and the browser back button instead of adding redundant local navigation links inside page headers.

## 6. Depth and Elevation
* Since the canvas is dark, depth is communicated through background luminance stepping instead of traditional shadows.
* **Canvas level 0**: `#0f121d` (root canvas).
* **Surface level 1 (Panels, Cards, Sidebar)**: `#151b2a` (lightness step up of approximately 4%).
* **Borders**: `rgba(255, 255, 255, 0.06)` for subtle separators, `rgba(255, 255, 255, 0.10)` for active borders.

## 7. Do's and Don'ts
* **DO** use `font-variant-numeric: tabular-nums` for all stats, attribute sheets, and values.
* **DO** keep sections cardless by default, using horizontal dividers to separate layouts.
* **DO** wrap hover styling in hover media guards (`@media(hover:hover)`) to prevent sticky touch states on mobile.
* **DON'T** use purple or blue-to-pink decorative gradients.
* **DON'T** use `transition: all`. Always specify properties (e.g. `transition-property: transform, opacity`).
* **DON'T** mix rounded corners: button corners are `6px`, card corners are `8px`, form badges are square.
* **DO** verify input type parameters for components (e.g., `app-team-badge` accepts only `'sm'` or `'md'` sizes; passing `'lg'` will break the build).

## 8. Responsive Behavior
* **Breakpoints**: Mobile (<768px), Tablet (768px to 1024px), Desktop (>1024px).
* **Navigation**: Collapses into a toggleable hamburger menu on viewports smaller than 1024px.
* **Touch Targets**: All buttons, links, and list rows maintain a minimum height/width of `40px` to prevent misclicks on touch screens.

## 9. Agent Prompt Guide
Use these quick snippets to generate new UI components matching this design system:

* **Table Row Prompt**: "Create a table row on `{color-panel}` background with `border-bottom: 1px solid {color-border}`, text elements styled in `{color-text-secondary}`, numeric columns using tabular numbers with weight 600, and a hover selector shifting background to `color-canvas`."
* **Header Prompt**: "Create a section header with headline in condensed Archivo font, size 20px, weight 700, color `{color-text-primary}`, uppercase tracking-tight, with a bottom divider line in `{color-border}`."
* **Button Prompt**: "Create a primary button using `{color-accent}` background, dark text `{color-canvas}`, semi-bold weight, border-radius 6px, transitioning scale on click with duration 150ms."
