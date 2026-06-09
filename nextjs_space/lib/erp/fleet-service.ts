import { prisma } from '@/lib/db';

export interface FleetVehicle {
  id: string;
  tenantId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  type: 'camion' | 'furgoneta' | 'remolque' | 'turismo' | 'moto';
  capacity: number;
  capacityUnit: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE' | 'RETIRED';
  driverId?: string | null;
  itvExpiration?: Date | null;
  insuranceExpiration?: Date | null;
  lastMaintenanceKm?: number | null;
  currentKm?: number;
  fuelType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class FleetService {
  /**
   * Listar todos los vehículos de la flota
   */
  static async listVehicles(tenantId: string, options?: { status?: string; type?: string }) {
    const where: any = { tenantId };
    if (options?.status) where.status = options.status;
    if (options?.type) where.type = options.type;

    const vehicles = await (prisma as any).erp_fleet_vehicles.findMany({
      where,
      include: {
        driver: { select: { id: true, name: true, email: true, image: true } },
        maintenanceOrders: {
          where: { status: 'PLANNED' },
          take: 3,
          orderBy: { plannedDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles;
  }

  /**
   * Obtener un vehículo por ID
   */
  static async getVehicle(vehicleId: string, tenantId: string) {
    return await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { id: vehicleId, tenantId },
      include: {
        driver: { select: { id: true, name: true, email: true, image: true } },
        maintenanceOrders: { orderBy: { plannedDate: 'desc' }, take: 10 },
        routes: { orderBy: { date: 'desc' }, take: 10 },
      },
    });
  }

  /**
   * Crear un nuevo vehículo
   */
  static async createVehicle(data: {
    tenantId: string;
    plate: string;
    brand: string;
    model: string;
    year: number;
    type: string;
    capacity: number;
    capacityUnit?: string;
    fuelType?: string;
    driverId?: string;
  }) {
    const existing = await (prisma as any).erp_fleet_vehicles.findFirst({
      where: { tenantId: data.tenantId, plate: data.plate.toUpperCase() },
    });

    if (existing) {
      throw new Error(`Ya existe un vehículo con matrícula ${data.plate.toUpperCase()}`);
    }

    // Auto-generate unique GPS device ID
    const gpsDeviceId = 'VK-GPS-' + data.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase()

    return await (prisma as any).erp_fleet_vehicles.create({
      data: {
        tenantId: data.tenantId,
        plate: data.plate.toUpperCase(),
        brand: data.brand,
        model: data.model,
        year: data.year,
        type: data.type,
        capacity: data.capacity,
        capacityUnit: data.capacityUnit || 'kg',
        fuelType: data.fuelType || 'diesel',
        status: 'ACTIVE',
        driverId: data.driverId || null,
        currentKm: 0,
        gpsDeviceId,
      },
    });
  }

  /**
   * Actualizar un vehículo
   */
  static async updateVehicle(vehicleId: string, tenantId: string, data: Partial<FleetVehicle>) {
    return await (prisma as any).erp_fleet_vehicles.update({
      where: { id: vehicleId, tenantId },
      data,
    });
  }

  /**
   * Regenerar el deviceKey GPS de un vehículo
   */
  static async regenerateGpsDeviceKey(vehicleId: string, tenantId: string) {
    const vehicle = await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { id: vehicleId, tenantId },
    });

    if (!vehicle) throw new Error('Vehículo no encontrado');

    // Generar nuevo deviceKey único
    const newKey = 'VK-GPS-' + vehicle.plate.replace(/[^A-Z0-9]/g, '') + '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase()

    // Verificar que no exista otro vehículo con ese key
    const existing = await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { gpsDeviceId: newKey },
    });

    if (existing && existing.id !== vehicleId) {
      // Colisión extremadamente rara — reintentar
      return await this.regenerateGpsDeviceKey(vehicleId, tenantId)
    }

    await (prisma as any).erp_fleet_vehicles.update({
      where: { id: vehicleId },
      data: { gpsDeviceId: newKey },
    });

    return { gpsDeviceId: newKey, plate: vehicle.plate }
  }

  /**
   * Registrar kilometraje
   */
  static async recordKm(vehicleId: string, tenantId: string, km: number) {
    const vehicle = await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { id: vehicleId, tenantId },
    });

    if (!vehicle) throw new Error('Vehículo no encontrado');

    const updated = await (prisma as any).erp_fleet_vehicles.update({
      where: { id: vehicleId },
      data: { currentKm: km },
    });

    // Verificar si necesita mantenimiento preventivo
    if (vehicle.lastMaintenanceKm) {
      const kmSinceLastMaintenance = km - vehicle.lastMaintenanceKm;
      if (kmSinceLastMaintenance >= 10000) {
        await this.scheduleMaintenance(vehicleId, tenantId, 'Mantenimiento preventivo por kilometraje');
      }
    }

    return updated;
  }

  /**
   * Programar mantenimiento
   */
  static async scheduleMaintenance(vehicleId: string, tenantId: string, description: string) {
    const vehicle = await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { id: vehicleId, tenantId },
    });

    if (!vehicle) throw new Error('Vehículo no encontrado');

    const maintenance = await (prisma as any).erp_maintenance_orders.create({
      data: {
        tenantId,
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description,
        plannedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +1 semana
        assetType: 'FLEET',
        assetId: vehicleId,
      },
    });

    // Actualizar estado del vehículo
    await (prisma as any).erp_fleet_vehicles.update({
      where: { id: vehicleId },
      data: { status: 'MAINTENANCE' },
    });

    return maintenance;
  }

  /**
   * Obtener KPIs de flota
   */
  static async getFleetKPIs(tenantId: string) {
    const vehicles = await (prisma as any).erp_fleet_vehicles.findMany({
      where: { tenantId },
    });

    const total = vehicles.length;
    const active = vehicles.filter((v: any) => v.status === 'ACTIVE').length;
    const inMaintenance = vehicles.filter((v: any) => v.status === 'MAINTENANCE').length;
    const inactive = vehicles.filter((v: any) => v.status === 'INACTIVE').length;

    const expiringItv = vehicles.filter((v: any) => {
      if (!v.itvExpiration) return false;
      const days = (new Date(v.itvExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days > 0 && days < 30;
    }).length;

    const totalKm = vehicles.reduce((acc: number, v: any) => acc + (v.currentKm || 0), 0);

    return {
      total,
      active,
      inMaintenance,
      inactive,
      expiringItv,
      totalKm,
      availabilityRate: total > 0 ? Math.round((active / total) * 100) : 0,
    };
  }

  /**
   * Obtener conductores disponibles
   */
  static async listDrivers(tenantId: string) {
    // Buscar usuarios activos del tenant que puedan ser conductores
    return await prisma.user.findMany({
      where: {
        tenantId,
        estado: 'activo',
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      take: 50,
    });
  }
}
