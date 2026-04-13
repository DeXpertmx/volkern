import ProyectosDashboard from "@/components/hubs/ProyectosDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Proyectos | Volkern ERP",
  description: "Dashboard de gestión operativa, hitos y rentabilidad estratégica.",
};

export default function ProyectosPage() {
  return <ProyectosDashboard />;
}
