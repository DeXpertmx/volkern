declare module '@changey/react-leaflet-markercluster' {
  import { ComponentType, ReactNode } from 'react'

  interface MarkerClusterGroupProps {
    children?: ReactNode
    chunkedLoading?: boolean
    maxClusterRadius?: number
    spiderfyOnMaxZoom?: boolean
    showCoverageOnHover?: boolean
    disableClusteringAtZoom?: number
    [key: string]: unknown
  }

  const MarkerClusterGroup: ComponentType<MarkerClusterGroupProps>
  export default MarkerClusterGroup
}
