'use client'

import { Node } from 'reactflow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { X, Trash2, Info } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dynamic from 'next/dynamic'
import { TemplateSelector } from './TemplateSelector'

const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-md" />
})
import 'react-quill/dist/quill.snow.css'

interface NodeConfigPanelProps {
  node: Node
  onUpdate: (nodeId: string, data: any) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

export function NodeConfigPanel({ node, onUpdate, onDelete, onClose }: NodeConfigPanelProps) {
  const [config, setConfig] = useState(node.data.config || {})

  useEffect(() => {
    setConfig(node.data.config || {})
  }, [node])

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    onUpdate(node.id, { config: newConfig })
  }

  const renderConfigFields = () => {
    switch (node.type) {
      case 'action':
        return renderActionConfig()
      case 'condition':
        return renderConditionConfig()
      case 'delay':
        return renderDelayConfig()
      default:
        return null
    }
  }

  const renderActionConfig = () => {
    return (
      <div className="space-y-4">
        <div>
          <Label>Tipo de Acción</Label>
          <Select
            value={config.actionType || 'enviar_email'}
            onValueChange={(value) => handleConfigChange('actionType', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una acción" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>📧 Comunicación</SelectLabel>
                <SelectItem value="enviar_email">Enviar Email</SelectItem>
                <SelectItem value="enviar_sms">Enviar SMS</SelectItem>
                <SelectItem value="enviar_whatsapp">Enviar WhatsApp</SelectItem>
                <SelectItem value="enviar_telegram">Enviar Telegram</SelectItem>
                <SelectItem value="enviar_notificacion">Enviar Notificación</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>👤 Gestión de Leads</SelectLabel>
                <SelectItem value="actualizar_lead">Actualizar Lead</SelectItem>
                <SelectItem value="cambiar_etapa_lead">Cambiar Etapa</SelectItem>
                <SelectItem value="asignar_tag">Asignar Tag</SelectItem>
                <SelectItem value="remover_tag">Remover Tag</SelectItem>
                <SelectItem value="asignar_a_usuario">Asignar a Usuario</SelectItem>
                <SelectItem value="actualizar_score">Actualizar Score</SelectItem>
                <SelectItem value="calcular_score_automatico">Calcular Score Automático</SelectItem>
                <SelectItem value="crear_deal">Crear Oportunidad</SelectItem>
                <SelectItem value="archivar_lead">Archivar Lead</SelectItem>
                <SelectItem value="duplicar_lead">Duplicar Lead</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>🎓 Estudiantes</SelectLabel>
                <SelectItem value="actualizar_estudiante">Actualizar Estudiante</SelectItem>
                <SelectItem value="inscribir_en_curso">Inscribir en Curso</SelectItem>
                <SelectItem value="enviar_certificado">Enviar Certificado</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>📅 Organización</SelectLabel>
                <SelectItem value="crear_tarea">Crear Tarea</SelectItem>
                <SelectItem value="crear_cita">Crear Cita</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>📢 Campañas</SelectLabel>
                <SelectItem value="agregar_a_campana">Agregar a Campaña</SelectItem>
                <SelectItem value="remover_de_campana">Remover de Campaña</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>🔌 Integraciones</SelectLabel>
                <SelectItem value="webhook_saliente">Enviar Webhook</SelectItem>
                <SelectItem value="crear_factura_stripe">Generar Factura</SelectItem>
                <SelectItem value="crear_factura_square">Generar Factura</SelectItem>
                <SelectItem value="cobrar_gocardless">Generar Factura</SelectItem>
                <SelectItem value="enviar_mandato_gocardless">Enviar Mandato GoCardless</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>🤖 Automatizaciones Avanzadas</SelectLabel>
                <SelectItem value="ejecutar_workflow">Ejecutar Automatización</SelectItem>
                <SelectItem value="webhook_externo_seguro">Webhook Seguro (con firma)</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>⚙️ Control</SelectLabel>
                <SelectItem value="pausar_automatizacion">Pausar Automatización</SelectItem>
                <SelectItem value="activar_automatizacion">Activar Automatización</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Comunicación */}
        {config.actionType === 'enviar_email' && (
          <>
            <div>
              <Label>Asunto</Label>
              <Input
                value={config.subject || ''}
                onChange={(e) => handleConfigChange('subject', e.target.value)}
                placeholder="Asunto del email"
              />
            </div>
            <div>
              <Label>Mensaje (Editor Enriquecido)</Label>
              <div className="bg-white dark:bg-slate-950 rounded-md overflow-hidden border">
                <ReactQuill
                  theme="snow"
                  value={config.message || ''}
                  onChange={(content) => handleConfigChange('message', content)}
                  className="h-64 mb-12"
                  placeholder="Escribe el contenido del email..."
                  modules={{
                    toolbar: [
                      [{ 'header': [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                      ['link', 'clean']
                    ],
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Variables: {'{nombre}'}, {'{email}'}, {'{telefono}'}, {'{lead.estado}'}, {'{curso.titulo}'}
              </p>
            </div>
          </>
        )}

        {(config.actionType === 'enviar_sms' || config.actionType === 'enviar_whatsapp' || config.actionType === 'enviar_telegram') && (
          <div>
            <Label>Mensaje</Label>
            <Textarea
              value={config.message || ''}
              onChange={(e) => handleConfigChange('message', e.target.value)}
              placeholder="Mensaje a enviar"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Variables: {'{nombre}'}, {'{email}'}, {'{telefono}'}
            </p>
            {config.actionType === 'enviar_telegram' && (
              <div className="mt-2">
                <Label>Chat ID (opcional)</Label>
                <Input
                  value={config.chatId || ''}
                  onChange={(e) => handleConfigChange('chatId', e.target.value)}
                  placeholder="Dejar vacío para usar el del lead"
                />
              </div>
            )}
          </div>
        )}

        {config.actionType === 'enviar_notificacion' && (
          <>
            <div>
              <Label>Mensaje</Label>
              <Textarea
                value={config.message || ''}
                onChange={(e) => handleConfigChange('message', e.target.value)}
                placeholder="Mensaje de la notificación"
                rows={3}
              />
            </div>
            <div>
              <Label>Usuario (ID)</Label>
              <Input
                value={config.userId || ''}
                onChange={(e) => handleConfigChange('userId', e.target.value)}
                placeholder="ID del usuario o dejar vacío para admin"
              />
            </div>
          </>
        )}

        {/* Gestión de Leads */}
        {config.actionType === 'cambiar_etapa_lead' && (
          <div>
            <Label>Nueva Etapa</Label>
            <Select
              value={config.newStatus || 'nuevo'}
              onValueChange={(value) => handleConfigChange('newStatus', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nuevo">Nuevo</SelectItem>
                <SelectItem value="contactado">Contactado</SelectItem>
                <SelectItem value="calificado">Calificado</SelectItem>
                <SelectItem value="propuesta">Propuesta Enviada</SelectItem>
                <SelectItem value="negociacion">En Negociación</SelectItem>
                <SelectItem value="cerrado_ganado">Cerrado Ganado</SelectItem>
                <SelectItem value="cerrado_perdido">Cerrado Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {config.actionType === 'actualizar_lead' && (
          <div className="space-y-4">
            <div>
              <Label>Campo a Actualizar</Label>
              <Select
                value={config.updateField || ''}
                onValueChange={(value) => handleConfigChange('updateField', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un campo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nombre">Nombre</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telefono">Teléfono</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="cargo">Cargo</SelectItem>
                  <SelectItem value="ubicacion">Ubicación</SelectItem>
                  <SelectItem value="linkedin">LinkedIn URL</SelectItem>
                  <SelectItem value="notas">Notas Internas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.updateField && (
              <div>
                <Label>Nuevo Valor</Label>
                {config.updateField === 'notas' ? (
                  <Textarea
                    value={config.updateValue || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleConfigChange('updateValue', val);
                      handleConfigChange('updateData', { [config.updateField]: val });
                    }}
                    placeholder="Escribe el nuevo valor..."
                    rows={4}
                  />
                ) : (
                  <Input
                    value={config.updateValue || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleConfigChange('updateValue', val);
                      handleConfigChange('updateData', { [config.updateField]: val });
                    }}
                    placeholder="Escribe el nuevo valor..."
                  />
                )}
              </div>
            )}
          </div>
        )}

        {config.actionType === 'asignar_tag' && (
          <div>
            <Label>Tag</Label>
            <Input
              value={config.tag || ''}
              onChange={(e) => handleConfigChange('tag', e.target.value)}
              placeholder="Nombre del tag"
            />
          </div>
        )}

        {config.actionType === 'remover_tag' && (
          <div>
            <Label>Tag a Remover</Label>
            <Input
              value={config.tag || ''}
              onChange={(e) => handleConfigChange('tag', e.target.value)}
              placeholder="Nombre del tag a eliminar"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se eliminará este tag del lead si existe
            </p>
          </div>
        )}

        {config.actionType === 'calcular_score_automatico' && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              Esta acción calculará automáticamente el score del lead basándose en:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Email válido: +10 puntos</li>
              <li>Teléfono válido: +10 puntos</li>
              <li>Empresa definida: +15 puntos</li>
              <li>Cargo definido: +10 puntos</li>
              <li>Interacciones recientes: +5 por interacción (máx. 25)</li>
              <li>Citas agendadas: +15 por cita (máx. 30)</li>
            </ul>
          </div>
        )}

        {config.actionType === 'archivar_lead' && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              Esta acción cambiará el estado del lead a "archivado". El lead no aparecerá en las listas activas pero se mantendrá en el sistema.
            </p>
          </div>
        )}

        {config.actionType === 'duplicar_lead' && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              Esta acción creará una copia exacta del lead actual con el estado "nuevo". Útil para crear múltiples oportunidades desde un mismo contacto.
            </p>
          </div>
        )}

        {config.actionType === 'asignar_a_usuario' && (
          <div>
            <Label>ID del Usuario</Label>
            <Input
              value={config.userId || ''}
              onChange={(e) => handleConfigChange('userId', e.target.value)}
              placeholder="ID del usuario del equipo"
            />
            <p className="text-xs text-muted-foreground mt-1">
              El usuario recibirá una notificación automáticamente
            </p>
          </div>
        )}

        {config.actionType === 'actualizar_score' && (
          <>
            <div>
              <Label>Operación</Label>
              <Select
                value={config.operation || 'add'}
                onValueChange={(value) => handleConfigChange('operation', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Establecer valor</SelectItem>
                  <SelectItem value="add">Sumar</SelectItem>
                  <SelectItem value="subtract">Restar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                value={config.value || 0}
                onChange={(e) => handleConfigChange('value', parseInt(e.target.value) || 0)}
                placeholder="Puntos de score (0-100)"
                min={0}
                max={100}
              />
            </div>
          </>
        )}

        {config.actionType === 'crear_deal' && (
          <>
            <div>
              <Label>Título</Label>
              <Input
                value={config.titulo || ''}
                onChange={(e) => handleConfigChange('titulo', e.target.value)}
                placeholder="Título de la oportunidad"
              />
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                value={config.valor || ''}
                onChange={(e) => handleConfigChange('valor', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={config.moneda || 'MXN'}
                onValueChange={(value) => handleConfigChange('moneda', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                  <SelectItem value="USD">USD - Dólar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Etapa</Label>
              <Select
                value={config.etapa || 'calificacion'}
                onValueChange={(value) => handleConfigChange('etapa', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calificacion">Calificación</SelectItem>
                  <SelectItem value="propuesta">Propuesta</SelectItem>
                  <SelectItem value="negociacion">Negociación</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Probabilidad (%)</Label>
              <Input
                type="number"
                value={config.probabilidad || 25}
                onChange={(e) => handleConfigChange('probabilidad', parseInt(e.target.value) || 0)}
                min={0}
                max={100}
              />
            </div>
          </>
        )}

        {/* Estudiantes */}
        {config.actionType === 'inscribir_en_curso' && (
          <div>
            <Label>ID del Curso</Label>
            <Input
              value={config.cursoId || ''}
              onChange={(e) => handleConfigChange('cursoId', e.target.value)}
              placeholder="ID del curso"
            />
          </div>
        )}

        {/* Tareas y Organización */}
        {config.actionType === 'crear_tarea' && (
          <>
            <div>
              <Label>Título</Label>
              <Input
                value={config.titulo || ''}
                onChange={(e) => handleConfigChange('titulo', e.target.value)}
                placeholder="Título de la tarea"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={config.descripcion || ''}
                onChange={(e) => handleConfigChange('descripcion', e.target.value)}
                placeholder="Descripción detallada"
                rows={3}
              />
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select
                value={config.prioridad || 'media'}
                onValueChange={(value) => handleConfigChange('prioridad', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Asignar a Usuario (ID)</Label>
              <Input
                value={config.asignadoA || ''}
                onChange={(e) => handleConfigChange('asignadoA', e.target.value)}
                placeholder="ID del usuario"
              />
            </div>
          </>
        )}

        {config.actionType === 'crear_cita' && (
          <>
            <div>
              <Label>Título</Label>
              <Input
                value={config.titulo || ''}
                onChange={(e) => handleConfigChange('titulo', e.target.value)}
                placeholder="Título de la cita"
              />
            </div>
            <div>
              <Label>Fecha y Hora</Label>
              <Input
                type="datetime-local"
                value={config.fechaHora || ''}
                onChange={(e) => handleConfigChange('fechaHora', e.target.value)}
              />
            </div>
            <div>
              <Label>Duración (minutos)</Label>
              <Input
                type="number"
                value={config.duracion || 60}
                onChange={(e) => handleConfigChange('duracion', parseInt(e.target.value) || 60)}
                min={15}
                step={15}
              />
            </div>
          </>
        )}

        {/* Campañas */}
        {(config.actionType === 'agregar_a_campana' || config.actionType === 'remover_de_campana') && (
          <div>
            <Label>ID de Campaña</Label>
            <Input
              value={config.campanaId || ''}
              onChange={(e) => handleConfigChange('campanaId', e.target.value)}
              placeholder="ID de la campaña"
            />
          </div>
        )}

        {/* Integraciones */}
        {config.actionType === 'webhook_saliente' && (
          <>
            <div>
              <Label>URL del Webhook</Label>
              <Input
                value={config.url || ''}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                placeholder="https://example.com/webhook"
              />
            </div>
            <div>
              <Label>Método HTTP</Label>
              <Select
                value={config.method || 'POST'}
                onValueChange={(value) => handleConfigChange('method', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeLeadData"
                checked={config.includeLeadData !== false}
                onChange={(e) => handleConfigChange('includeLeadData', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="includeLeadData" className="cursor-pointer">
                Incluir datos del lead
              </Label>
            </div>
          </>
        )}

        {(config.actionType === 'crear_factura_stripe' || 
          config.actionType === 'crear_factura_square' || 
          config.actionType === 'cobrar_gocardless') && (
          <>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 mb-4">
              <p className="text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <Info className="h-3 w-3" />
                Se generará una factura con sello Veri*factu Volkern.
              </p>
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                value={config.amount || ''}
                onChange={(e) => handleConfigChange('amount', e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Usa variables como {'{monto_total}'} o un valor fijo.
              </p>
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={config.currency || (config.actionType === 'crear_factura_square' ? 'USD' : 'EUR')}
                onValueChange={(value) => handleConfigChange('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="COP">COP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descripción / Concepto</Label>
              <Input
                value={config.description || ''}
                onChange={(e) => handleConfigChange('description', e.target.value)}
                placeholder="Ej: Pago de suscripción mensual"
              />
            </div>
          </>    
        )}

        {config.actionType === 'enviar_mandato_gocardless' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-100 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Info className="h-3 w-3" />
                Se enviará un link al cliente para que autorice la domiciliación bancaria.
              </p>
            </div>
            <div>
              <Label>Canal de Envío</Label>
              <Select
                value={config.channel || 'email'}
                onValueChange={(value) => handleConfigChange('channel', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Automatizaciones (Templates) */}
        {config.actionType === 'ejecutar_workflow' && (
          <div className="space-y-4">
            <div>
              <Label>Seleccionar Automatización</Label>
              <TemplateSelector
                value={config.templateId || ''}
                onChange={(id, template) => {
                  // Actualizar todo de una vez para evitar problemas de sincronización
                  const newConfig = { 
                    ...config, 
                    templateId: id,
                    templateName: template?.name || '',
                    templateDisplayName: template?.displayName || ''
                  }
                  setConfig(newConfig)
                  onUpdate(node.id, { config: newConfig })
                }}
                showDescription={true}
                placeholder="Seleccionar Automatización..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ejecuta una automatización avanzada con los datos del contexto actual.
              </p>
            </div>

            <div>
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => handleConfigChange('timeout', parseInt(e.target.value) || 30000)}
                placeholder="30000"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tiempo máximo de espera para la respuesta del workflow.
              </p>
            </div>

            <div>
              <Label>Reintentos</Label>
              <Select
                value={String(config.retryCount ?? 3)}
                onValueChange={(value) => handleConfigChange('retryCount', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sin reintentos</SelectItem>
                  <SelectItem value="1">1 reintento</SelectItem>
                  <SelectItem value="2">2 reintentos</SelectItem>
                  <SelectItem value="3">3 reintentos (recomendado)</SelectItem>
                  <SelectItem value="5">5 reintentos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">Datos a incluir</Label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeLeadDataWorkflow"
                  checked={config.includeLeadData !== false}
                  onChange={(e) => handleConfigChange('includeLeadData', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeLeadDataWorkflow" className="cursor-pointer text-sm">
                  Incluir datos del lead
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeCitaData"
                  checked={config.includeCitaData === true}
                  onChange={(e) => handleConfigChange('includeCitaData', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeCitaData" className="cursor-pointer text-sm">
                  Incluir datos de cita (si aplica)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeEstudianteData"
                  checked={config.includeEstudianteData === true}
                  onChange={(e) => handleConfigChange('includeEstudianteData', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeEstudianteData" className="cursor-pointer text-sm">
                  Incluir datos de estudiante (si aplica)
                </Label>
              </div>
            </div>

            <div>
              <Label>Payload adicional (JSON)</Label>
              <Textarea
                value={config.customPayload || ''}
                onChange={(e) => handleConfigChange('customPayload', e.target.value)}
                placeholder='{"clave": "valor"}'
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Datos adicionales en formato JSON que se enviarán al workflow.
              </p>
            </div>
          </div>
        )}

        {config.actionType === 'webhook_externo_seguro' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Webhook Seguro:</strong> Incluye firma HMAC para verificar la autenticidad 
                  del mensaje. El servidor receptor puede validar que el webhook proviene de Volkern.
                </div>
              </div>
            </div>

            <div>
              <Label>URL del Webhook</Label>
              <Input
                value={config.url || ''}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                placeholder="https://tu-servidor.com/webhook"
              />
            </div>

            <div>
              <Label>Método HTTP</Label>
              <Select
                value={config.method || 'POST'}
                onValueChange={(value) => handleConfigChange('method', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Headers personalizados (JSON)</Label>
              <Textarea
                value={config.customHeaders || ''}
                onChange={(e) => handleConfigChange('customHeaders', e.target.value)}
                placeholder='{"X-Custom-Header": "valor"}'
                rows={2}
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">Contenido del Webhook</Label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeLeadDataSecure"
                  checked={config.includeLeadData !== false}
                  onChange={(e) => handleConfigChange('includeLeadData', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeLeadDataSecure" className="cursor-pointer text-sm">
                  Incluir datos del lead
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeFiscalConfig"
                  checked={config.includeFiscalConfig === true}
                  onChange={(e) => handleConfigChange('includeFiscalConfig', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeFiscalConfig" className="cursor-pointer text-sm">
                  Incluir configuración fiscal
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeTimestamp"
                  checked={config.includeTimestamp !== false}
                  onChange={(e) => handleConfigChange('includeTimestamp', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="includeTimestamp" className="cursor-pointer text-sm">
                  Incluir timestamp
                </Label>
              </div>
            </div>

            <div>
              <Label>Cuerpo personalizado (JSON)</Label>
              <Textarea
                value={config.customBody || ''}
                onChange={(e) => handleConfigChange('customBody', e.target.value)}
                placeholder='{"evento": "accion_completada", "datos": {...}}'
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Si se especifica, reemplaza el cuerpo automático. Variables: {'{lead.nombre}'}, {'{lead.email}'}, etc.
              </p>
            </div>

            <div>
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                value={config.timeout || 10000}
                onChange={(e) => handleConfigChange('timeout', parseInt(e.target.value) || 10000)}
                placeholder="10000"
              />
            </div>
          </div>
        )}

        {/* Control */}
        {(config.actionType === 'pausar_automatizacion' || config.actionType === 'activar_automatizacion') && (
          <div>
            <Label>ID de Automatización</Label>
            <Input
              value={config.automationId || ''}
              onChange={(e) => handleConfigChange('automationId', e.target.value)}
              placeholder="ID de la automatización a controlar"
            />
          </div>
        )}
      </div>
    )
  }

  const renderConditionConfig = () => {
    return (
      <div className="space-y-4">
        <div>
          <Label>Tipo de Entidad</Label>
          <Select
            value={config.conditionType || 'lead'}
            onValueChange={(value) => handleConfigChange('conditionType', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="estudiante">Estudiante</SelectItem>
              <SelectItem value="curso">Curso</SelectItem>
              <SelectItem value="cita">Cita</SelectItem>
              <SelectItem value="inscripcion">Inscripción</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Campo</Label>
          <Select
            value={config.field || ''}
            onValueChange={(value) => handleConfigChange('field', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un campo..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>👤 Lead / Contacto</SelectLabel>
                <SelectItem value="nombre">Nombre</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="telefono">Teléfono</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="cargo">Cargo</SelectItem>
                <SelectItem value="estado">Estado Pipeline</SelectItem>
                <SelectItem value="scoreValue">Score (Valor)</SelectItem>
                <SelectItem value="tags">Etiquetas (Tags)</SelectItem>
                <SelectItem value="ubicacion">Ubicación</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>📅 Citas</SelectLabel>
                <SelectItem value="cita.estado">Estado Cita</SelectItem>
                <SelectItem value="cita.fechaHora">Fecha/Hora Cita</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>🎓 Educación</SelectLabel>
                <SelectItem value="estudiante.estado">Estado Estudiante</SelectItem>
                <SelectItem value="curso.titulo">Título del Curso</SelectItem>
                <SelectItem value="inscripcion.estado">Estado Inscripción</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Operador</Label>
          <Select
            value={config.operator || 'igual'}
            onValueChange={(value) => handleConfigChange('operator', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Igualdad</SelectLabel>
                <SelectItem value="igual">Igual a</SelectItem>
                <SelectItem value="diferente">Diferente de</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Texto</SelectLabel>
                <SelectItem value="contiene">Contiene</SelectItem>
                <SelectItem value="no_contiene">No contiene</SelectItem>
                <SelectItem value="empieza_con">Empieza con</SelectItem>
                <SelectItem value="termina_con">Termina con</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Existencia</SelectLabel>
                <SelectItem value="vacio">Está vacío</SelectItem>
                <SelectItem value="no_vacio">No está vacío</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Números</SelectLabel>
                <SelectItem value="mayor_que">Mayor que</SelectItem>
                <SelectItem value="menor_que">Menor que</SelectItem>
                <SelectItem value="mayor_igual">Mayor o igual</SelectItem>
                <SelectItem value="menor_igual">Menor o igual</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Fechas</SelectLabel>
                <SelectItem value="antes_de">Antes de</SelectItem>
                <SelectItem value="despues_de">Después de</SelectItem>
                <SelectItem value="ultimos_x_dias">Últimos X días</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Arrays/Tags</SelectLabel>
                <SelectItem value="incluye">Incluye</SelectItem>
                <SelectItem value="no_incluye">No incluye</SelectItem>
              </SelectGroup>

              <SelectSeparator />

              <SelectGroup>
                <SelectLabel>Booleanos</SelectLabel>
                <SelectItem value="es_verdadero">Es verdadero</SelectItem>
                <SelectItem value="es_falso">Es falso</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {!['vacio', 'no_vacio', 'es_verdadero', 'es_falso'].includes(config.operator) && (
          <div>
            <Label>Valor</Label>
            <Input
              value={config.value || ''}
              onChange={(e) => handleConfigChange('value', e.target.value)}
              placeholder="Valor a comparar"
            />
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg text-sm">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Condiciones Avanzadas</p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                Ahora puedes evaluar cualquier campo de leads, estudiantes, cursos y más.
                Usa operadores numéricos, de fecha, y de arrays para condiciones complejas.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderDelayConfig = () => {
    return (
      <div className="space-y-4">
        <div>
          <Label>Duración</Label>
          <Input
            type="number"
            value={config.duration || 1}
            onChange={(e) => handleConfigChange('duration', parseInt(e.target.value) || 1)}
            min={1}
          />
        </div>

        <div>
          <Label>Unidad de Tiempo</Label>
          <Select
            value={config.unit || 'hours'}
            onValueChange={(value) => handleConfigChange('unit', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
              <SelectItem value="days">Días</SelectItem>
              <SelectItem value="weeks">Semanas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-20 right-6 z-50 max-h-[calc(100vh-120px)] overflow-y-auto">
      <Card className="w-96 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Configurar {node.type === 'action' ? 'Acción' : node.type === 'condition' ? 'Condición' : 'Delay'}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {node.type === 'action' && 'Define qué acción ejecutar'}
                {node.type === 'condition' && 'Establece la condición de bifurcación'}
                {node.type === 'delay' && 'Configura el tiempo de espera'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {renderConfigFields()}

          <div className="mt-6 pt-4 border-t flex justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(node.id)
                onClose()
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar Nodo
            </Button>
            <Button size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
