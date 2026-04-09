import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createHeroPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("hero-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('hero')}</div>
        <div class="gjs-block-label">Hero / Banner</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'hero-premium' }
  });

  editor.DomComponents.addType('hero-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-hero-section">
            <style>
              .premium-hero-section { 
                position: relative; 
                padding: 10rem 2rem; 
                background: #ffffff; 
                color: #3D3D3D; 
                font-family: 'Inter', sans-serif; 
                overflow: hidden;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
              }
              .premium-hero-bg-glow {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100%;
                height: 100%;
                background: radial-gradient(circle at center, rgba(99, 102, 241, 0.05) 0%, transparent 70%);
                pointer-events: none;
                z-index: 1;
              }
              .premium-hero-grid-overlay {
                position: absolute;
                inset: 0;
                background-image: linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
                background-size: 50px 50px;
                pointer-events: none;
                z-index: 1;
              }
              .premium-hero-container {
                max-width: 1000px;
                position: relative;
                z-index: 10;
              }
              .premium-hero-badge {
                display: inline-flex;
                align-items: center;
                padding: 0.5rem 1.25rem;
                background: rgba(61, 61, 61, 0.05);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(61, 61, 61, 0.1);
                border-radius: 100px;
                margin-bottom: 2.5rem;
              }
              .premium-hero-badge-dot {
                width: 8px;
                height: 8px;
                background: #6366f1;
                border-radius: 50%;
                margin-right: 10px;
                box-shadow: 0 0 15px #6366f1;
              }
              .premium-hero-badge-text {
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.15em;
                color: #3D3D3D;
                opacity: 0.6;
              }
              .premium-hero-title {
                font-size: 5.5rem;
                font-weight: 900;
                line-height: 0.95;
                letter-spacing: -0.06em;
                margin-bottom: 2.5rem;
                font-style: italic;
                color: #3D3D3D;
              }
              .premium-hero-title span {
                background: linear-gradient(to bottom, #3D3D3D, rgba(61,61,61,0.6));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              .premium-hero-desc {
                font-size: 1.25rem;
                color: #3D3D3D;
                opacity: 0.6;
                line-height: 1.6;
                max-width: 600px;
                margin: 0 auto 3.5rem;
                font-weight: 500;
              }
              .premium-hero-cta-group {
                display: flex;
                gap: 1.5rem;
                justify-content: center;
              }
              .premium-hero-btn-primary {
                padding: 1.25rem 3rem;
                background: #3D3D3D;
                color: white;
                border: none;
                border-radius: 1.25rem;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.2em;
                cursor: pointer;
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1);
              }
              .premium-hero-btn-primary:hover {
                background: #6366f1;
                transform: translateY(-5px);
                box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.4);
              }
              .premium-hero-btn-secondary {
                padding: 1.25rem 3rem;
                background: transparent;
                color: #3D3D3D;
                border: 1px solid #3D3D3D;
                border-radius: 1.25rem;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.2em;
                cursor: pointer;
                transition: all 0.4s;
                backdrop-filter: blur(10px);
              }
              .premium-hero-btn-secondary:hover {
                background: rgba(61, 61, 61, 0.05);
                border-color: #6366f1;
                color: #6366f1;
              }
              @media (max-width: 768px) {
                .premium-hero-title { font-size: 3.5rem; }
                .premium-hero-section { padding: 6rem 1.5rem; }
                .premium-hero-cta-group { flex-direction: column; width: 100%; }
                .premium-hero-btn-primary, .premium-hero-btn-secondary { width: 100%; }
              }
            </style>
            <div class="premium-hero-bg-glow"></div>
            <div class="premium-hero-grid-overlay"></div>
            <div class="premium-hero-container">
              <div class="premium-hero-badge">
                <div class="premium-hero-badge-dot"></div>
                <span class="premium-hero-badge-text" data-gjs-editable="true" data-gjs-selectable="true">Powered by Volkern AI</span>
              </div>
              <h1 class="premium-hero-title">
                <span data-gjs-editable="true" data-gjs-selectable="true">REDEFINE TU VISIÓN</span><br>
                <span data-gjs-editable="true" data-gjs-selectable="true">CON INTELIGENCIA</span>
              </h1>
              <p class="premium-hero-desc" data-gjs-editable="true" data-gjs-selectable="true">La próxima generación de sitios web impulsados por sistemas de agentes IA dinámicos. Escala tu negocio con tecnología que piensa por ti.</p>
              <div class="premium-hero-cta-group">
                <button class="premium-hero-btn-primary" data-gjs-editable="true" data-gjs-selectable="true">EMPEZAR AHORA</button>
                <button class="premium-hero-btn-secondary" data-gjs-editable="true" data-gjs-selectable="true">VER DEMO</button>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
