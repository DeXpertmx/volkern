import { Editor, Component } from "grapesjs";

// Tipos para la personalización de estilos
export interface StylePreset {
  id: string;
  name: string;
  description: string;
  styles: Record<string, string>;
  category: string;
}

export interface CustomStyle {
  id: string;
  name: string;
  selector: string;
  properties: Record<string, string>;
  createdAt: Date;
}

// Categorías de estilos
export const STYLE_CATEGORIES = [
  { id: 'typography', name: 'Tipografía', icon: '🔤' },
  { id: 'colors', name: 'Colores', icon: '🎨' },
  { id: 'spacing', name: 'Espaciado', icon: '📐' },
  { id: 'effects', name: 'Efectos', icon: '✨' },
  { id: 'layout', name: 'Diseño', icon: '🍱' },
];

// Presets de estilos predeterminados
export const DEFAULT_STYLE_PRESETS: StylePreset[] = [
  {
    id: 'modern-typography',
    name: 'Tipografía Moderna',
    description: 'Fuente limpia y moderna con buen contraste',
    category: 'typography',
    styles: {
      'font-family': "'Inter', sans-serif",
      'font-weight': '400',
      'line-height': '1.6',
      'letter-spacing': '0.01em',
    }
  },
  {
    id: 'brand-colors',
    name: 'Colores de Marca',
    description: 'Paleta de colores corporativos',
    category: 'colors',
    styles: {
      '--primary-color': '#3b82f6',
      '--secondary-color': '#10b981',
      '--accent-color': '#8b5cf6',
      '--text-color': '#1f2937',
      '--bg-color': '#ffffff',
    }
  },
  {
    id: 'shadow-effects',
    name: 'Efectos de Sombra',
    description: 'Sombras sutiles para profundidad',
    category: 'effects',
    styles: {
      '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    }
  },
  {
    id: 'spacing-system',
    name: 'Sistema de Espaciado',
    description: 'Espaciado consistente basado en una escala',
    category: 'spacing',
    styles: {
      '--spacer-1': '0.25rem',
      '--spacer-2': '0.5rem',
      '--spacer-3': '1rem',
      '--spacer-4': '1.5rem',
      '--spacer-5': '3rem',
    }
  },
];

// Servicio para manejar la personalización de estilos
class StyleCustomizationService {
  private stylePresets: StylePreset[] = [...DEFAULT_STYLE_PRESETS];
  private customStyles: CustomStyle[] = [];

  // Obtener todos los presets de estilos
  getAllStylePresets(): StylePreset[] {
    return this.stylePresets;
  }

  // Obtener presets por categoría
  getStylePresetsByCategory(category: string): StylePreset[] {
    return this.stylePresets.filter(preset => preset.category === category);
  }

  // Obtener un preset por ID
  getStylePresetById(id: string): StylePreset | undefined {
    return this.stylePresets.find(preset => preset.id === id);
  }

  // Aplicar un preset de estilos al editor
  applyStylePreset(editor: Editor, presetId: string): boolean {
    const preset = this.getStylePresetById(presetId);
    if (!preset) return false;
    
    try {
      // Aplicar estilos al documento
      const cssRules = Object.entries(preset.styles)
        .map(([prop, value]) => `${prop}: ${value};`)
        .join('\n');
      
      const styleTag = `:root {\n${Object.entries(preset.styles)
        .map(([prop, value]) => `  ${prop}: ${value};`)
        .join('\n')}\n}`;
      
      editor.addStyle(styleTag);
      return true;
    } catch (error) {
      console.error('Error al aplicar el preset de estilos:', error);
      return false;
    }
  }

  // Crear un nuevo preset de estilos
  createStylePreset(preset: Omit<StylePreset, 'id'>): StylePreset {
    const newPreset: StylePreset = {
      ...preset,
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.stylePresets.push(newPreset);
    return newPreset;
  }

  // Obtener todos los estilos personalizados
  getAllCustomStyles(): CustomStyle[] {
    return this.customStyles;
  }

  // Crear un estilo personalizado
  createCustomStyle(name: string, selector: string, properties: Record<string, string>): CustomStyle {
    const newStyle: CustomStyle = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      selector,
      properties,
      createdAt: new Date(),
    };
    
    this.customStyles.push(newStyle);
    
    // Aplicar estilo al editor
    const cssRule = `${selector} {\n${Object.entries(properties)
      .map(([prop, value]) => `  ${prop}: ${value};`)
      .join('\n')}\n}`;
    
    return newStyle;
  }

  // Aplicar un estilo personalizado al editor
  applyCustomStyle(editor: Editor, styleId: string): boolean {
    const customStyle = this.customStyles.find(style => style.id === styleId);
    if (!customStyle) return false;
    
    try {
      const cssRule = `${customStyle.selector} {\n${Object.entries(customStyle.properties)
        .map(([prop, value]) => `  ${prop}: ${value};`)
        .join('\n')}\n}`;
      
      editor.addStyle(cssRule);
      return true;
    } catch (error) {
      console.error('Error al aplicar el estilo personalizado:', error);
      return false;
    }
  }

  // Obtener estilos aplicables a un componente específico
  getComponentStyles(editor: Editor, component: Component): Record<string, string> {
    const styles: Record<string, string> = {};
    
    // Obtener clases del componente
    const classes = component.getClasses();
    
    // Buscar reglas CSS que coincidan con las clases
    const allRules = editor.Css.getAll();
    
    allRules.forEach((rule: any) => {
      const selectors = rule.selectorsToString ? rule.selectorsToString() : '';
      
      // Verificar si alguna clase del componente coincide con los selectores
      const matches = classes.some((cls: string) => 
        selectors === `.${cls}` || selectors.includes(`.${cls}`)
      );
      
      if (matches && rule.getStyle) {
        Object.assign(styles, rule.getStyle());
      }
    });
    
    return styles;
  }
}

// Instancia singleton del servicio
export const styleCustomizationService = new StyleCustomizationService();