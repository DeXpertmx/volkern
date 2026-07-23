export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// Presets de campos por industria
const PRESETS: Record<string, Array<{
  fieldKey: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  unidad?: string;
}>> = {
  inmobiliaria: [
    // === Datos básicos ===
    { fieldKey: 'tipo_operacion', label: 'Tipo de Operación', type: 'select', options: ['Venta', 'Renta', 'Traspaso'], required: true },
    { fieldKey: 'tipo_inmueble', label: 'Tipo de Inmueble', type: 'select', options: ['Casa', 'Departamento', 'Oficina', 'Local Comercial', 'Terreno', 'Bodega', 'Nave Industrial', 'Edificio'] },
    { fieldKey: 'estado', label: 'Estado', type: 'select', options: ['disponible', 'reservada', 'vendida', 'alquilada'], required: true },

    // === Ubicación ===
    { fieldKey: 'direccion', label: 'Dirección', type: 'text', placeholder: 'Calle, número, colonia...' },
    { fieldKey: 'zona', label: 'Zona/Colonia', type: 'text' },
    { fieldKey: 'ciudad', label: 'Ciudad', type: 'text' },
    { fieldKey: 'provincia', label: 'Provincia/Estado', type: 'text' },
    { fieldKey: 'codigo_postal', label: 'Código Postal', type: 'text' },
    { fieldKey: 'latitud', label: 'Latitud', type: 'number' },
    { fieldKey: 'longitud', label: 'Longitud', type: 'number' },

    // === Características ===
    { fieldKey: 'superficie_total', label: 'Superficie Total', type: 'number', unidad: 'm²', required: true },
    { fieldKey: 'superficie_construida', label: 'Superficie Construida', type: 'number', unidad: 'm²' },
    { fieldKey: 'habitaciones', label: 'Habitaciones', type: 'number' },
    { fieldKey: 'banos', label: 'Baños', type: 'number' },
    { fieldKey: 'estacionamientos', label: 'Estacionamientos', type: 'number' },
    { fieldKey: 'antiguedad', label: 'Antigüedad', type: 'number', unidad: 'años' },
    { fieldKey: 'ascensor', label: 'Ascensor', type: 'boolean' },
    { fieldKey: 'amueblado', label: 'Amueblado', type: 'boolean' },
    { fieldKey: 'estacionamiento', label: 'Estacionamiento/Parking', type: 'boolean' },
    { fieldKey: 'alberca', label: 'Alberca/Piscina', type: 'boolean' },
    { fieldKey: 'jardin', label: 'Jardín', type: 'boolean' },
    { fieldKey: 'trastero', label: 'Trastero', type: 'boolean' },
    { fieldKey: 'orientacion', label: 'Orientación', type: 'select', options: ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste'] },
    { fieldKey: 'certificacion_energetica', label: 'Certificación Energética', type: 'select', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'] },
    { fieldKey: 'consumo_energetico', label: 'Consumo Energético', type: 'number', unidad: 'kWh/m²/año', placeholder: '120.5' },
    { fieldKey: 'emisiones_co2', label: 'Emisiones CO₂', type: 'number', unidad: 'kg CO₂/m²/año', placeholder: '25.3' },
    { fieldKey: 'organismo_certificador', label: 'Organismo Certificador', type: 'text', placeholder: 'Nombre del organismo emisor' },
    { fieldKey: 'fecha_certificado', label: 'Fecha del Certificado', type: 'date' },
    { fieldKey: 'caducidad_certificado', label: 'Caducidad del Certificado', type: 'date' },
    { fieldKey: 'documento_certificado', label: 'Documento del Certificado', type: 'text', placeholder: 'URL del PDF del certificado' },

    // === Visibilidad y SEO ===
    { fieldKey: 'destacada', label: 'Propiedad Destacada', type: 'boolean' },
    { fieldKey: 'descripcion_larga', label: 'Descripción Larga', type: 'textarea' },
    { fieldKey: 'tags_seo', label: 'Tags SEO', type: 'text', placeholder: 'separados por comas' },
    { fieldKey: 'amenidades', label: 'Amenidades', type: 'textarea', placeholder: 'Alberca, gimnasio, áreas verdes...' },

    // === Propietario / Vendedor ===
    { fieldKey: 'propietario_nombre', label: 'Nombre del Propietario', type: 'text', placeholder: 'Nombre completo' },
    { fieldKey: 'propietario_telefono', label: 'Teléfono del Propietario', type: 'text', placeholder: '+34 600 000 000' },
    { fieldKey: 'propietario_email', label: 'Email del Propietario', type: 'text', placeholder: 'propietario@email.com' },
    { fieldKey: 'propietario_contact_id', label: 'Contacto Vinculado (ID)', type: 'text', placeholder: 'ID del contacto en CRM' },
  ],
  ecommerce: [
    { fieldKey: 'marca', label: 'Marca', type: 'text' },
    { fieldKey: 'modelo', label: 'Modelo', type: 'text' },
    { fieldKey: 'color', label: 'Color', type: 'text' },
    { fieldKey: 'talla', label: 'Talla', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { fieldKey: 'material', label: 'Material', type: 'text' },
    { fieldKey: 'peso', label: 'Peso', type: 'number', unidad: 'kg' },
    { fieldKey: 'dimensiones', label: 'Dimensiones', type: 'text', placeholder: 'Largo x Ancho x Alto' },
    { fieldKey: 'garantia', label: 'Garantía', type: 'text', placeholder: 'ej: 1 año' },
    { fieldKey: 'stock', label: 'Stock Disponible', type: 'number', unidad: 'unidades' },
    { fieldKey: 'codigo_barras', label: 'Código de Barras', type: 'text' },
    { fieldKey: 'envio_gratis', label: 'Envío Gratis', type: 'boolean' },
  ],
  servicios_profesionales: [
    { fieldKey: 'modalidad', label: 'Modalidad', type: 'select', options: ['Presencial', 'Virtual', 'Híbrido'] },
    { fieldKey: 'duracion_estimada', label: 'Duración Estimada', type: 'text', placeholder: 'ej: 2-4 semanas' },
    { fieldKey: 'nivel_experiencia', label: 'Nivel de Experiencia Requerido', type: 'select', options: ['Básico', 'Intermedio', 'Avanzado'] },
    { fieldKey: 'entregables', label: 'Entregables', type: 'textarea', placeholder: 'Lista de entregables incluidos...' },
    { fieldKey: 'incluye_soporte', label: 'Incluye Soporte', type: 'boolean' },
    { fieldKey: 'horas_incluidas', label: 'Horas Incluidas', type: 'number', unidad: 'horas' },
  ],
  automotriz: [
    { fieldKey: 'marca', label: 'Marca', type: 'text', required: true },
    { fieldKey: 'modelo', label: 'Modelo', type: 'text', required: true },
    { fieldKey: 'anio', label: 'Año', type: 'number', required: true },
    { fieldKey: 'kilometraje', label: 'Kilometraje', type: 'number', unidad: 'km' },
    { fieldKey: 'transmision', label: 'Transmisión', type: 'select', options: ['Manual', 'Automática', 'CVT'] },
    { fieldKey: 'combustible', label: 'Combustible', type: 'select', options: ['Gasolina', 'Diesel', 'Eléctrico', 'Híbrido', 'Gas LP'] },
    { fieldKey: 'color_exterior', label: 'Color Exterior', type: 'text' },
    { fieldKey: 'color_interior', label: 'Color Interior', type: 'text' },
    { fieldKey: 'numero_duenos', label: 'Número de Dueños', type: 'number' },
    { fieldKey: 'placas', label: 'Placas', type: 'text' },
    { fieldKey: 'factura_original', label: 'Factura Original', type: 'boolean' },
  ],
  turismo: [
    { fieldKey: 'destino', label: 'Destino', type: 'text', required: true },
    { fieldKey: 'duracion_dias', label: 'Duración', type: 'number', unidad: 'días', required: true },
    { fieldKey: 'incluye_vuelo', label: 'Incluye Vuelo', type: 'boolean' },
    { fieldKey: 'incluye_hotel', label: 'Incluye Hotel', type: 'boolean' },
    { fieldKey: 'tipo_habitacion', label: 'Tipo de Habitación', type: 'select', options: ['Sencilla', 'Doble', 'Suite', 'Todo Incluido'] },
    { fieldKey: 'regimen_alimenticio', label: 'Régimen Alimenticio', type: 'select', options: ['Solo hospedaje', 'Desayuno incluido', 'Media pensión', 'Todo incluido'] },
    { fieldKey: 'actividades_incluidas', label: 'Actividades Incluidas', type: 'textarea' },
    { fieldKey: 'fecha_salida', label: 'Fecha de Salida', type: 'date' },
    { fieldKey: 'cupo_maximo', label: 'Cupo Máximo', type: 'number', unidad: 'personas' },
  ]
};

/**
 * GET /api/catalogo/field-definitions/presets
 * Obtiene los presets disponibles por industria
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:read']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const industria = searchParams.get('industria');

    if (industria) {
      const preset = PRESETS[industria];
      if (!preset) {
        return NextResponse.json(
          { error: `Industria "${industria}" no encontrada`, industriasDisponibles: Object.keys(PRESETS) },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        industria,
        campos: preset
      });
    }

    // Devolver lista de industrias disponibles
    return NextResponse.json({
      success: true,
      industrias: Object.entries(PRESETS).map(([key, campos]) => ({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        totalCampos: campos.length
      }))
    });
  } catch (error: any) {
    console.error('Error fetching presets:', error);
    return NextResponse.json(
      { error: 'Error al obtener presets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/catalogo/field-definitions/presets
 * Aplica un preset de industria (crea todos los campos del preset)
 * 
 * Body: { industria: 'inmobiliaria' }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { industria, sobreescribir = false } = body;

    if (!industria) {
      return NextResponse.json(
        { error: 'industria es requerido' },
        { status: 400 }
      );
    }

    const preset = PRESETS[industria];
    if (!preset) {
      return NextResponse.json(
        { error: `Industria "${industria}" no encontrada`, industriasDisponibles: Object.keys(PRESETS) },
        { status: 404 }
      );
    }

    // Verificar campos existentes
    const camposExistentes = await prisma.catalogoFieldDefinition.findMany({
      where: { tenantId: auth.tenant.id },
      select: { fieldKey: true }
    });

    const keysExistentes = new Set(camposExistentes.map(c => c.fieldKey));

    // Filtrar campos que ya existen (a menos que sobreescribir sea true)
    let camposACrear = preset;
    let camposOmitidos: string[] = [];

    if (!sobreescribir) {
      camposACrear = preset.filter(c => !keysExistentes.has(c.fieldKey));
      camposOmitidos = preset.filter(c => keysExistentes.has(c.fieldKey)).map(c => c.fieldKey);
    }

    if (camposACrear.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Todos los campos del preset ya existen',
        camposOmitidos,
        creados: 0
      });
    }

    // Obtener el máximo orden actual
    const maxOrden = await prisma.catalogoFieldDefinition.aggregate({
      where: { tenantId: auth.tenant.id },
      _max: { orden: true }
    });

    const ordenInicial = (maxOrden._max.orden ?? 0) + 1;

    // Crear campos
    const creados = await prisma.$transaction(
      camposACrear.map((campo, index) => {
        return prisma.catalogoFieldDefinition.upsert({
          where: {
            tenantId_fieldKey: {
              tenantId: auth.tenant!.id,
              fieldKey: campo.fieldKey
            }
          },
          update: sobreescribir ? {
            label: campo.label,
            type: campo.type,
            options: campo.options ? campo.options : undefined,
            required: campo.required || false,
            placeholder: campo.placeholder || null,
            unidad: campo.unidad || null,
            activo: true
          } : {},
          create: {
            tenantId: auth.tenant!.id,
            fieldKey: campo.fieldKey,
            label: campo.label,
            type: campo.type,
            options: campo.options ? campo.options : undefined,
            required: campo.required || false,
            orden: ordenInicial + index,
            placeholder: campo.placeholder || null,
            unidad: campo.unidad || null,
            activo: true
          }
        });
      })
    );

    // Audit log
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'CREATE',
          entidad: 'CatalogoFieldDefinition',
          entidadId: `preset-${industria}`,
          descripcion: `Preset "${industria}" aplicado (${creados.length} campos creados)`,
          cambiosDespues: JSON.stringify({ industria, camposCreados: camposACrear.map(c => c.fieldKey) })
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Preset "${industria}" aplicado exitosamente`,
      creados: creados.length,
      camposOmitidos
    });
  } catch (error: any) {
    console.error('Error applying preset:', error);
    return NextResponse.json(
      { error: 'Error al aplicar preset', details: error.message },
      { status: 500 }
    );
  }
}
