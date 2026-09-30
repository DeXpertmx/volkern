'use client';

/**
 * Mapa Leaflet de la sección Ubicación del editor de hospedaje.
 *
 * Muestra un marcador en (latitud, longitud) —si existen— y deja fijar la
 * ubicación con un clic sobre el mapa o arrastrando el marcador. Se importa
 * SIEMPRE con `dynamic(..., { ssr: false })`: Leaflet necesita `window`
 * (misma convención que los mapas de logística del repo).
 */

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ICONO = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export interface MapaUbicacionProps {
  latitud: number | null;
  longitud: number | null;
  /** Se llama con las coordenadas al hacer clic o soltar el marcador. */
  onMover: (lat: number, lng: number) => void;
}

/** Recentra el mapa cuando las coordenadas cambian desde fuera (geocoding). */
function Recentrar({ latitud, longitud }: { latitud: number | null; longitud: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (latitud != null && longitud != null) {
      map.setView([latitud, longitud], map.getZoom() < 15 ? 16 : map.getZoom());
    }
  }, [latitud, longitud, map]);
  return null;
}

/** El clic del operador fija la ubicación (se redondea a 6 decimales ≈ 11 cm). */
function ClicSobreMapa({ onMover }: { onMover: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMover(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

export default function MapaUbicacion({ latitud, longitud, onMover }: MapaUbicacionProps) {
  const centro = useMemo<[number, number]>(
    () => (latitud != null && longitud != null ? [latitud, longitud] : [40.4168, -3.7038]),
    [latitud, longitud]
  );

  return (
    <div className="relative h-72 w-full">
      <MapContainer
        center={centro}
        zoom={latitud != null ? 16 : 3}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recentrar latitud={latitud} longitud={longitud} />
        <ClicSobreMapa onMover={onMover} />
        {latitud != null && longitud != null && (
          <Marker
            position={[latitud, longitud]}
            icon={ICONO}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const posicion = (e.target as L.Marker).getLatLng();
                onMover(Number(posicion.lat.toFixed(6)), Number(posicion.lng.toFixed(6)));
              },
            }}
          />
        )}
      </MapContainer>
      {latitud == null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-background/90 px-3 py-1 text-xs shadow">
            Pulsa en el mapa para fijar la ubicación
          </span>
        </div>
      )}
    </div>
  );
}
