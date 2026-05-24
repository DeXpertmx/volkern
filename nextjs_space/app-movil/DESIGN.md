---
name: Industrial Intelligence
colors:
  surface: '#FFFFFF'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#434655'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#3e3fcc'
  on-tertiary: '#ffffff'
  tertiary-container: '#585be6'
  on-tertiary-container: '#f1eeff'
  error: '#EF4444'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#F9FAFB'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
  warning: '#F59E0B'
  chat-bot-bubble: '#F3F4F6'
  text-primary: '#111827'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  kpi-gap: 12px
---

## Brand & Style

The design system embodies a **Modern Industrial** aesthetic, blending the reliability of an Enterprise Resource Planning (ERP) tool with the cutting-edge capabilities of a "Thin Client" AI. The brand personality is professional, technical, and intelligent, designed to evoke a sense of precision and effortless efficiency.

The design style is **Corporate / Modern**, utilizing high-quality typography and a structured grid to manage complex data. It incorporates subtle **Glassmorphism** for AI-driven overlays and **Tonal Layering** to distinguish between the core CRM functions and the Gemma AI conversational layer. The interface is purposefully minimal—"Invisible UI"—prioritizing content and actionable insights over decorative elements.

## Colors

The palette is anchored by a deep **Primary Blue (#2563EB)**, signifying trust and action. The **Secondary Emerald (#10B981)** is reserved for success states and growth indicators, such as new leads or online status. 

The system defaults to **Light Mode**, utilizing a very light gray background (`#F9FAFB`) to reduce eye strain in industrial environments while keeping the interface feeling fresh. **Named Colors** are utilized for semantic feedback: Warning Amber for system alerts and Error Red for critical failures or deletions. The AI interface is distinguished by a neutral Bot Bubble color to separate machine-generated content from user actions.

## Typography

This design system uses **Inter** exclusively to ensure maximum legibility and a clean, systematic feel. The typographic scale is optimized for dense information display.

- **Headlines:** Used for screen titles and card headers. Bold weights provide immediate hierarchy.
- **Body:** The 15px body size is the workhorse for chat messages and form inputs, balanced with a 1.5 line-height for comfort.
- **Labels:** Small, medium-weight caps are used for timestamps, metadata, and bottom navigation labels to ensure they remain legible even at small scales.

## Layout & Spacing

The layout follows a **Fluid Grid** model centered on an 8px rhythmic system (4px base unit). 

- **Mobile:** Uses a single-column flow for lists and chat, transitioning to a 2-column grid for **KPI Cards** to maximize vertical real estate. Standard side margins are 16px.
- **Tablet/Desktop:** Content is capped at a maximum width with margins expanding to 24px. The grid expands to a 3 or 4-column layout for module hubs.
- **Vertical Spacing:** Elements are grouped using tight 8px or 12px gaps, while major sections are separated by 24px to maintain a clean, industrial structure.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and **Ambient Shadows**. 

1.  **Level 0 (Background):** The `#F9FAFB` base layer.
2.  **Level 1 (Cards/Surfaces):** White surfaces (`#FFFFFF`) featuring a very soft, diffused shadow (0px 4px 12px, 5% opacity black) to lift them slightly from the background.
3.  **Level 2 (Modals/AI Overlays):** Elements that require immediate focus use a subtle backdrop blur (glassmorphism) and a more pronounced shadow to indicate they are at the top of the stack.
4.  **Interaction:** Buttons use a subtle inner-glow or shadow on press to provide tactile feedback without appearing skeuomorphic.

## Shapes

The shape language is defined by "Soft Square" geometry, striking a balance between industrial rigidity and modern software friendliness.

- **Primary Radius:** 12px for cards, buttons, and input fields.
- **Chat Bubbles:** These use a specialized 16px radius. To provide directional cues, the "tail" corner (bottom-right for user, bottom-left for AI) is reduced to 4px.
- **Navigation/Pills:** Search bars and status chips use a full pill-shape (24px+) to distinguish them from actionable containers.
- **Avatars:** Strictly circular to contrast against the geometric grid.

## Components

### Buttons
Primary actions use the Blue-600 background with white text and a 12px radius. Secondary actions use a subtle Gray-200 border with Blue-600 text. Buttons must have a minimum height of 48px for touch targets.

### KPI Cards
Cards are displayed in a 2-column grid. They feature a 12px radius, white surface, and a top-aligned secondary label above a bolded "Headline-MD" value. A small trend indicator (using Accent or Error colors) is placed in the bottom right.

### Chat Bubbles
- **User Bubbles:** Primary Blue background, white text, 16px radius with a 4px bottom-right corner.
- **Gemma AI Bubbles:** Gray-100 background, Text-Primary, 16px radius with a 4px bottom-left corner.
- **Rich Cards:** Interactive micro-apps (like lead details or approval buttons) appear within the AI thread as Level 1 cards.

### Bottom Navigation
A fixed surface at the bottom of the screen with a 1px Gray-200 top border. Icons are Lucide (thin line style) at 24px. Active states are indicated by the Primary Blue color; inactive states use Gray-500.

### Input Fields
Inputs use a white background, Gray-200 border, and 12px radius. Focused states transition the border to Primary Blue with a subtle 2px outer glow.