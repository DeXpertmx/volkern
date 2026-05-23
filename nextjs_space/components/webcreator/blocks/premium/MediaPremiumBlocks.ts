import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";
import { toast } from "sonner";

export const createMediaPremiumBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Gallery Block
  bm.add("gallery-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('catalog')}</div>
        <div class="gjs-block-label">Galería Masonry</div>
      </div>
    `,
    category: "Premium",
    content: { 
      type: 'gallery-premium',
      components: [
        {
          tagName: 'section',
          classes: ['premium-gallery-section'],
          components: [
            {
              tagName: 'div',
              classes: ['premium-gallery-header'],
              components: [{ tagName: 'h2', classes: ['premium-gallery-title'], content: 'Nuestra Galería' }]
            },
            {
              type: 'gallery-grid',
              components: [
                { type: 'gallery-item', components: [{ type: 'image', attributes: { src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80' } }] },
                { type: 'gallery-item', components: [{ type: 'image', attributes: { src: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80' } }] }
              ]
            }
          ]
        }
      ]
    }
  });

  editor.DomComponents.addType('gallery-grid', {
    isComponent: el => el.classList?.contains('premium-gallery-grid'),
    model: {
      defaults: {
        tagName: 'div',
        classes: ['premium-gallery-grid'],
        droppable: 'gallery-item',
        draggable: false,
      }
    }
  });

  editor.DomComponents.addType('gallery-item', {
    isComponent: el => el.classList?.contains('premium-gallery-item'),
    model: {
      defaults: {
        tagName: 'div',
        classes: ['premium-gallery-item'],
        draggable: '.premium-gallery-grid',
        droppable: false,
      }
    }
  });

  editor.DomComponents.addType('gallery-premium', {
    isComponent: el => el.classList?.contains('premium-gallery-section'),
    model: {
      defaults: {
        traits: [
          { type: 'button', text: '➕ Añadir Imagen', full: true, command: 'add-img-premium' },
          { type: 'button', text: '🗑️ Limpiar Galería', full: true, command: 'clear-img-premium' },
        ],
      },
      init() {
        const tb = this.get('toolbar');
        if (!tb.find((i: any) => i.command === 'add-img-premium')) {
          tb.push(
            { attributes: { class: 'fa fa-plus', title: 'Añadir Imagen' }, command: 'add-img-premium' },
            { attributes: { class: 'fa fa-trash', title: 'Limpiar Todo' }, command: 'clear-img-premium' }
          );
        }
      }
    }
  });

  // 2. Multimedia Carousel
  bm.add("carousel-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('hero')}</div>
        <div class="gjs-block-label">Carrusel Multimedia</div>
      </div>
    `,
    category: "Premium",
    content: { 
      type: 'carousel-premium',
      components: [
        {
          tagName: 'section',
          classes: ['premium-carousel-section'],
          components: [
            {
              type: 'carousel-track',
              components: [
                { type: 'carousel-slide', components: [{ type: 'image', classes: ['premium-carousel-img'], attributes: { src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80' } }] },
                { type: 'carousel-slide', components: [{ type: 'image', classes: ['premium-carousel-img'], attributes: { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80' } }] }
              ]
            },
            { tagName: 'div', classes: ['premium-carousel-nav'] }
          ]
        }
      ]
    }
  });

  editor.DomComponents.addType('carousel-track', {
    isComponent: el => el.classList?.contains('premium-carousel-track'),
    model: {
      defaults: {
        tagName: 'div',
        classes: ['premium-carousel-track'],
        droppable: 'carousel-slide',
        draggable: false,
      }
    }
  });

  editor.DomComponents.addType('carousel-slide', {
    isComponent: el => el.classList?.contains('premium-carousel-slide'),
    model: {
      defaults: {
        tagName: 'div',
        classes: ['premium-carousel-slide'],
        draggable: '.premium-carousel-track',
        droppable: false,
      }
    }
  });

  editor.DomComponents.addType('carousel-premium', {
    isComponent: el => el.classList?.contains('premium-carousel-section'),
    model: {
      defaults: {
        traits: [
          { type: 'button', text: '➕ Añadir Imagen', full: true, command: 'add-img-premium' },
          { type: 'button', text: '🗑️ Limpiar Carrusel', full: true, command: 'clear-img-premium' },
        ],
        script: function(this: any) {
          const el = this;
          let current = 0;
          const track = el.querySelector('.premium-carousel-track');
          const nav = el.querySelector('.premium-carousel-nav');
          
          const update = () => {
            if (!track || !nav) return;
            const count = track.children.length;
            nav.innerHTML = Array.from({length: count}).map((_, i) => `
              <button class="premium-carousel-dot ${i===current?'active':''}" data-index="${i}"></button>
            `).join('');
            nav.querySelectorAll('button').forEach((b:any) => {
              b.addEventListener('click', () => goto(parseInt(b.dataset.index)));
            });
          };

          const goto = (index: number) => {
            if (!track || !nav) return;
            const count = track.children.length;
            if (count === 0) return;
            current = (index + count) % count;
            track.style.transform = `translateX(-${current * 100}%)`;
            nav.querySelectorAll('button').forEach((b:any, i:number) => {
              b.classList.toggle('active', i === current);
            });
          };

          const observer = new MutationObserver(() => update());
          if (track) observer.observe(track, { childList: true });
          update();

          const interval = setInterval(() => {
            if (track && track.children.length > 1) goto(current + 1);
          }, 5000);
        }
      },
      init() {
        const tb = this.get('toolbar');
        if (!tb.find((i: any) => i.command === 'add-img-premium')) {
          tb.push(
            { attributes: { class: 'fa fa-plus', title: 'Añadir Imagen' }, command: 'add-img-premium' },
            { attributes: { class: 'fa fa-trash', title: 'Limpiar Todo' }, command: 'clear-img-premium' }
          );
        }
      }
    }
  });

  // Commands
  editor.Commands.add('add-img-premium', {
    run(editor, sender, options = {}) {
      const selected = options.target || editor.getSelected();
      if (!selected) {
        toast.error("Por favor, selecciona el componente primero");
        return;
      }

      // Subir hasta encontrar el contenedor premium si es necesario
      const findPremium = (comp: any): any => {
        if (!comp) return null;
        const type = comp.get('type');
        if (type === 'carousel-premium' || type === 'gallery-premium') return comp;
        return findPremium(comp.parent());
      };

      const premiumComp = findPremium(selected);
      
      if (!premiumComp) {
        toast.error("Selecciona el Carrusel o Galería para añadir imágenes");
        return;
      }

      editor.AssetManager.open({
        select(asset: any, complete: boolean) {
          const url = asset.get('src');
          const type = premiumComp.get('type');
          
          if (type === 'carousel-premium') {
            const track = premiumComp.findType('carousel-track')[0] || premiumComp.find('.premium-carousel-track')[0];
            if (track) {
              track.append({
                type: 'carousel-slide',
                components: [{ type: 'image', classes: ['premium-carousel-img'], attributes: { src: url } }]
              });
              toast.success("Imagen añadida al carrusel");
            } else {
              toast.error("Error: No se encontró el carril del carrusel");
            }
          } else if (type === 'gallery-premium') {
            const grid = premiumComp.findType('gallery-grid')[0] || premiumComp.find('.premium-gallery-grid')[0];
            if (grid) {
              grid.append({
                type: 'gallery-item',
                components: [{ type: 'image', attributes: { src: url } }]
              });
              toast.success("Imagen añadida a la galería");
            } else {
              toast.error("Error: No se encontró la rejilla de la galería");
            }
          }
          
          if (complete) editor.AssetManager.close();
        }
      });
    }
  });

  editor.Commands.add('clear-img-premium', {
    run(editor, sender, options = {}) {
      const selected = options.target || editor.getSelected();
      if (!selected) return;
      
      const findPremium = (comp: any): any => {
        if (!comp) return null;
        const type = comp.get('type');
        if (type === 'carousel-premium' || type === 'gallery-premium') return comp;
        return findPremium(comp.parent());
      };

      const premiumComp = findPremium(selected);

      if (premiumComp) {
        const track = premiumComp.findType('carousel-track')[0] || 
                      premiumComp.findType('gallery-grid')[0] || 
                      premiumComp.find('.premium-carousel-track')[0] || 
                      premiumComp.find('.premium-gallery-grid')[0];
        if (track) {
          track.components().reset();
          toast.info("Contenido limpiado");
        }
      }
    }
  });

};
