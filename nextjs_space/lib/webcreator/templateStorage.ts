/**
 * Template Storage Service - API-based replacement for IndexedDB storage
 * Handles template persistence via backend API calls
 */

const API_BASE_URL = "/api/templates";

export interface TemplateRecord {
  idx: string;
  id: string; // user-visible name
  html: string;
  css: string;
  projectData: Record<string, unknown>;
  thumbnail: string;
  category?: string;
  createdAt: number;
}

export interface PaginatedTemplates {
  templates: TemplateRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Save a template to the backend API
 */
export async function saveTemplate(record: TemplateRecord): Promise<void> {
  const response = await fetch(`${API_BASE_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to save template");
  }
}

/**
 * Load templates from the backend API with pagination
 */
export async function loadTemplates(page: number = 1, limit: number = 20): Promise<PaginatedTemplates> {
  const response = await fetch(`${API_BASE_URL}?page=${page}&limit=${limit}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to load templates");
  }

  const data = await response.json();
  
  // Si la API devuelve un array directamente (PageTemplate[]), lo envolvemos y mapeamos
  if (Array.isArray(data)) {
    return {
      templates: data.map((item: any) => ({
        idx: item.id,
        id: item.nombre || item.id,
        html: item.html || '', 
        css: item.css || '',
        projectData: item.contenido || {},
        thumbnail: item.imagenPreview || '',
        category: item.categoria || item.tipo || 'general',
        createdAt: item.fechaCreacion ? new Date(item.fechaCreacion).getTime() : Date.now()
      })),
      total: data.length,
      page: 1,
      limit: data.length,
      hasMore: false
    };
  }

  return data;
}

/**
 * Load all templates from the backend API (for backward compatibility)
 */
export async function loadAllTemplates(): Promise<TemplateRecord[]> {
  const response = await fetch(`${API_BASE_URL}/all`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to load templates");
  }

  const data = await response.json();
  
  if (Array.isArray(data)) {
    return data.map((item: any) => ({
      idx: item.id,
      id: item.nombre || item.id,
      html: item.html || '',
      css: item.css || '',
      projectData: item.contenido || {},
      thumbnail: item.imagenPreview || '',
      createdAt: item.fechaCreacion ? new Date(item.fechaCreacion).getTime() : Date.now()
    }));
  }

  return data;
}

/**
 * Delete a template by its index ID
 */
export async function deleteTemplate(idx: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/${idx}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete template");
  }
}

/**
 * Get a specific template by its ID (user-visible name)
 */
export async function getTemplateById(id: string): Promise<TemplateRecord | null> {
  const response = await fetch(`${API_BASE_URL}/id/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to get template");
  }

  return response.json();
}