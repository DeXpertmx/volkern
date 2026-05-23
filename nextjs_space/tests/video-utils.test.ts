import { describe, it, expect } from 'vitest';
import { parseVideoUrl, isValidVideoUrl, type VideoProvider } from '@/lib/video-utils';

describe('video-utils', () => {
  // ============================================================
  // parseVideoUrl
  // ============================================================
  describe('parseVideoUrl', () => {
    // --- YouTube ---
    describe('YouTube', () => {
      const ytId = 'dQw4w9WgXcQ';

      it('debe parsear URL estándar youtube.com/watch?v=', () => {
        const info = parseVideoUrl(`https://www.youtube.com/watch?v=${ytId}`);
        expect(info.provider).toBe('youtube');
        expect(info.id).toBe(ytId);
        expect(info.embedUrl).toBe(`https://www.youtube.com/embed/${ytId}`);
      });

      it('debe parsear URL corta youtu.be', () => {
        const info = parseVideoUrl(`https://youtu.be/${ytId}`);
        expect(info.provider).toBe('youtube');
        expect(info.id).toBe(ytId);
      });

      it('debe parsear URL embed', () => {
        const info = parseVideoUrl(`https://www.youtube.com/embed/${ytId}`);
        expect(info.provider).toBe('youtube');
        expect(info.id).toBe(ytId);
      });

      it('debe parsear URL con parámetros adicionales', () => {
        const info = parseVideoUrl(`https://www.youtube.com/watch?v=${ytId}&t=30&list=PLxyz`);
        expect(info.id).toBe(ytId);
      });

      it('debe parsear URL youtube.com/v/', () => {
        const info = parseVideoUrl(`https://www.youtube.com/v/${ytId}`);
        expect(info.provider).toBe('youtube');
        expect(info.id).toBe(ytId);
      });
    });

    // --- Vimeo ---
    describe('Vimeo', () => {
      it('debe parsear URL vimeo.com/id', () => {
        const info = parseVideoUrl('https://vimeo.com/123456789');
        expect(info.provider).toBe('vimeo');
        expect(info.id).toBe('123456789');
        expect(info.embedUrl).toBe('https://player.vimeo.com/video/123456789');
      });

      it('debe parsear URL player.vimeo.com', () => {
        const info = parseVideoUrl('https://player.vimeo.com/video/987654321');
        expect(info.provider).toBe('vimeo');
        expect(info.id).toBe('987654321');
      });

      it('debe parsear Vimeo con parámetros', () => {
        const info = parseVideoUrl('https://vimeo.com/55555?autoplay=1');
        expect(info.id).toBe('55555');
      });
    });

    // --- Dailymotion ---
    describe('Dailymotion', () => {
      it('debe parsear URL dailymotion.com/video/', () => {
        const info = parseVideoUrl('https://www.dailymotion.com/video/x7tg7r0');
        expect(info.provider).toBe('dailymotion');
        expect(info.id).toBe('x7tg7r0');
        expect(info.embedUrl).toBe('https://www.dailymotion.com/embed/video/x7tg7r0');
      });

      it('debe parsear URL embed de Dailymotion', () => {
        const info = parseVideoUrl('https://www.dailymotion.com/embed/video/x9abcde');
        expect(info.provider).toBe('dailymotion');
        expect(info.id).toBe('x9abcde');
      });

      it('debe parsear URL corta dai.ly', () => {
        const info = parseVideoUrl('https://dai.ly/x8fghij');
        expect(info.provider).toBe('dailymotion');
        expect(info.id).toBe('x8fghij');
      });
    });

    // --- Upload / direct links ---
    describe('Upload / enlaces directos', () => {
      it('debe tratar URL http genérica como upload', () => {
        const info = parseVideoUrl('https://cdn.mi-empresa.com/videos/demo.mp4');
        expect(info.provider).toBe('upload');
        expect(info.id).toBe('https://cdn.mi-empresa.com/videos/demo.mp4');
        expect(info.embedUrl).toBe('https://cdn.mi-empresa.com/videos/demo.mp4');
      });

      it('debe tratar ruta relativa como upload', () => {
        const info = parseVideoUrl('/uploads/videos/intro.mp4');
        expect(info.provider).toBe('upload');
        expect(info.id).toBe('/uploads/videos/intro.mp4');
      });
    });

    // --- Casos inválidos ---
    describe('Casos inválidos', () => {
      it('debe devolver unknown para URL vacía', () => {
        const info = parseVideoUrl('');
        expect(info.provider).toBe('unknown');
        expect(info.id).toBeNull();
        expect(info.embedUrl).toBeNull();
      });

      it('debe devolver unknown para texto que no es URL de video', () => {
        const info = parseVideoUrl('esto no es una url');
        expect(info.provider).toBe('unknown');
        expect(info.id).toBeNull();
      });

      it('debe tratar URL http sin patrón de video como upload', () => {
        const info = parseVideoUrl('https://www.google.com');
        expect(info.provider).toBe('upload');
        expect(info.id).toBe('https://www.google.com');
      });
    });

    // --- Todos los providers ---
    describe('cobertura de providers', () => {
      it('debe cubrir los 5 providers', () => {
        const providers = new Set<VideoProvider>();
        const urls: Record<VideoProvider, string> = {
          youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          vimeo: 'https://vimeo.com/123456789',
          dailymotion: 'https://www.dailymotion.com/video/x7tg7r0',
          upload: 'https://cdn.example.com/video.mp4',
          unknown: 'texto no url',
        };

        for (const [provider, url] of Object.entries(urls)) {
          const info = parseVideoUrl(url);
          expect(info.provider).toBe(provider);
          providers.add(info.provider);
        }

        expect(providers.size).toBe(5);
      });
    });
  });

  // ============================================================
  // isValidVideoUrl
  // ============================================================
  describe('isValidVideoUrl', () => {
    it('debe aceptar YouTube', () => {
      expect(isValidVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('debe aceptar Vimeo', () => {
      expect(isValidVideoUrl('https://vimeo.com/123456789')).toBe(true);
    });

    it('debe aceptar Dailymotion', () => {
      expect(isValidVideoUrl('https://www.dailymotion.com/video/x7tg7r0')).toBe(true);
    });

    it('debe aceptar enlace directo', () => {
      expect(isValidVideoUrl('https://cdn.example.com/video.mp4')).toBe(true);
    });

    it('debe aceptar ruta relativa', () => {
      expect(isValidVideoUrl('/uploads/video.mp4')).toBe(true);
    });

    it('debe rechazar URL vacía', () => {
      expect(isValidVideoUrl('')).toBe(false);
    });

    it('debe rechazar texto no URL de video', () => {
      expect(isValidVideoUrl('hola mundo')).toBe(false);
    });

    it('debe aceptar URL http genérica como upload', () => {
      expect(isValidVideoUrl('https://www.google.com')).toBe(true);
    });
  });
});
