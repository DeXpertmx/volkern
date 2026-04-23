import { RoleManagement } from '@/components/RoleManagement'

export const metadata = {
  title: 'Roles y Permisos | Volkern ERP',
  description: 'Gestiona los niveles de acceso y permisos de los diferentes perfiles del equipo.',
}

export default function RolesPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <RoleManagement />
    </div>
  )
}
