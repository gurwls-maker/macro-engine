---
name: Organic Wellness
colors:
  surface: '#f7fbf1'
  surface-dim: '#d7dbd2'
  surface-bright: '#f7fbf1'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f5eb'
  surface-container: '#ebefe5'
  surface-container-high: '#e5eae0'
  surface-container-highest: '#e0e4da'
  on-surface: '#181d17'
  on-surface-variant: '#40493f'
  inverse-surface: '#2d322b'
  inverse-on-surface: '#eef2e8'
  outline: '#707a6e'
  outline-variant: '#bfc9bc'
  surface-tint: '#186d32'
  primary: '#005522'
  on-primary: '#ffffff'
  primary-container: '#1b6f34'
  on-primary-container: '#9cefa6'
  inverse-primary: '#87d991'
  secondary: '#596155'
  on-secondary: '#ffffff'
  secondary-container: '#dae2d3'
  on-secondary-container: '#5d6559'
  tertiary: '#7f2b41'
  on-tertiary: '#ffffff'
  tertiary-container: '#9d4258'
  on-tertiary-container: '#ffd0d7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a2f6ab'
  primary-fixed-dim: '#87d991'
  on-primary-fixed: '#002109'
  on-primary-fixed-variant: '#005320'
  secondary-fixed: '#dde5d6'
  secondary-fixed-dim: '#c1c9ba'
  on-secondary-fixed: '#161d14'
  on-secondary-fixed-variant: '#41493e'
  tertiary-fixed: '#ffd9de'
  tertiary-fixed-dim: '#ffb2bf'
  on-tertiary-fixed: '#3f0016'
  on-tertiary-fixed-variant: '#7c293f'
  background: '#f7fbf1'
  on-background: '#181d17'
  surface-variant: '#e0e4da'
  deep-forest: '#172117'
  leaf-green: '#4A8C5E'
  amber-goal: '#FFB100'
  coral-alert: '#FF6B6B'
  ivory-base: '#F7FBF1'
  white-pure: '#FFFFFF'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  data-num:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 30px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 20px
  gutter: 12px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  edge-radius: 16px
---

## Brand & Style

The design system is built on a foundation of **Modern Minimalism** infused with **Organic Professionalism**. It targets health-conscious individuals who require a data-dense tool that remains calming and non-intimidating. The brand personality is that of a "Wise Coach"—knowledgeable, steady, and encouraging.

The visual direction replaces the clinical feel of traditional health apps with a warm, editorial aesthetic. It utilizes a soft Ivory base to reduce eye strain and Deep Green accents to symbolize growth and nutritional balance. Key characteristics include:
- **Hairline Precision:** Using thin 1px lines for borders and separators to maintain a lightweight feel.
- **Airy Composition:** Prioritizing generous white space (negative space) between functional groups to prevent information overload.
- **Subtle Depth:** Utilizing very soft, high-diffusion shadows to suggest layering without physical heaviness.

## Colors

The palette is anchored by **Ivory (#F7FBF1)** as the primary canvas, creating a warmer, more natural feel than pure white. 

- **Primary (Deep Green):** Used for primary actions, active navigation states, and key headings. It represents authority and health.
- **Secondary (Leaf Green/Muted Green):** Used for secondary UI elements, progress bars, and success states.
- **Accent (Amber):** Specifically reserved for achievement metrics, calorie counts, and goal-attainment indicators.
- **Semantic (Coral):** Reserved strictly for warnings, "below target" states, or deletion actions.
- **Neutrals:** We use a dark forest green (#172117) for typography instead of black to maintain the organic theme.

## Typography

The design system exclusively uses **Manrope** for its modern, geometric-humanist qualities which excel in legibility for both data points and long-form coach messages.

- **Data Hierarchy:** Quantitative values (calories, grams) should use the `data-num` style with tighter tracking to emphasize the numbers.
- **Coach Messaging:** Status messages use `body-lg` with increased line height to appear approachable and readable.
- **Labels:** Use uppercase or semi-bold `label-sm` for secondary metadata like "Goal" or "Remaining" to distinguish them clearly from the actual data.

## Layout & Spacing

Designed for a **390px width mobile standard**, the system employs a **12-column fluid grid** with a fixed **20px side margin** to ensure content never feels cramped against the bezel.

- **Vertical Rhythm:** A base-8 scale is used for vertical spacing. Elements within a card use `stack-sm`, while the gap between separate cards uses `stack-md`.
- **Card Padding:** Standard container padding is set to **16px** to provide enough breathing room for complex data charts.
- **Bottom Bar:** The 5-tab navigation bar is 64px high with icons centered to provide a large tap target for thumb-driven navigation.

## Elevation & Depth

This system avoids heavy shadows and skeuomorphism. Depth is achieved through **Tonal Layering**:

- **Level 0 (Background):** Ivory (#F7FBF1).
- **Level 1 (Cards/Containers):** White (#FFFFFF) with a 1px border of #D7DFD0.
- **Level 2 (Modals/Bottom Sheets):** White (#FFFFFF) with a soft blur shadow (0px 8px 24px rgba(27, 111, 52, 0.08)).
- **Level 3 (Primary Buttons):** Deep Green surface with no shadow, relying on color contrast for prominence.

Interactions should feel tactile but flat—when a button is pressed, it should slightly dim in opacity rather than "sink" into the background.

## Shapes

The shape language is **Soft-Rounded**, echoing organic forms while maintaining a professional structure.

- **Primary Containers:** 16px (rounded-lg) for main cards and bottom sheets.
- **Interactive Elements:** 12px for input fields and 100px (pill) for status chips.
- **Action Buttons:** Large primary buttons use a slightly higher roundedness (12px) to feel friendly and inviting.
- **Icons:** Use "Linear" or "Broken line" icon styles with a 2px stroke weight to match the refined typography.

## Components

### Buttons
- **Primary:** Full-width Deep Green background, White Manrope SemiBold text. 56px height for main actions.
- **Secondary:** Ivory background with 1px Leaf Green border.
- **Ghost:** No background, Deep Green text, used for "Cancel" or secondary navigation within headers.

### Cards
- **Coach Card:** Uses a Leaf Green tint background (#EBF2ED) to distinguish advice from raw data entries.
- **Data Card:** Pure white background, 1px border. Title on top-left, secondary action (e.g., "Edit") on top-right as a small text button.

### Input Fields
- **Numeric Entry:** Large 24px font size for the value. Units (g, kcal) placed as a trailing suffix in a muted color.
- **Dropdowns/Pickers:** Indicated by a thin 1px chevron. Selection area must be at least 48px high.

### Data Visualization
- **Progress Bars:** Thin (6px height) tracks. The background track is light grey, and the active fill uses Green (on track) or Amber (goal met).
- **Weight Trends:** Simple line charts with circular data points. Use Coral for weight gain and Leaf Green for weight loss markers.

### Bottom Sheet
- Handle bar at the top (40px wide, 4px thick, muted grey).
- Content slides in from the bottom covering max 90% of the screen height, with a 40% opacity black backdrop.