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
          <style>
.premium-team-section { padding: 80px 24px; background: #f8fafc; }
.premium-team-header { text-align: center; max-width: 700px; margin: 0 auto 48px; }
.premium-team-badge { display: inline-block; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; }
.premium-team-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0 0 12px; }
.premium-team-desc { font-size: 16px; color: #475569; line-height: 1.6; margin: 0; }
.premium-team-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1200px; margin: 0 auto; }
.premium-team-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.premium-member-photo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px; display: block; }
.premium-member-name { display: block; font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
.premium-member-role { display: block; font-size: 14px; color: #6366f1; font-weight: 600; margin-bottom: 12px; }
.premium-member-bio { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px; }
.premium-member-social { display: flex; gap: 12px; justify-content: center; }
.premium-social-link { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; color: #6366f1; background: #eef2ff; border-radius: 50%; transition: all 0.2s; }
.premium-social-link:hover { background: #6366f1; color: white; }
</style>
           <section class="premium-team-section">
            <div class="premium-team-header">
              <div class="premium-team-badge" data-gjs-editable="true" data-gjs-selectable="true">Nuestra Élite</div>
              <h2 class="premium-team-title" data-gjs-editable="true" data-gjs-selectable="true">Mentes brillantes detrás del código.</h2>
              <p class="premium-team-desc" data-gjs-editable="true" data-gjs-selectable="true">Combinamos décadas de experiencia en tecnología e innovación para crear el futuro hoy mismo.</p>
            </div>
            <div class="premium-team-grid">
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Alex Morgan">
                <span class="premium-member-name" data-gjs-editable="true" data-gjs-selectable="true">Alex Morgan</span>
                <span class="premium-member-role" data-gjs-editable="true" data-gjs-selectable="true">Co-Founder & CEO</span>
                <p class="premium-member-bio" data-gjs-editable="true" data-gjs-selectable="true">Liderando la visión estratégica y la innovación en sistemas descentralizados.</p>
                <div class="premium-member-social">
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                </div>
              </div>
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Jamie Smith">
                <span class="premium-member-name" data-gjs-editable="true" data-gjs-selectable="true">Jamie Smith</span>
                <span class="premium-member-role" data-gjs-editable="true" data-gjs-selectable="true">Co-Founder & CTO</span>
                <p class="premium-member-bio" data-gjs-editable="true" data-gjs-selectable="true">Arquitecto principal de nuestra infraestructura distribuida y agentica.</p>
                <div class="premium-member-social">
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
                  <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                </div>
              </div>
              <div class="premium-team-card">
                <img class="premium-member-photo" src="https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=4&w=384&h=384&q=80" alt="Jordan Lee">
                <span class="premium-member-name" data-gjs-editable="true" data-gjs-selectable="true">Jordan Lee</span>
                <span class="premium-member-role" data-gjs-editable="true" data-gjs-selectable="true">VP of Product</span>
                <p class="premium-member-bio" data-gjs-editable="true" data-gjs-selectable="true">Experta en Product-Led Growth y diseño de experiencias exponenciales.</p>
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
