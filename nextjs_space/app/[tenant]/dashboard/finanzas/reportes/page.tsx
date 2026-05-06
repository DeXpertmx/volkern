import GlobalFinancialCockpit from "@/components/hubs/GlobalFinancialCockpit";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reportes P&L | Volkern ERP",
  description: "Análisis detallado de pérdidas, ganancias y rentabilidad real.",
};

export default function FinanzasReportesPage() {
  return <GlobalFinancialCockpit />;
}
