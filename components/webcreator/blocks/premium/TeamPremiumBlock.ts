import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createTeamPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("team-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('team')}</div>
        <div class="gjs-block-label">Equipo</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'team-premium' }
  });

  editor.DomComponents.addType('team-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-team-section">
            <style>
              .premium-team-section { padding: 10rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .premium-team-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-team-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #818cf8; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-team-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; font-style: italic; }
              .premium-team-desc { font-size: 1.125rem; color: rgba(255, 255, 255, 0.4); line-height: 1.6; font-weight: 500; }
              .premium-team-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2.5rem; max-width: 1200px; margin: 0 auto; }
              .premium-team-card { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 3rem; padding: 2rem; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); text-align: center; }
              .premium-team-card:hover { transform: translateY(-10px); background: rgba(255, 255, 255, 0.04); border-color: #6366f1; }
              .premium-member-photo { width: 100%; aspect-ratio: 1; border-radius: 2rem; object-fit: cover; margin-bottom: 2rem; filter: grayscale(1); transition: all 0.5s; }
              .premium-team-card:hover .premium-member-photo { filter: grayscale(0); transform: scale(1.02); }
              .premium-member-name { font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: -0.03em; }
              .premium-member-role { font-size: 0.875rem; color: #818cf8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1.5rem; display: block; }
              .premium-member-bio { font-size: 0.9375rem; color: rgba(255,255,255,0.4); line-height: 1.6; margin-bottom: 2rem; font-weight: 500; }
              .premium-member-social { display: flex; justify-content: center; gap: 1rem; }
              .premium-social-link { color: rgba(255,255,255,0.2); transition: color 0.3s; }
              .premium-social-link:hover { color: white; }
              @media (max-width: 768px) { .premium-team-title { font-size: 2.5rem; } }
            </style>
            <div class="premium-team-header">
              <div class="premium-team-badge">Nuestra Élite</div>
              <h2 class="premium-team-title">Mentes brillantes detrás del código.</h2>
              <p class="premium-team-desc">Combinamos décadas de experiencia en tecnología e innovación para crear el futuro hoy mismo.</p>
            </div>
            <div class="premium-team-grid">
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Alex Morgan">
                <span class="premium-member-name">Alex Morgan</span>
                <span class="premium-member-role">Co-Founder & CEO</span>
                <p class="premium-member-bio">Liderando la visión estratégica y la innovación en sistemas descentralizados.</p>
                <div class="premium-member-social">
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                </div>
              </div>
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Jamie Smith">
                <span class="premium-member-name">Jamie Smith</span>
                <span class="premium-member-role">Co-Founder & CTO</span>
                <p class="premium-member-bio">Arquitecto principal de nuestra infraestructura distribuida y agentica.</p>
                <div class="premium-member-social">
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                </div>
              </div>
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Jordan Lee">
                <span class="premium-member-name">Jordan Lee</span>
                <span class="premium-member-role">VP of Product</span>
                <p class="premium-member-bio">Experta en Product-Led Growth y diseño de experiencias exponenciales.</p>
                <div class="premium-member-social">
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                </div>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
