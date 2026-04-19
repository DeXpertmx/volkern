'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para los iconos de Leaflet en Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
  activeTechs: any[];
}

export default function MapComponent({ activeTechs }: MapComponentProps) {
  return (
    <MapContainer 
      center={[36.7213, -4.4214]} 
      zoom={13} 
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {activeTechs.map(tech => (
        <Marker key={tech.id} position={[tech.lat, tech.lng]}>
          <Popup>
            <div className="p-1">
              <div className="font-bold text-sm">{tech.technician}</div>
              <div className="text-xs text-muted-foreground">{tech.role}</div>
              <div className="mt-1 text-[10px] bg-primary/10 text-primary px-1 rounded inline-block">
                Check-in: {new Date(tech.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
