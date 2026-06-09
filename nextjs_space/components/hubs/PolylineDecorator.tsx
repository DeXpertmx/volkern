'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-polylinedecorator'

interface PolylineDecoratorProps {
  positions: [number, number][]
  patterns?: L.PolylineDecoratorPattern[]
  color?: string
}

/**
 * Componente PolylineDecorator para react-leaflet v4
 * Envuelve L.polylineDecorator de leaflet-polylinedecorator
 * para añadir flechas de dirección sobre las rutas del mapa.
 */
export default function PolylineDecorator({
  positions,
  patterns,
  color = '#3b82f6',
}: PolylineDecoratorProps) {
  const map = useMap()

  useEffect(() => {
    if (!map || positions.length < 2) return

    const defaultPatterns: L.PolylineDecoratorPattern[] = [
      {
        offset: '15%',
        repeat: '30%',
        symbol: L.Symbol.arrowHead({
          pixelSize: 10,
          polygon: false,
          pathOptions: {
            stroke: true,
            color,
            weight: 2,
            opacity: 0.7,
          },
        }),
      },
    ]

    const decorator = L.polylineDecorator(positions, {
      patterns: patterns || defaultPatterns,
    }).addTo(map)

    return () => {
      map.removeLayer(decorator)
    }
  }, [map, positions, patterns, color])

  return null
}
