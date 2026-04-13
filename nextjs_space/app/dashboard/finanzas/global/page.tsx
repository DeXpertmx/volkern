import GlobalFinancialCockpit from "@/components/hubs/GlobalFinancialCockpit";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Global Cockpit | Volkern ERP",
  description: "Consolidación financiera estratégica y proyecciones de flujo de caja.",
};

export default function GlobalCockpitPage() {
  return <GlobalFinancialCockpit />;
}
