import type { Editor } from "grapesjs";

/**
 * Deduplicación de componentes idénticos en el Web Creator.
 *
 * Protección contra duplicados añadidos en la misma acción (doble drop, doble
 * pegado, doble guardado del mismo embed). Se ejecuta en cada guardado (manual,
 * publish y autosave) antes de exportar, y como última defensa en el PUT.
 *
 * Estrategia conservadora (para no eliminar repeticiones legítimas):
 *  1. `custom-code` con el mismo código (`custom-code-plugin__code`) — el caso
 *     de producción (embed pegado dos veces).
 *  2. iframes/videos embebidos con atributos idénticos — doble pegado de embeds.
 *  3. Subárboles estructurales no triviales (≥2 elementos con atributos) —
 *     bloque completo añadido dos veces en la misma acción.
 *
 * NUNCA se deduplican: textnodes, imágenes, textos, espaciadores o cualquier
 * elemento hoja, ni subárboles "ligeros" (un solo elemento con atributos, p.ej.
 * campos de firma de documentos) aunque sean idénticos. La comparación es solo
 * entre HERMANOS dentro del mismo padre y exige igualdad byte a byte de la
 * firma canónica (excluye ids auto-generados, que siempre difieren).
 */

/** Props de modelo volátiles que no participan en la firma. */
const IGNORED_TOP_KEYS = new Set(["id", "open", "active", "status"]);
/** Atributos volátiles que no participan en la firma. */
const IGNORED_ATTR_KEYS = new Set(["id"]);

const CODE_PROP = "custom-code-plugin__code";

/** JSON.stringify estable: claves de objetos ordenadas, arrays en orden. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function cleanAttrs(attrs: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (attrs && typeof attrs === "object") {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (IGNORED_ATTR_KEYS.has(k)) continue;
      out[k] = v;
    }
  }
  return out;
}

/** Firma canónica de un nodo de projectData (recursiva sobre `components`). */
export function componentSignature(node: unknown): string {
  if (!node || typeof node !== "object") return stableStringify(node);
  const n = node as Record<string, any>;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (k === "components" || k === "attributes" || IGNORED_TOP_KEYS.has(k)) continue;
    rest[k] = v;
  }
  const children = Array.isArray(n.components) ? n.components.map(componentSignature) : [];
  return stableStringify({
    t: n.type ?? "",
    tag: String(n.tagName ?? "").toLowerCase(),
    a: cleanAttrs(n.attributes),
    r: rest,
    c: children,
  });
}

/** ¿El subárbol tiene peso estructural (≥2 elementos con atributos)? */
function hasStructuralWeight(node: any): boolean {
  let attributed = 0;
  const walk = (n: any): boolean => {
    if (!n || typeof n !== "object") return false;
    const attrs = n.attributes;
    if (attrs && typeof attrs === "object" && Object.keys(attrs).some((k) => !IGNORED_ATTR_KEYS.has(k))) {
      attributed++;
      if (attributed >= 2) return true;
    }
    const kids = n.components;
    if (Array.isArray(kids)) {
      for (const k of kids) {
        if (walk(k)) return true;
      }
    }
    return false;
  };
  return walk(node);
}

/** ¿El subárbol tiene contenido real: texto no vacío o src/href? Protege
 *  layouts con wrappers/columnas vacías repetidas (p.ej. grids flex). */
function subtreeHasContentMarker(node: any): boolean {
  const walk = (n: any): boolean => {
    if (!n || typeof n !== "object") return false;
    const content = typeof n.content === "string" ? n.content : "";
    if (content.trim()) return true;
    const attrs = (n.attributes || {}) as Record<string, unknown>;
    for (const k of ["src", "href"]) {
      const v = attrs[k];
      if (typeof v === "string" && v.trim()) return true;
    }
    const kids = n.components;
    if (Array.isArray(kids)) {
      for (const k of kids) {
        if (walk(k)) return true;
      }
    }
    return false;
  };
  return walk(node);
}

/** ¿Este nodo de projectData es candidato a deduplicación si está duplicado? */
export function isDedupeCandidate(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, any>;
  const type = String(n.type ?? "").toLowerCase();
  const tag = String(n.tagName ?? "").toLowerCase();
  const attrs = (n.attributes && typeof n.attributes === "object" ? n.attributes : {}) as Record<string, unknown>;

  // 1) custom-code (código inline duplicado)
  if (type === "custom-code") return true;
  if (CODE_PROP in attrs) return true;
  if (typeof n[CODE_PROP] === "string") return true;

  // 2) iframes / videos embebidos (doble pegado de embeds)
  if (tag === "iframe" || tag === "video") return true;
  if (type === "video" || type === "iframe" || type === "volkern-video") return true;

  // 3) subárbol estructural no trivial CON contenido real (bloque completo duplicado)
  if (
    Array.isArray(n.components) &&
    n.components.length > 0 &&
    hasStructuralWeight(n) &&
    subtreeHasContentMarker(n)
  ) {
    return true;
  }

  return false;
}

export interface DedupeResult {
  projectData: unknown;
  /** Cantidad de componentes duplicados eliminados. */
  removed: number;
}

/**
 * Elimina hermanos idénticos (firma canónica igual) dentro del mismo padre de un
 * projectData de GrapesJS. Función pura: no muta la entrada. Idempotente.
 */
export function dedupeProjectData(projectData: unknown): DedupeResult {
  const report = { removed: 0 };
  if (!projectData || typeof projectData !== "object") {
    return { projectData, removed: 0 };
  }
  const cleaned = dedupeNode(projectData, report);
  return { projectData: cleaned, removed: report.removed };
}

function dedupeNode(node: any, report: { removed: number }): any {
  if (!node || typeof node !== "object") return node;
  const next = { ...node };

  if (Array.isArray(next.components)) {
    next.components = dedupeSiblings(next.components, report).map((c: any) => dedupeNode(c, report));
  }
  if (Array.isArray(next.pages)) {
    next.pages = next.pages.map((p: any) => dedupeNode(p, report));
  }
  if (Array.isArray(next.frames)) {
    next.frames = next.frames.map((f: any) => dedupeNode(f, report));
  }
  if (next.component && typeof next.component === "object") {
    next.component = dedupeNode(next.component, report);
  }
  return next;
}

function dedupeSiblings(children: any[], report: { removed: number }): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const child of children) {
    if (isDedupeCandidate(child)) {
      const sig = componentSignature(child);
      if (seen.has(sig)) {
        report.removed++;
        continue;
      }
      seen.add(sig);
    }
    result.push(child);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplicación sobre el editor vivo (modelos de GrapesJS)
// ─────────────────────────────────────────────────────────────────────────────

/** Firma canónica de un Component vivo de GrapesJS. */
function liveSignature(comp: any): string {
  const attrs = cleanAttrs(comp.get?.("attributes"));
  const style = (comp.getStyle?.() || {}) as Record<string, unknown>;
  const classes = ((comp.getClasses?.() || []) as any[])
    .map((c) => (typeof c === "string" ? c : c?.getName?.() ?? String(c)))
    .sort();
  const kids: string[] = [];
  comp.components?.().each?.((c: any) => {
    kids.push(liveSignature(c));
  });
  return stableStringify({
    t: comp.get?.("type") || "",
    tag: String(comp.get?.("tagName") || "").toLowerCase(),
    a: attrs,
    s: style,
    cls: classes,
    code: typeof comp.get?.(CODE_PROP) === "string" ? comp.get(CODE_PROP) : null,
    content: comp.get?.("content") ?? null,
    c: kids,
  });
}

function liveHasStructuralWeight(comp: any): boolean {
  let attributed = 0;
  const walk = (c: any): boolean => {
    const attrs = c.get?.("attributes");
    if (attrs && typeof attrs === "object" && Object.keys(attrs).some((k) => !IGNORED_ATTR_KEYS.has(k))) {
      attributed++;
      if (attributed >= 2) return true;
    }
    let found = false;
    c.components?.().each?.((k: any) => {
      if (!found && walk(k)) found = true;
    });
    return found;
  };
  return walk(comp);
}

/** Versión para modelos vivos de subtreeHasContentMarker. */
function liveSubtreeHasContentMarker(comp: any): boolean {
  const walk = (c: any): boolean => {
    const content = c.get?.("content");
    if (typeof content === "string" && content.trim()) return true;
    const attrs = (c.get?.("attributes") || {}) as Record<string, unknown>;
    for (const k of ["src", "href"]) {
      const v = attrs[k];
      if (typeof v === "string" && v.trim()) return true;
    }
    let found = false;
    c.components?.().each?.((k: any) => {
      if (!found && walk(k)) found = true;
    });
    return found;
  };
  return walk(comp);
}

function liveIsCandidate(comp: any): boolean {
  if (!comp?.get) return false;
  const type = String(comp.get("type") || "").toLowerCase();
  const tag = String(comp.get("tagName") || "").toLowerCase();
  const attrs = (comp.get("attributes") || {}) as Record<string, unknown>;

  if (type === "custom-code") return true;
  if (CODE_PROP in attrs) return true;
  if (typeof comp.get(CODE_PROP) === "string") return true;
  if (tag === "iframe" || tag === "video") return true;
  if (type === "video" || type === "iframe" || type === "volkern-video") return true;

  let hasChildren = false;
  comp.components?.().each?.(() => {
    hasChildren = true;
  });
  if (hasChildren && liveHasStructuralWeight(comp) && liveSubtreeHasContentMarker(comp)) return true;

  return false;
}

function containsSelection(comp: any, selected: any): boolean {
  let cur = selected;
  while (cur) {
    if (cur === comp) return true;
    cur = cur.parent?.();
  }
  return false;
}

/**
 * Elimina en el editor vivo los componentes hermanos idénticos (firma canónica
 * igual) antes de exportar, de modo que `getProjectData()` y `getHtml()` salgan
 * limpios y coherentes en el mismo guardado. Si uno del grupo está seleccionado,
 * se conserva el seleccionado y se elimina el otro. Devuelve los eliminados.
 */
export function dedupeEditorComponents(editor: Editor): number {
  const domc = (editor as any).DomComponents;
  const root = domc?.getWrapper?.();
  if (!root) return 0;

  const report = { removed: 0 };
  const selected = editor.getSelected?.() ?? null;
  dedupeLiveLevel(root, report, selected);
  return report.removed;
}

function dedupeLiveLevel(comp: any, report: { removed: number }, selected: any): void {
  const collection = comp.components?.();
  if (!collection?.each) return;

  // Recorrer primero los hijos (dedupe profundo)...
  const children: any[] = [];
  collection.each((c: any) => children.push(c));
  children.forEach((c) => dedupeLiveLevel(c, report, selected));

  // ...y luego deduplicar este nivel (la firma ya es recursiva, da igual el orden)
  const seen = new Map<string, any>(); // firma -> componente conservado
  const toRemove: any[] = [];
  for (const child of children) {
    if (liveIsCandidate(child)) {
      const sig = liveSignature(child);
      const kept = seen.get(sig);
      if (kept) {
        // Preferir conservar el componente que contiene la selección
        if (containsSelection(child, selected) && !containsSelection(kept, selected)) {
          toRemove.push(kept);
          seen.set(sig, child);
        } else {
          toRemove.push(child);
        }
        continue;
      }
      seen.set(sig, child);
    }
  }
  const removedSet = new Set<any>();
  for (const dup of toRemove) {
    if (removedSet.has(dup)) continue;
    removedSet.add(dup);
    try {
      dup.remove();
      report.removed++;
    } catch {
      /* noop: no bloquear el guardado por un remove fallido */
    }
  }
}
