/**
 * El trigger REAL de una automatización vive en el nodo trigger del canvas
 * (flowData.nodes[].type === 'trigger'). La columna `trigger` es una copia
 * desnormalizada que el builder puede desincronizar cuando guarda con estado
 * viejo del cliente. Este helper devuelve siempre el trigger del nodo,
 * cayendo al valor de la columna solo si el nodo no lo define.
 */
export function getTriggerFromFlow(flowData: unknown, fallback?: string): string {
  const nodes = (flowData as any)?.nodes
  if (Array.isArray(nodes)) {
    const triggerNode = nodes.find((n: any) => n?.type === 'trigger')
    const nodeTrigger = triggerNode?.data?.trigger
    if (typeof nodeTrigger === 'string' && nodeTrigger.trim()) {
      return nodeTrigger
    }
  }
  return fallback || 'manual'
}
