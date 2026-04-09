"use client";

import { Render, type Data } from "@measured/puck";
import { puckConfig } from "@/lib/puck/puck-config";

interface PuckRendererProps {
  data: Data;
}

/**
 * Renderizador de contenido Puck para páginas públicas
 */
export function PuckRenderer({ data }: PuckRendererProps) {
  return (
    <Render config={puckConfig} data={data} />
  );
}
