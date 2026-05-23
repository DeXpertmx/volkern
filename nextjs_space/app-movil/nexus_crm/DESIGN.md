---
name: Nexus CRM
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#3f4850'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#6f7881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006497'
  primary: '#006193'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#92ccff'
  secondary: '#006399'
  on-secondary: '#ffffff'
  secondary-container: '#6ebdff'
  on-secondary-container: '#004b76'
  tertiary: '#006b27'
  on-tertiary: '#ffffff'
  tertiary-container: '#008733'
  on-tertiary-container: '#f7fff2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#92ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#95ccff'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#004a75'
  tertiary-fixed: '#72fe88'
  tertiary-fixed-dim: '#53e16f'
  on-tertiary-fixed: '#002107'
  on-tertiary-fixed-variant: '#00531c'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
  surface-background: '#F4F4F5'
  surface-sidebar: '#FFFFFF'
  bubble-sent: '#0088CC'
  bubble-received: '#FFFFFF'
  mcp-indicator: '#6B46C1'
  skill-active: '#FF9500'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 280px
  gutter: 16px
  margin-mobile: 12px
  margin-desktop: 24px
  bubble-padding: 8px 12px
---

## Brand & Style

This design system is engineered for a multi-tenant CRM environment that utilizes a familiar messaging-first interface. The brand personality is **Professional, Technical, and Systematic**. It bridges the gap between high-speed consumer communication and rigorous enterprise data management.

The design style is **Corporate / Modern** with a lean toward **Minimalism**. It prioritizes extreme legibility and rapid information scanning. By leveraging a refined version of the Telegram aesthetic—characterized by clean message bubbles and distinct sidebar navigation—the system reduces the learning curve for new users while providing the robust structure required for MCP (Model Context Protocol) and skill-based integrations. The interface uses subtle tonal layering and high-contrast text to ensure that complex CRM data remains the focal point.

## Colors

The palette is anchored by a functional primary blue, used for active states and primary actions. 

- **Primary & Secondary:** Derived from the familiar messaging blue, used for sent message bubbles, primary buttons, and active navigation states.
- **Surface Strategy:** The application uses a multi-layered gray approach. The main workspace background is a very light gray (`#F4F4F5`) to provide contrast for white message bubbles. Sidebars and headers use pure white to denote administrative and navigation hierarchy.
- **Semantic Colors:** Green is reserved for online status and successful syncs. Orange and Purple are introduced specifically for "Skills" and "MCP" integrations to distinguish automated system events from human messages.
- **Contrast:** Sent messages utilize white text on the primary blue background, while received messages use high-contrast black text on a white surface.

## Typography

The system utilizes **Inter** for all UI elements to ensure maximum legibility across densities. **JetBrains Mono** is employed as a secondary utility font specifically for MCP data, skill parameters, and technical metadata to visually separate system logic from conversation.

- **Scale:** A tight typographic scale is used to accommodate information-dense CRM screens. 
- **Hierarchy:** Bold weights are used sparingly for tenant names in headers and contact names in the sidebar.
- **Labels:** Small, uppercase labels with increased letter spacing are used for section dividers in the sidebar (e.g., "CHANNELS", "DIRECT MESSAGES").

## Layout & Spacing

This design system uses a **Fixed-Fluid Hybrid** model. The sidebar and right-hand inspector (if applicable) are fixed width, while the central chat area is fluid.

- **Grid:** A 12-column underlying structure is used for dashboard views, but the messaging interface relies on dynamic padding.
- **Breakpoints:**
  - **Desktop (>1024px):** Three-pane view: Navigation, Chat, and Skill/MCP Inspector.
  - **Tablet (768px - 1023px):** Two-pane view: Sidebar toggles via a hamburger menu or stays as a slim icon rail.
  - **Mobile (<767px):** Single-pane view. The navigation sidebar becomes a full-screen overlay.
- **Rhythm:** An 8px base unit drives all spacing. Message bubbles have 4px spacing between consecutive messages from the same sender and 12px between different senders.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** rather than heavy shadows to maintain a "clean" and "professional" look.

- **Level 0 (Base):** The main chat background (`#F4F4F5`).
- **Level 1 (Surfaces):** Sidebars, Sticky Headers, and Received Message Bubbles. These use a flat white color with a 1px border (`#E4E4E7`) instead of a shadow.
- **Level 2 (Floating):** Sent Message Bubbles and Active Chips. These are visually lifted by color saturation (Primary Blue) rather than shadow.
- **Sticky Headers:** Use a subtle `backdrop-filter: blur(10px)` with 90% opacity to maintain context while scrolling through dense chat histories.

## Shapes

The shape language is **Rounded**, favoring a modern and approachable feel that mimics high-end consumer messaging apps.

- **Message Bubbles:** Use a 16px radius. Consecutive messages from the same user should have "flattened" corners on the tail-side to visually group them.
- **Input Fields:** Fully rounded (pill-shaped) or 8px radius depending on the density of the CRM data around them.
- **Avatars:** Strictly circular to distinguish people from objects or skills.
- **Status Indicators:** Small 8px circles for online/offline; square icons with 4px radius for Skills/MCP status.

## Components

### Message Bubbles
- **Sent:** Primary Blue background, White text. Aligned right.
- **Received:** White background, 1px border (`#E4E4E7`), Black text. Aligned left.
- **System/MCP:** Centered, ghost-styled (no background), with Mono-spaced text for technical logs.

### Sidebar Navigation
- **Tenant Selector:** A vertical rail on the far left with circular icons.
- **Chat List:** High-density list with 1-line previews and unread badges (Primary Blue).

### Sticky Headers
- Displays the current Channel or Contact name. 
- Includes a sub-label for the **Tenant Subdomain** (e.g., `acme.crm.platform`).
- Right-aligned actions for "Search" and "Skill Settings".

### Status Indicators
- **MCP Sync:** A pulsing purple dot when the model is processing.
- **Skill Badge:** A small, rounded-sm chip appearing in the header or alongside messages when an automated skill has triggered a response.

### Buttons & Inputs
- **Primary Button:** Rounded-lg, Primary Blue, White text, bold weight.
- **Message Input:** A text area that expands vertically, housed in a white bar at the bottom of the chat with a "Send" icon and a "Skill/Command" trigger icon (`/`).