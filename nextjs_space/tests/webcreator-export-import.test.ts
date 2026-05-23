import { describe, it, expect } from 'vitest';
import { exportImportService, type ExportedProject, type ExportOptions } from '@/components/webcreator/export-import/exportImportService';

// Accedemos a métodos privados via casting para tests unitarios

describe('WebCreator — ExportImportService', () => {
  describe('minifyHTML (private)', () => {
    const minifyHTML = (html: string): string =>
      (exportImportService as any).minifyHTML(html);

    it('debe colapsar espacios múltiples en uno solo', () => {
      const input = '<div>   Hello   World   </div>';
      const output = minifyHTML(input);
      expect(output).toBe('<div> Hello World </div>');
    });

    it('debe eliminar saltos de línea y tabs', () => {
      const input = '<div>\n\t<span>Text</span>\n</div>';
      const output = minifyHTML(input);
      expect(output).toBe('<div> <span>Text</span> </div>');
    });

    it('debe hacer trim del resultado', () => {
      expect(minifyHTML('  <p>Hi</p>  ')).toBe('<p>Hi</p>');
    });

    it('debe manejar HTML vacío', () => {
      expect(minifyHTML('')).toBe('');
      expect(minifyHTML('   ')).toBe('');
    });
  });

  describe('minifyCSS (private)', () => {
    const minifyCSS = (css: string): string =>
      (exportImportService as any).minifyCSS(css);

    it('debe colapsar espacios y eliminar espacios alrededor de delimitadores', () => {
      const input = 'body { color: red ; font-size: 16px ; }';
      const output = minifyCSS(input);
      expect(output).toBe('body{color:red;font-size:16px;}');
    });

    it('debe manejar CSS multilinea', () => {
      const input = `.card {\n  padding: 1rem;\n  margin: 0.5rem;\n}`;
      const output = minifyCSS(input);
      expect(output).toBe('.card{padding:1rem;margin:0.5rem;}');
    });

    it('debe manejar CSS vacío', () => {
      expect(minifyCSS('')).toBe('');
      expect(minifyCSS('   ')).toBe('');
    });
  });

  describe('exportAsJSON (private)', () => {
    const exportAsJSON = (project: ExportedProject): string =>
      (exportImportService as any).exportAsJSON(project);

    it('debe serializar un proyecto a JSON con formato', () => {
      const project: ExportedProject = {
        metadata: {
          name: 'Test',
          description: 'A test project',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          generator: 'Test Generator',
        },
        data: { blocks: [{ type: 'text' }] },
        assets: [],
        styles: 'body{color:red}',
        scripts: '',
      };

      const json = exportAsJSON(project);
      const parsed = JSON.parse(json);
      expect(parsed.metadata.name).toBe('Test');
      expect(parsed.metadata.version).toBe('1.0.0');
      expect(parsed.data.blocks).toHaveLength(1);
      expect(parsed.styles).toBe('body{color:red}');
      expect(parsed.assets).toEqual([]);
    });

    it('debe usar indentación de 2 espacios', () => {
      const project: ExportedProject = {
        metadata: { name: 'X', description: '', version: '1', exportedAt: '2024-01-01', generator: 'G' },
        data: {},
        assets: [],
        styles: '',
        scripts: '',
      };
      const json = exportAsJSON(project);
      expect(json).toContain('\n  ');
    });
  });

  describe('exportAsHTML (private)', () => {
    const exportAsHTML = (project: ExportedProject, htmlContent: string): string =>
      (exportImportService as any).exportAsHTML(project, htmlContent);

    it('debe generar un HTML completo con estilos y título', () => {
      const project: ExportedProject = {
        metadata: {
          name: 'Mi Página',
          description: '',
          version: '1',
          exportedAt: '2024-01-01',
          generator: 'Test',
        },
        data: {},
        assets: [],
        styles: 'body{margin:0}',
        scripts: 'console.log(1)',
      };

      const html = exportAsHTML(project, '<h1>Hola</h1>');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Mi Página</title>');
      expect(html).toContain('body{margin:0}');
      expect(html).toContain('<h1>Hola</h1>');
      expect(html).toContain('<script>console.log(1)</script>');
    });

    it('no debe incluir script si scripts está vacío', () => {
      const project: ExportedProject = {
        metadata: { name: 'X', description: '', version: '1', exportedAt: '2024-01-01', generator: 'G' },
        data: {},
        assets: [],
        styles: '',
        scripts: '',
      };
      const html = exportAsHTML(project, '<p>Test</p>');
      expect(html).not.toContain('<script>');
    });
  });

  describe('generatePreview', () => {
    it('debe generar un HTML de preview con contenedor', () => {
      const mockEditor = {
        getHtml: () => '<div>Content</div>',
        getCss: () => 'p{color:green}',
      } as any;

      const preview = exportImportService.generatePreview(mockEditor);
      expect(preview).toContain('<!DOCTYPE html>');
      expect(preview).toContain('preview-container');
      expect(preview).toContain('p{color:green}');
      expect(preview).toContain('<div>Content</div>');
    });

    it('debe manejar HTML y CSS vacíos', () => {
      const mockEditor = {
        getHtml: () => '',
        getCss: () => '',
      } as any;

      const preview = exportImportService.generatePreview(mockEditor);
      expect(preview).toContain('<!DOCTYPE html>');
      expect(preview).toContain('preview-container');
    });
  });
});
