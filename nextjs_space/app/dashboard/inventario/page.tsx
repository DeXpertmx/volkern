import InventarioDashboard from "@/components/hubs/InventarioDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventario | Volkern ERP",
  description: "Dashboard de gestión de existencias y logística multi-almacén.",
};

export default function InventarioPage() {
  return <InventarioDashboard />;
}
