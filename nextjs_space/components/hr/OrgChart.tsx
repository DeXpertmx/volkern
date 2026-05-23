'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { 
  Node, 
  Edge, 
  Background, 
  Controls, 
  Handle, 
  Position,
  ConnectionLineType,
  useNodesState,
  useEdgesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users, Loader2, ZoomIn, ZoomOut, Maximize, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Componente Personalizado para el Nodo del Empleado
const EmployeeNode = ({ data }: { data: any }) => {
  const { config } = data;
  const primaryColor = config?.badge?.primaryColor || '#0f172a';
  const secondaryColor = config?.badge?.secondaryColor || '#3b82f6';

  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-300 border-2 border-white" />
      
      <Card className="w-64 rounded-3xl border-none shadow-2xl bg-white overflow-hidden ring-1 ring-slate-100 hover:ring-primary/50 transition-all">
        <div 
          className="h-2 w-full" 
          style={{ backgroundColor: primaryColor }} 
        />
        <div className="p-4 flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-12 w-12 rounded-xl border-2 border-white shadow-lg">
              <AvatarImage src={data.image} />
              <AvatarFallback className="bg-slate-100 text-slate-500 font-bold uppercase text-xs">
                {data.fullName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div 
              className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white shadow-sm" 
              style={{ backgroundColor: secondaryColor }}
            />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-sm font-black text-slate-900 truncate">{data.fullName}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{data.role}</p>
          </div>
        </div>
        <div className="px-4 pb-4 flex justify-between items-center">
           <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-slate-100 bg-slate-50">
             {data.department || 'GENERAL'}
           </Badge>
           <button className="h-6 w-6 rounded-lg bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Search className="w-3 h-3 text-slate-400" />
           </button>
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-300 border-2 border-white" />
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode
}

export function OrgChart() {
  const { data: employees, isLoading } = useSWR('/api/erp/hr/org-chart', fetcher)
  const { data: hrConfig } = useSWR('/api/erp/hr/config', fetcher)
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [searchTerm, setSearchTerm] = useState('')

  // Algoritmo de Layout Simple (Tree)
  const getLayoutedElements = useCallback((emps: any[]) => {
    if (!emps || emps.length === 0) return { nodes: [], edges: [] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // Agrupar por manager
    const byManager: Record<string, any[]> = {};
    const roots: any[] = [];

    emps.forEach(emp => {
      if (!emp.managerId) {
        roots.push(emp);
      } else {
        if (!byManager[emp.managerId]) byManager[emp.managerId] = [];
        byManager[emp.managerId].push(emp);
      }
    });

    const HORIZONTAL_SPACING = 300;
    const VERTICAL_SPACING = 150;

    const currentX = 0;

    const traverse = (emp: any, level: number, xOffset: number) => {
      const children = byManager[emp.id] || [];
      const nodeX = xOffset;
      const nodeY = level * VERTICAL_SPACING;

      nodes.push({
        id: emp.id,
        type: 'employee',
        position: { x: nodeX, y: nodeY },
        data: { 
          fullName: emp.fullName, 
          role: emp.role, 
          department: emp.department,
          image: emp.user?.image,
          config: hrConfig
        }
      });

      if (children.length > 0) {
        const totalWidth = (children.length - 1) * HORIZONTAL_SPACING;
        let startX = nodeX - totalWidth / 2;

        children.forEach(child => {
          edges.push({
            id: `e-${emp.id}-${child.id}`,
            source: emp.id,
            target: child.id,
            type: ConnectionLineType.SmoothStep,
            animated: true,
            style: { stroke: '#cbd5e1', strokeWidth: 2 }
          });
          traverse(child, level + 1, startX);
          startX += HORIZONTAL_SPACING;
        });
      }
    };

    roots.forEach((root, idx) => {
      traverse(root, 0, idx * 800); // Espaciado mayor entre raíces
    });

    return { nodes, edges };
  }, [hrConfig]);

  useEffect(() => {
    if (employees) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(employees);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [employees, getLayoutedElements, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="h-[600px] w-full flex flex-col items-center justify-center bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Generando Organigrama Forense...</p>
      </div>
    )
  }

  return (
    <div className="h-[700px] w-full relative rounded-[3rem] overflow-hidden border border-slate-100 shadow-2xl bg-slate-50/30">
      {/* Overlay de Control */}
      <div className="absolute top-8 left-8 z-50 space-y-4">
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2rem] shadow-xl border border-white flex items-center gap-6">
           <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Estructura de Soberanía</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Jerarquía de Mando y Control</p>
              </div>
           </div>
           
           <div className="h-10 w-px bg-slate-100" />

           <div className="relative w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por nombre o rol..." 
                className="pl-11 h-12 rounded-2xl border-slate-100 bg-slate-50/50 text-xs font-bold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
        </div>
      </div>

      {/* Mini Mapa / Info */}
      <div className="absolute bottom-8 right-8 z-50">
        <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-white/10 flex items-center gap-4 text-white">
           <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizado</span>
           </div>
           <div className="h-4 w-px bg-white/10" />
           <p className="text-[9px] font-bold opacity-60">
             Dimension eXpert v4.0 • {employees?.length || 0} Efectivos
           </p>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        className="bg-dot-slate-200"
      >
        <Background color="#f1f5f9" gap={20} />
        <Controls 
          className="m-8 !bg-white !border-none !shadow-xl !rounded-2xl overflow-hidden" 
          showInteractive={false}
        />
      </ReactFlow>

      <style jsx global>{`
        .react-flow__controls-button {
          border-bottom: 1px solid #f1f5f9 !important;
          width: 40px !important;
          height: 40px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .react-flow__controls-button:last-child {
          border-bottom: none !important;
        }
        .react-flow__edge-path {
          stroke-dasharray: 5;
          animation: dash 20s linear infinite;
        }
        @keyframes dash {
          from {
            stroke-dashoffset: 500;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  )
}
