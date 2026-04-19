'use client'

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, AlertTriangle, MapPin, Copy, Link as LinkIcon, Database } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import * as Toast from '@radix-ui/react-toast';
import dynamic from 'next/dynamic';

// Importar el mini mapa de forma dinámica
const MiniMap = dynamic(
  () => import('@/components/sovereignty/mini-map-component'),
  { ssr: false, loading: () => <div className="w-full h-full bg-muted animate-pulse" /> }
);

interface IntegrityNode {
  id: string;
  type: 'INVOICE' | 'EXPENSE';
  title: string;
  amount: number;
  date: string;
  fingerprint: string;
  parentFingerprint: string;
  lat: number | null;
  lng: number | null;
  isAnomaly: boolean;
}

export function IntegrityGraph() {
  const [nodes, setNodes] = useState<IntegrityNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const fetchChain = async () => {
      try {
        const response = await fetch('/api/v1/sovereignty/integrity-chain');
        const data = await response.json();
        if (data.success) setNodes(data.chain);
      } catch (e) {
        console.error('Error fetching chain:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchChain();
  }, []);

  const copyHash = (hash: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(hash);
      setShowToast(true);
    }
  };

  if (isLoading) return <div className="h-96 flex items-center justify-center animate-pulse bg-muted/20 rounded-lg">Analizando cadena de bloques...</div>;

  return (
    <Toast.Provider swipeDirection="right">
      <Card className="h-full flex flex-col bg-background/80 backdrop-blur-sm border-primary/20 overflow-hidden">
        <CardHeader className="drag-handle shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Integrity Graph (ERP Finance)
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground opacity-50" />
          </div>
          <CardDescription>Auditoría forense de la cadena de inmutabilidad financiera</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto pr-4 scrollbar-thin">
          <div className="relative flex flex-col gap-12 py-4 items-center">
            {/* SVG Layer for Connections */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              {nodes.map((node, i) => {
                if (i === nodes.length - 1) return null;
                const nextNode = nodes[i + 1];
                const isBreach = node.parentFingerprint !== nextNode.fingerprint;
                
                return (
                  <motion.path
                    key={`path-${node.id}`}
                    d={`M 152,${(i * 120) + 100} L 152,${((i + 1) * 120) + 40}`}
                    stroke={isBreach ? "#ef4444" : "#22c55e"}
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 1, delay: i * 0.1 }}
                  />
                );
              })}
            </svg>

            {/* Nodes */}
            {nodes.map((node, i) => {
              const prevNode = i > 0 ? nodes[i - 1] : null;
              const isBreach = prevNode && prevNode.parentFingerprint !== node.fingerprint;

              return (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative z-10 w-full max-w-sm p-4 rounded-xl border bg-card/50 backdrop-blur-md shadow-sm transition-all hover:shadow-lg ${
                    isBreach ? 'border-destructive' : 'border-primary/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {node.type === 'INVOICE' ? <LinkIcon className="h-4 w-4 text-blue-400" /> : <Database className="h-4 w-4 text-purple-400" />}
                      <span className="text-sm font-semibold truncate max-w-[150px]">{node.title}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isBreach ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'}`}>
                      {node.fingerprint?.substring(0, 8) || 'NO-HASH'}
                    </span>
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xl font-bold">€{node.amount.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(node.date).toLocaleString()}</div>
                    </div>
                    
                    <div className="flex gap-2">
                      {node.lat && (
                        <Popover.Root>
                          <Popover.Trigger asChild>
                            <button className={`p-1.5 rounded-md hover:bg-muted ${node.isAnomaly ? 'text-destructive animate-pulse' : 'text-primary'}`}>
                              <MapPin className="h-4 w-4" />
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content className="z-50 w-48 h-48 bg-card rounded-lg border shadow-xl p-1" sideOffset={5}>
                              <MiniMap lat={node.lat} lng={node.lng!} />
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      )}

                      <button onClick={() => copyHash(node.fingerprint)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      <Toast.Root open={showToast} onOpenChange={setShowToast} className="bg-primary text-primary-foreground p-3 rounded-lg shadow-2xl flex items-center justify-between">
        <Toast.Description className="text-xs">Hash copiado al portapapeles.</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100]" />
    </Toast.Provider>
  );
}
