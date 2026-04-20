/**
 * Icon Library for WebCreator Blocks
 * Centralized registry of Premium and Volkern icons.
 */

export interface IconDefinition {
  path: string;
  viewBox: string;
  strokeWidth?: string;
}

export const MODERN_ICONS: Record<string, IconDefinition> = {
  // All icons follow the same coordinate logic: 
  // 1. viewBox="0 0 W H" to match original icon document size.
  // 2. g transform="translate(-X, -Y)" to bring Inkscape absolute coordinates to 0,0.
  
  hero: {
    path: `<g transform="translate(-24.9,-141.26)">
             <rect x="25.05" y="141.41" width="4.76" height="1.59" rx="0.26"/>
             <rect x="25.05" y="143.53" width="2.91" height="2.65" rx="0.26"/>
             <rect x="28.49" y="143.53" width="1.32" height="2.65" rx="0.26"/>
           </g>`,
    viewBox: "0 0 5.0625 5.0625",
    strokeWidth: "0.35"
  },
  features: {
    path: `<g transform="translate(-25.2,-149.76)">
             <rect x="25.35" y="149.91" width="1.85" height="1.85" rx="0.4"/>
             <rect x="28.26" y="149.91" width="1.85" height="1.85" rx="0.4"/>
             <rect x="25.35" y="152.82" width="1.85" height="1.85" rx="0.4"/>
             <rect x="28.26" y="152.82" width="1.85" height="1.85" rx="0.4"/>
           </g>`,
    viewBox: "0 0 5.0625 5.0625",
    strokeWidth: "0.35"
  },
  testimonials: {
    path: `<g transform="translate(-24.89,-159.51)">
             <path d="m 29.8,161.9 a 2.2 2.2 0 0 1 -0.2,1.0 2.2 2.2 0 0 1 -2.0,1.2 2.2 2.2 0 0 1 -1.0,-0.2 l -1.5,0.5 0.5,-1.5 a 2.2 2.2 0 0 1 -0.2,-1.0 2.2 2.2 0 0 1 1.2,-2.0 2.2 2.2 0 0 1 1.0,-0.2 h 0.1 a 2.2 2.2 0 0 1 2.1,2.1 z"/>
             <circle cx="26.3" cy="162.0" r="0.1"/>
             <circle cx="28.4" cy="162.0" r="0.1"/>
           </g>`,
    viewBox: "0 0 5.0625 5.0625",
    strokeWidth: "0.35"
  },
  cta: {
    path: `<g transform="translate(-33.1,-141.26)">
             <rect x="33.25" y="141.41" width="4.76" height="4.76" rx="0.53"/>
             <path d="m 34.4,143.7 h 2.4 m -0.8,-0.8 0.8,0.8 -0.8,0.8"/>
           </g>`,
    viewBox: "0 0 5.0625 5.0625",
    strokeWidth: "0.35"
  },
  pricing: {
    path: `<g transform="translate(-38.435,-159.662)">
             <path d="m 43.5,162.83 -1.9,1.9 a 0.53,0.53 0 0 1 -0.75,0 l -2.27,-2.27 v -2.65 h 2.65 l 2.27,2.27 a 0.53,0.53 0 0 1 0,0.75 z"/>
             <line x1="39.91" y1="161.14" x2="39.91" y2="161.14"/>
             <path d="m 41.23,161.93 a 0.53,0.53 0 1 1 0,1.06 0.53,0.53 0 0 1 0,-1.06 z"/>
           </g>`,
    viewBox: "0 0 5.3715 5.3701",
    strokeWidth: "0.3"
  },
  faq: {
    path: `<g transform="translate(-7.452,-139.677)">
             <circle cx="9.98" cy="142.21" r="2.38"/>
             <path d="m 9.21,141.41 a 0.79 0.79 0 0 1 1.54 0.26 c 0,0.53 -0.79,0.79 -0.79,0.79"/>
             <line x1="9.98" y1="143.53" x2="9.99" y2="143.53"/>
           </g>`,
    viewBox: "0 0 5.06 5.06",
    strokeWidth: "0.3"
  },
  stats: {
    path: `<g transform="translate(-7.602,-129.146)">
             <line x1="11.72" y1="131.94" x2="11.72" y2="129.3"/>
             <line x1="10.13" y1="131.94" x2="10.13" y2="130.35"/>
             <line x1="8.55" y1="131.94" x2="8.55" y2="130.88"/>
             <line x1="7.75" y1="131.94" x2="12.51" y2="131.94"/>
           </g>`,
    viewBox: "0 0 5.06 2.95",
    strokeWidth: "0.3"
  },
  footer: {
    path: `<g transform="translate(-15.575,-76.005)">
             <rect x="15.73" y="76.15" width="4.76" height="1.06" rx="0.26"/>
             <rect x="15.67" y="77.69" width="1.43" height="1.25" rx="0.29"/>
             <rect x="17.53" y="77.69" width="1.16" height="1.25" rx="0.29"/>
             <rect x="19.11" y="77.69" width="1.43" height="1.25" rx="0.29"/>
           </g>`,
    viewBox: "0 0 5.06 3.03",
    strokeWidth: "0.3"
  },
  contact: {
    path: `<g transform="translate(-7.32,-118.62)">
             <rect x="7.47" y="118.77" width="4.76" height="3.7" rx="0.53"/>
             <path d="m 7.47,119.3 2.38,1.59 2.38,-1.59"/>
           </g>`,
    viewBox: "0 0 5.06 4.0",
    strokeWidth: "0.3"
  },
  services: {
    path: `<g transform="translate(-39.23,-101.88)">
             <rect x="39.4" y="103.11" width="4.76" height="3.43" rx="0.52"/>
             <path d="m 40.7,103.1 v -0.5 a 0.5,0.5 0 0 1 0.5,-0.5 h 1.0 a 0.5,0.5 0 0 1 0.5,0.5 v 0.5"/>
           </g>`,
    viewBox: "0 0 5.11 4.85",
    strokeWidth: "0.35"
  },
  booking: {
    path: `<g transform="translate(-36.63,-112.48)">
             <rect x="36.8" y="113.5" width="4.76" height="4.39" rx="0.52"/>
             <path d="m 40.2,112.6 v 0.8 m -2.1,-0.8 v 0.8 m -1.3,1.4 h 4.7"/>
           </g>`,
    viewBox: "0 0 5.11 5.64",
    strokeWidth: "0.35"
  },
  leads: {
    path: `<g transform="translate(-50.058,-111.81)">
             <circle cx="52.54" cy="112.96" r="0.45"/>
             <path d="m 52.54,113.86 c -0.49,0 -0.9,0.3 -0.9,0.6 v 0.3 h 1.8 v -0.3 c 0,-0.3 -0.4,-0.6 -0.9,-0.6 z"/>
             <path d="m 50.21,112.04 5.08,-0.08 -1.85,3.7 v 0.57 c -0.76,0.37 -1.5,0.81 -2.18,1.1 l 0.07,-1.67 z"/>
             <circle cx="52.91" cy="113.55" r="0.53"/>
           </g>`,
    viewBox: "0 0 5.3817 5.6739",
    strokeWidth: "0.3"
  },
  team: {
    path: `<g transform="translate(-6.532,-150.553)">
             <circle cx="9.06" cy="151.5" r="0.79"/>
             <path d="m 9.06,153.08 c -0.87,0 -1.59,0.53 -1.59,1.06 v 0.53 h 3.17 v -0.53 c 0,-0.53 -0.71,-1.06 -1.59,-1.06 z"/>
             <circle cx="7.21" cy="152.03" r="0.53"/>
             <circle cx="10.92" cy="152.03" r="0.53"/>
           </g>`,
    viewBox: "0 0 5.06 4.27",
    strokeWidth: "0.3"
  },
  blog: {
    path: `<g transform="translate(-25.447,-118.652)">
             <path d="m 28.24,118.8 h -2.12 a 0.53,0.53 0 0 0 -0.53,0.53 v 4.23 a 0.53,0.53 0 0 0 0.53,0.53 h 3.18 a 0.53,0.53 0 0 0 0.53,-0.53 v -3.18 z"/>
             <path d="m 28.24,118.8 v 1.59 h 1.59"/>
             <path d="m 28.77,121.71 -1.32,1.32 m 0,0 -0.79,0.26 0.26,-0.79 1.32,-1.32"/>
           </g>`,
    viewBox: "0 0 4.53 5.59",
    strokeWidth: "0.3"
  },
  catalog: {
    path: `<g transform="translate(-16.0,-149.76)">
             <rect x="16.15" y="149.91" width="1.85" height="1.85" rx="0.4"/>
             <rect x="19.06" y="149.91" width="1.85" height="1.85" rx="0.4"/>
             <rect x="16.15" y="152.82" width="1.85" height="1.85" rx="0.4"/>
             <rect x="19.06" y="152.82" width="1.85" height="1.85" rx="0.4"/>
           </g>`,
    viewBox: "0 0 5.0625 5.0625",
    strokeWidth: "0.35"
  },
  divider: {
    path: `<line x1="0.5" y1="2.5" x2="4.5" y2="2.5"/>`,
    viewBox: "0 0 5 5",
    strokeWidth: "0.5"
  }
};

export const getIconSvg = (name: string, size: number = 24) => {
  const icon = MODERN_ICONS[name] || MODERN_ICONS['hero'];
  
  return `
    <svg 
      width="${size}" 
      height="${size}" 
      viewBox="${icon.viewBox}" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style="display: block;"
    >
      <g 
        stroke="currentColor" 
        stroke-width="${icon.strokeWidth || '0.35'}" 
        stroke-linecap="round" 
        stroke-linejoin="round" 
        fill="none"
      >
        ${icon.path}
      </g>
    </svg>
  `;
};