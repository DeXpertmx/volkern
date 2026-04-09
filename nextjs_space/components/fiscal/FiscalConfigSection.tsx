'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator } from 'lucide-react';
import TasasImpuestoTab from './TasasImpuestoTab';
import EmisoresFiscalesTab from './EmisoresFiscalesTab';
import PerfilesFiscalesTab from './PerfilesFiscalesTab';

export default function FiscalConfigSection() {
  const [activeSubTab, setActiveSubTab] = useState('tasas');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Configuración Fiscal
          </CardTitle>
          <CardDescription>
            Gestiona tasas de impuesto, entidades emisoras y perfiles fiscales de clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="tasas">Tasas de Impuesto</TabsTrigger>
              <TabsTrigger value="emisores">Emisores Fiscales</TabsTrigger>
              <TabsTrigger value="perfiles">Perfiles de Cliente</TabsTrigger>
            </TabsList>

            <TabsContent value="tasas">
              <TasasImpuestoTab onUpdate={() => {}} />
            </TabsContent>

            <TabsContent value="emisores">
              <EmisoresFiscalesTab onUpdate={() => {}} />
            </TabsContent>

            <TabsContent value="perfiles">
              <PerfilesFiscalesTab onUpdate={() => {}} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
