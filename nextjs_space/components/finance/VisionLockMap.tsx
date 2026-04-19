'use client'

import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect } from 'react'

// Fix for default marker icons in Leaflet with Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

L.Marker.prototype.options.icon = DefaultIcon

interface VisionLockMapProps {
  exifLat: number
  exifLng: number
  baseLat: number
  baseLng: number
  distance: number
}

export default function VisionLockMap({ exifLat, exifLng, baseLat, baseLng, distance }: VisionLockMapProps) {
  return (
    <MapContainer 
      center={[exifLat, exifLng]} 
      zoom={15} 
      style={{ height: '300px', width: '100%', borderRadius: '12px', zIndex: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      {/* Marker for EXIF Location */}
      <Marker position={[exifLat, exifLng]}>
        <Popup>
          <div className="text-xs font-bold font-sans uppercase">Ubicación Ticket</div>
          <div className="text-[10px] text-muted-foreground tracking-tight">Coordenadas EXIF: {exifLat.toFixed(5)}, {exifLng.toFixed(5)}</div>
        </Popup>
      </Marker>

      {/* Marker for Base/Warehouse Location */}
      <Marker position={[baseLat, baseLng]} icon={L.icon({ ...DefaultIcon.options, iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png' })}>
        <Popup>
          <div className="text-xs font-bold font-sans uppercase">Ubicación Almacén</div>
          <div className="text-[10px] text-muted-foreground tracking-tight">Base Registrada: {baseLat.toFixed(5)}, {baseLng.toFixed(5)}</div>
        </Popup>
      </Marker>

      {/* Circle representing the 500m threshold */}
      <Circle 
        center={[baseLat, baseLng]} 
        radius={500} 
        pathOptions={{ color: 'rgba(59, 130, 246, 0.2)', fillColor: 'rgba(59, 130, 246, 0.1)' }} 
      />

      {/* Line between points (optional) */}
    </MapContainer>
  )
}
