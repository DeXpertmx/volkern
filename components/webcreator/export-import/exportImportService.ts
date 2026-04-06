import { Editor } from "grapesjs";

// Tipos para la exportación/importación
export interface ExportOptions {
  format: 'json' | 'html' | 'zip';
  includeAssets: boolean;
  includeStyles: boolean;
  includeScripts: boolean;
  minify: boolean;
  templateName?: string;
  templateDescription?: string;
}

export interface ImportOptions {
  format: 'json' | 'html';
  mergeMode: 'replace' | 'append' | 'merge';
  preserveStyles: boolean;
  preserveAssets: boolean;
}

export interface ExportedProject {
  metadata: {
    name: string;
    description: string;
    version: string;
    exportedAt: string;
    generator: string;
  };
  data: Record<string, unknown>;
  assets: Array<{
    id: string;
    name: string;
    type: string;
    content: string; // base64 encoded
    url?: string;
  }>;
  styles: string;
  scripts: string;
}

// Servicio para manejar la exportación e importación mejorada
class ExportImportService {
  // Exportar proyecto en diferentes formatos
  async exportProject(editor: Editor, options: ExportOptions): Promise<Blob | string> {
    try {
      // Obtener datos del proyecto
      const projectData = editor.getProjectData() as Record<string, unknown>;
      
      // Obtener HTML y CSS
      let htmlContent = editor.getHtml() || '';
      let cssContent = editor.getCss() || '';
      
      // Minificar si es necesario
      if (options.minify) {
        htmlContent = this.minifyHTML(htmlContent);
        cssContent = this.minifyCSS(cssContent);
      }
      
      // Obtener assets si es necesario
      let assets: ExportedProject['assets'] = [];
      if (options.includeAssets) {
        assets = this.extractAssets(editor);
      }
      
      // Crear objeto exportado
      const exportedProject: ExportedProject = {
        metadata: {
          name: options.templateName || 'Proyecto Webcreator',
          description: options.templateDescription || 'Proyecto exportado desde Webcreator',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          generator: 'Webcreator Export Service v1.0'
        },
        data: projectData,
        assets,
        styles: options.includeStyles ? cssContent : '',
        scripts: options.includeScripts ? this.extractScripts(editor) : ''
      };
      
      // Exportar según el formato seleccionado
      switch (options.format) {
        case 'json':
          return this.exportAsJSON(exportedProject);
        case 'html':
          return this.exportAsHTML(exportedProject, htmlContent);
        case 'zip':
          return this.exportAsZIP(exportedProject, htmlContent);
        default:
          throw new Error('Formato de exportación no soportado');
      }
    } catch (error) {
      console.error('Error al exportar el proyecto:', error);
      throw error;
    }
  }
  
  // Importar proyecto
  async importProject(editor: Editor, file: File, options: ImportOptions): Promise<boolean> {
    try {
      switch (options.format) {
        case 'json':
          return await this.importFromJSON(editor, file, options);
        case 'html':
          return await this.importFromHTML(editor, file, options);
        default:
          throw new Error('Formato de importación no soportado');
      }
    } catch (error) {
      console.error('Error al importar el proyecto:', error);
      throw error;
    }
  }
  
  // Exportar como JSON
  private exportAsJSON(project: ExportedProject): string {
    return JSON.stringify(project, null, 2);
  }
  
  // Exportar como HTML completo
  private exportAsHTML(project: ExportedProject, htmlContent: string): string {
    const fullHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.metadata.name}</title>
    <style>
        ${project.styles}
    </style>
</head>
<body>
    ${htmlContent}
    ${project.scripts ? `<script>${project.scripts}</script>` : ''}
</body>
</html>`;
    
    return fullHTML;
  }
  
  // Exportar como ZIP (simulado - en una implementación real usaríamos una librería como JSZip)
  private async exportAsZIP(project: ExportedProject, htmlContent: string): Promise<Blob> {
    // En una implementación real, aquí crearíamos un archivo ZIP con:
    // - index.html (con el contenido HTML)
    // - styles.css (si se incluyen estilos)
    // - scripts.js (si se incluyen scripts)
    // - assets/ (directorio con los assets)
    // - project.json (datos del proyecto para reimportación)
    
    // Por ahora retornamos un blob con el JSON
    const jsonContent = this.exportAsJSON(project);
    return new Blob([jsonContent], { type: 'application/json' });
  }
  
  // Importar desde JSON
  private async importFromJSON(editor: Editor, file: File, options: ImportOptions): Promise<boolean> {
    try {
      const text = await file.text();
      const project: ExportedProject = JSON.parse(text);
      
      // Manejar según el modo de merge
      switch (options.mergeMode) {
        case 'replace':
          editor.loadProjectData(project.data);
          break;
        case 'append':
          // En una implementación completa, aquí agregaríamos el contenido al proyecto existente
          editor.loadProjectData(project.data);
          break;
        case 'merge':
          // En una implementación completa, aquí fusionaríamos selectivamente
          editor.loadProjectData(project.data);
          break;
      }
      
      // Restaurar estilos si es necesario
      if (options.preserveStyles && project.styles) {
        editor.addStyle(project.styles);
      }
      
      return true;
    } catch (error) {
      console.error('Error al importar desde JSON:', error);
      return false;
    }
  }
  
  // Importar desde HTML
  private async importFromHTML(editor: Editor, file: File, options: ImportOptions): Promise<boolean> {
    try {
      const htmlContent = await file.text();
      
      // En una implementación completa, aquí parsearíamos el HTML y lo convertiríamos en componentes de GrapesJS
      // Por ahora simulamos cargando contenido básico
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Extraer body content
      const bodyContent = doc.body.innerHTML;
      
      // Crear un componente básico con el contenido
      if (options.mergeMode === 'replace') {
        editor.setComponents(bodyContent);
      } else {
        editor.addComponents(bodyContent);
      }
      
      return true;
    } catch (error) {
      console.error('Error al importar desde HTML:', error);
      return false;
    }
  }
  
  // Extraer assets del editor
  private extractAssets(editor: Editor): ExportedProject['assets'] {
    // En una implementación completa, aquí extraeríamos los assets del editor
    // Por ahora retornamos un array vacío
    return [];
  }
  
  // Extraer scripts del editor
  private extractScripts(editor: Editor): string {
    // En una implementación completa, aquí extraeríamos los scripts del editor
    // Por ahora retornamos un string vacío
    return '';
  }
  
  // Minificar HTML
  private minifyHTML(html: string): string {
    return html.replace(/\s+/g, ' ').trim();
  }
  
  // Minificar CSS
  private minifyCSS(css: string): string {
    return css.replace(/\s+/g, ' ').replace(/\s*([{;:,}])\s*/g, '$1').trim();
  }
  
  // Generar vista previa del proyecto
  generatePreview(editor: Editor): string {
    const html = editor.getHtml() || '';
    const css = editor.getCss() || '';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <style>${css}</style>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .preview-container { max-width: 1200px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="preview-container">
        ${html}
    </div>
</body>
</html>`;
  }
}

// Instancia singleton del servicio
export const exportImportService = new ExportImportService();