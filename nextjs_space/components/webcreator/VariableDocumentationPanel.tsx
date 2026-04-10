"use client";

import React from "react";
import { 
  Info, 
  User, 
  Building2, 
  Calendar, 
  FileText, 
  Table, 
  Calculator,
  GraduationCap
} from "lucide-react";

interface VariableItem {
  token: string;
  description: string;
  example: string;
}

interface VariableGroup {
  title: string;
  icon: React.ReactNode;
  variables: VariableItem[];
}

export const VariableDocumentationPanel: React.FC = () => {
  const groups: VariableGroup[] = [
    {
      title: "Cliente / Lead",
      icon: <User className="h-4 w-4" />,
      variables: [
        { token: "{{lead.nombre}}", description: "Nombre completo del cliente", example: "Juan Pérez" },
        { token: "{{lead.email}}", description: "Correo electrónico principal", example: "juan@ejemplo.com" },
        { token: "{{lead.telefono}}", description: "Teléfono de contacto", example: "+52 55..." },
        { token: "{{lead.empresa}}", description: "Empresa del cliente", example: "Corporativo S.A." },
      ]
    },
    {
      title: "Tu Empresa",
      icon: <Building2 className="h-4 w-4" />,
      variables: [
        { token: "{{empresa.nombre}}", description: "Nombre de tu organización", example: "Mi Empresa S.A." },
        { token: "{{empresa.direccion}}", description: "Dirección fiscal", example: "Av. Reforma 123..." },
        { token: "{{empresa.rfc}}", description: "Identificación fiscal/RFC", example: "ABC123456XYZ" },
      ]
    },
    {
      title: "Contrato / Documento",
      icon: <FileText className="h-4 w-4" />,
      variables: [
        { token: "{{contrato.numero}}", description: "Folio o número de documento", example: "CON-2024-001" },
        { token: "{{contrato.titulo}}", description: "Título asignado al contrato", example: "Contrato de Servicios" },
        { token: "{{fecha.hoy}}", description: "Fecha actual formateada", example: "10 de Abril, 2024" },
      ]
    },
    {
      title: "Tablas y Totales",
      icon: <Table className="h-4 w-4" />,
      variables: [
        { token: "{{items.tabla}}", description: "Inserta la tabla completa de productos", example: "[Tabla]" },
        { token: "{{totales.subtotal}}", description: "Suma antes de impuestos", example: "$1,000.00" },
        { token: "{{totales.iva}}", description: "Monto de impuestos (16%)", example: "$160.00" },
        { token: "{{totales.total}}", description: "Monto final con impuestos", example: "$1,160.00" },
      ]
    },
    {
      title: "Academia",
      icon: <GraduationCap className="h-4 w-4" />,
      variables: [
        { token: "{{curso.titulo}}", description: "Nombre del curso realizado", example: "Master en Ventas" },
        { token: "{{estudiante.nombre}}", description: "Nombre del alumno", example: "Juan Pérez" },
        { token: "{{estudiante.folio}}", description: "Folio de certificación", example: "CERT-9922" },
      ]
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950">
      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/50">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-1">
          <Info size={16} />
          <span className="font-bold text-sm uppercase">Guía de Variables</span>
        </div>
        <p className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80">
          Copia estas etiquetas en cualquier bloque de texto. Se reemplazarán automáticamente al generar el PDF.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100 dark:border-slate-800">
              <div className="text-gray-400">{group.icon}</div>
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                {group.title}
              </h3>
            </div>
            
            <div className="space-y-2">
              {group.variables.map((v, i) => (
                <div 
                  key={i} 
                  className="group p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(v.token);
                    alert(`Copiado: ${v.token}`);
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
                      {v.token}
                    </code>
                    <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Clic para copiar</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{v.description}</p>
                  <p className="text-[10px] text-gray-400 italic mt-0.5">Ej: {v.example}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-2xl flex gap-3">
            <Calculator className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase mb-1">Nota sobre Totales</p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                    Las variables de totales solo funcionan si el documento tiene una tabla de productos vinculada.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
