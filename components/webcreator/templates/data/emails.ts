import { Template } from '../types';

export const emailTemplates: Template[] = [
  {
    id: 'email-modern-newsletter',
    name: 'Newsletter Moderna',
    description: 'Diseño limpio y profesional para tus boletines informativos.',
    category: 'email',
    tags: ['marketing', 'newsletter', 'modern'],
    isDefault: true,
    data: {
      html: `
        <div class="email-body">
          <header class="email-header">
            <div class="email-logo">V</div>
            <h1>Volkern CRM News</h1>
          </header>
          
          <main class="email-main">
            <section class="email-hero">
              <img src="https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80" alt="Hero Image" class="hero-img">
              <h2>Nuevas funcionalidades de Abril</h2>
              <p>Descubre cómo el nuevo Gestor de Plantillas puede transformar la imagen de tu negocio. Ahora con edición a pantalla completa y diseños profesionales.</p>
              <a href="#" class="cta-button">Ver Novedades</a>
            </section>

            <section class="email-content">
              <div class="feature-item">
                <h3>Edición Visual</h3>
                <p>Arrastra y suelta componentes para crear documentos legales sin complicaciones.</p>
              </div>
              <div class="feature-item">
                <h3>Automatización</h3>
                <p>Configura el envío automático de órdenes de venta desde tu panel de configuración.</p>
              </div>
            </section>
          </main>

          <footer class="email-footer">
            <p>© 2024 Volkern CRM. Todos los derechos reservados.</p>
            <p>Has recibido este email porque estás suscrito a nuestras noticias.</p>
            <div class="email-links">
              <a href="#">Darse de baja</a> | <a href="#">Ver en navegador</a>
            </div>
          </footer>
        </div>
      `,
      css: `
        .email-body {
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f4f7f9;
          padding: 20px;
          margin: 0;
          color: #333;
        }

        .email-header {
          text-align: center;
          padding: 30px 0;
          background: #4f46e5;
          color: white;
          border-radius: 8px 8px 0 0;
        }

        .email-logo {
          font-size: 32px;
          font-weight: 900;
          margin-bottom: 10px;
        }

        .email-header h1 {
          font-size: 20px;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .email-main {
          background: white;
          max-width: 600px;
          margin: 0 auto;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .email-hero {
          padding: 40px;
          text-align: center;
        }

        .hero-img {
          width: 100%;
          max-height: 250px;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 25px;
        }

        .email-hero h2 {
          font-size: 24px;
          color: #111827;
          margin-bottom: 15px;
        }

        .email-hero p {
          font-size: 16px;
          color: #4b5563;
          line-height: 1.6;
          margin-bottom: 30px;
        }

        .cta-button {
          display: inline-block;
          padding: 14px 30px;
          background: #4f46e5;
          color: white !important;
          text-decoration: none;
          font-weight: bold;
          border-radius: 6px;
          transition: background 0.3s;
        }

        .email-content {
          padding: 0 40px 40px;
          display: grid;
          gap: 20px;
        }

        .feature-item {
          padding: 15px;
          background: #f8fafc;
          border-radius: 8px;
        }

        .feature-item h3 {
          font-size: 16px;
          margin: 0 0 5px 0;
          color: #4f46e5;
        }

        .feature-item p {
          font-size: 14px;
          margin: 0;
          color: #64748b;
        }

        .email-footer {
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
          padding: 30px;
          font-size: 12px;
          color: #94a3b8;
        }

        .email-links { margin-top: 15px; }
        .email-links a { color: #6366f1; text-decoration: none; }
      `
    }
  }
];
