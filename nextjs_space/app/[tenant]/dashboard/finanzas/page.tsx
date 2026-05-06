import FinanzasDashboard from "@/components/hubs/FinanzasDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Finanzas | Volkern ERP",
  description: "Dashboard financiero de Volkern para control de gastos y rentabilidad.",
};

export default function FinanzasPage() {
  return <FinanzasDashboard />;
}
