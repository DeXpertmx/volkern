---
name: Gemma AI
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#ddb7ff'
  on-secondary: '#490080'
  secondary-container: '#6f00be'
  on-secondary-container: '#d6a9ff'
  tertiary: '#3cddc7'
  on-tertiary: '#003731'
  tertiary-container: '#008678'
  on-tertiary-container: '#000705'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#f0dbff'
  secondary-fixed-dim: '#ddb7ff'
  on-secondary-fixed: '#2c0051'
  on-secondary-fixed-variant: '#6900b3'
  tertiary-fixed: '#62fae3'
  tertiary-fixed-dim: '#3cddc7'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005047'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  chat-bubble:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 22px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-margin: 20px
  gutter: 16px
  chat-gap: 12px
  section-padding: 32px
---

## Brand & Style
The design system is centered on the persona of an intelligent, empathetic co-pilot. The brand personality balances high-tech precision with human-centric warmth. It avoids the coldness of traditional enterprise AI by utilizing soft gradients and organic motion.

The aesthetic follows a **Modern Corporate** style infused with **Glassmorphism**. It prioritizes clarity in dialogue while using translucent layers to suggest a "limitless" digital space. The goal is to evoke a sense of calm, focused intelligence that feels futuristic yet entirely accessible.

## Colors
The palette is built on a "Deep Space" foundation to emphasize the AI's high-tech origins.

- **Primary (Deep Indigo):** Used for primary actions and the core brand identity.
- **Secondary (Vibrant Violet):** Used for AI-generated states, highlights, and interactive gradients.
- **Tertiary (Soft Mint):** Reserved for voice activity indicators, success states, and subtle accents that pop against the dark background.
- **Surface Tiers:** The background utilizes a deep navy (#0F172A), with surface-containers moving toward lighter shades of navy/charcoal to create depth.
- **Gradients:** Use a linear gradient from Indigo to Violet for AI-specific components (like the "Gemma" response bubble).

## Typography
The typography strategy distinguishes between the "Interface" and the "Conversation."

- **Headlines:** Plus Jakarta Sans provides a friendly, slightly rounded geometric feel for headers and onboarding.
- **Body:** Inter is used for all chat dialogue and long-form text to ensure maximum legibility and a neutral, systematic tone.
- **Labels:** JetBrains Mono is used sparingly for technical metadata, timestamps, and code snippets within the chat, reinforcing the "AI/Tech" nature of the product.

## Layout & Spacing
The layout uses a **Fluid Grid** model with a maximum content width of 800px for the chat interface to maintain readability. 

- **Mobile:** 4-column grid with 20px side margins. Chat bubbles occupy 85% of the screen width.
- **Desktop:** 12-column grid. The chat interface is centered, flanked by a collapsible sidebar for history and settings.
- **Spacing Rhythm:** Based on an 8px linear scale. Use larger 32px gaps between different speaker turns and tighter 12px gaps between consecutive messages from the same sender.

## Elevation & Depth
Depth is achieved through **Glassmorphism** and **Tonal Layering** rather than traditional heavy shadows.

- **Bottom Navigation & Headers:** Use a 20px backdrop blur with a 10% white border-stroke to separate the navigation from the scrolling chat content.
- **Chat Bubbles:** User bubbles are solid; AI bubbles use a subtle gradient with a 1px inner glow to appear "illuminated."
- **Overlays:** Modals and tooltips should use a semi-transparent surface (60% opacity) with a "Soft" ambient shadow (0px 8px 24px rgba(0,0,0,0.3)) to lift them from the dark background.

## Shapes
The shape language is "Hyper-Rounded" to maintain the friendly brand persona.

- **Buttons & Inputs:** Use the `rounded-lg` (1rem) setting.
- **Chat Bubbles:** Use a variable corner radius. User bubbles have a sharp bottom-right corner, while AI bubbles have a sharp bottom-left corner. All other corners are `rounded-xl` (1.5rem).
- **Cards:** Use `rounded-lg` for consistency across the dashboard and history views.

## Components
- **Chat Bubbles:** User bubbles are Primary Indigo. AI bubbles use a dark surface with a Secondary Violet border.
- **Input Field:** A floating "pill" at the bottom of the screen. It should feature a glass effect and expand vertically as the user types.
- **Voice Waveform:** When voice mode is active, a Mint-colored (#2DD4BF) fluid animation replaces the input text area.
- **Buttons:** Primary buttons use a gradient (Indigo to Violet). Secondary buttons are "Ghost" style with a 1px border.
- **Chips:** Used for "Suggested Prompts" above the input field. They should be semi-transparent with a light border, turning solid Primary on hover.
- **AI Loading State:** A subtle pulsing glow behind the Gemma logo or the current message bubble to indicate "thinking."