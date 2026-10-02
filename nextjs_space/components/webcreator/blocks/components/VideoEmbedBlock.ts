import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";
import { normalizeVideoEmbedUrl } from "../../../../lib/video-utils";

export const VOLKERN_VIDEO_TYPE = "volkern-video";
export const VOLKERN_VIDEO_CLASS = "volkern-video-embed";

const DEFAULT_EMBED_ATTRS = {
  allow:
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  allowfullscreen: "true",
  frameborder: "0",
  loading: "lazy",
  title: "Video",
};

/**
 * Bloque «Video» dedicado del Web Creator.
 *
 * - Type propio (`volkern-video`, tagName iframe): se serializa bien en projectData
 *   y se renderiza vía getHtml en la página pública, SIN pasar por custom-code
 *   (evita la ventana de duplicación del plugin grapesjs-custom-code).
 * - Trait de URL: acepta enlaces compartidos de YouTube (watch/youtu.be/shorts),
 *   Vimeo y HeyGen y los normaliza a su URL de iframe embebido al vuelo.
 * - Al cargar projectData antiguo con URLs crudas, la normalización también se
 *   aplica (idempotente), migrando contenido histórico.
 */
export const createVideoEmbedBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-video", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg("video")}
        </div>
        <div class="gjs-block-label">Video</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: VOLKERN_VIDEO_TYPE },
  });

  editor.DomComponents.addType(VOLKERN_VIDEO_TYPE, {
    // Reclamar iframes con nuestra clase al re-parsear HTML (setComponents, pegado)
    isComponent: (el: any) =>
      el?.tagName === "IFRAME" &&
      typeof el.classList?.contains === "function" &&
      el.classList.contains(VOLKERN_VIDEO_CLASS),
    model: {
      defaults: {
        tagName: "iframe",
        attributes: {
          class: VOLKERN_VIDEO_CLASS,
          src: "",
          ...DEFAULT_EMBED_ATTRS,
        },
        style: {
          width: "100%",
          "aspect-ratio": "16 / 9",
          "min-height": "240px",
          border: "0",
          "border-radius": "12px",
          display: "block",
          "background-color": "#f1f5f9",
        },
        traits: [
          {
            type: "text",
            name: "src",
            label: "URL del video",
            placeholder: "YouTube, Vimeo o HeyGen",
          },
          {
            type: "text",
            name: "title",
            label: "Título (accesibilidad)",
            placeholder: "ej: Presentación de la empresa",
          },
        ],
      },
      init() {
        // Normalizar la URL al crear, al cambiar el trait y al cargar projectData
        this.on("change:attributes", this.syncEmbedUrl, this);
        this.syncEmbedUrl();
      },
      syncEmbedUrl(this: any) {
        const attrs = this.get("attributes") || {};
        const raw = attrs.src;
        if (typeof raw !== "string" || !raw.trim()) return;
        const normalized = normalizeVideoEmbedUrl(raw);
        if (normalized && normalized !== raw) {
          // addAttributes re-dispara change:attributes; la segunda pasada es no-op
          this.addAttributes({ src: normalized });
        }
      },
    },
  });
};
