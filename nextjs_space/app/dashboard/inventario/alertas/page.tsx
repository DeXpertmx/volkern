import InventarioDashboard from "@/components/hubs/InventarioDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alertas de Reposición | Volkern ERP",
  description: "Monitoreo de stock crítico y predicciones de ruptura de inventario.",
};

export default function InventarioAlertasPage() {
  return <InventarioDashboard />;
}
