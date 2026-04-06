
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
    Mail,
    Plus,
    Trash2,
    Loader2,
    AlertCircle,
    Globe,
    ShieldCheck,
    Key,
    Database,
    Info,
    Sparkles
} from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'

export default function BusinessEmailsPage() {
    const router = useRouter()
    const [config, setConfig] = useState<any>(null)
    const [domains, setDomains] = useState<any[]>([])
    const [accounts, setAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [isAddAccountOpen, setIsAddAccountOpen] = useState(false)

    const [newDomain, setNewDomain] = useState('')
    const [newAccount, setNewAccount] = useState({
        username: '',
        fullName: '',
        password: ''
    })

    const fetchData = useCallback(async () => {
        try {
            const [configRes, domainsRes] = await Promise.all([
                fetch('/api/emails/config'),
                fetch('/api/emails/domains')
            ])

            const configData = await configRes.json()
            const domainsData = await domainsRes.json()

            setConfig(configData)
            setDomains(domainsData)

            if (domainsData.length > 0) {
                const accountsRes = await fetch(`/api/emails/accounts?domainId=${domainsData[0].id}`)
                const accountsData = await accountsRes.json()
                setAccounts(accountsData)
            }
        } catch (error) {
            console.error('Error fetching data:', error)
            toast.error('Error al cargar la configuración de correos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleToggleFeature = async (enabled: boolean) => {
        setActionLoading(true)
        try {
            const response = await fetch('/api/emails/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            })

            if (response.ok) {
                const data = await response.json()
                setConfig(data)
                toast.success(`Servicio de correo ${enabled ? 'activado' : 'desactivado'}`)
            }
        } catch (error) {
            toast.error('Error al actualizar la configuración')
        } finally {
            setActionLoading(false)
        }
    }

    const handleAddDomain = async () => {
        if (!newDomain) return
        setActionLoading(true)
        try {
            const response = await fetch('/api/emails/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: newDomain })
            })

            if (response.ok) {
                toast.success('Dominio registrado exitosamente')
                setNewDomain('')
                fetchData()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Error al registrar dominio')
            }
        } catch (error) {
            toast.error('Error al procesar la solicitud')
        } finally {
            setActionLoading(false)
        }
    }

    const handleAddAccount = async () => {
        if (!domains[0]?.id || !newAccount.username || !newAccount.password) return
        setActionLoading(true)
        try {
            const response = await fetch('/api/emails/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainId: domains[0].id,
                    ...newAccount
                })
            })

            if (response.ok) {
                toast.success('Cuenta de correo creada')
                setNewAccount({ username: '', fullName: '', password: '' })
                setIsAddAccountOpen(false)
                fetchData()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Error al crear cuenta')
            }
        } catch (error) {
            toast.error('Error al procesar la solicitud')
        } finally {
            setActionLoading(false)
        }
    }

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta cuenta?')) return
        setActionLoading(true)
        try {
            const response = await fetch(`/api/emails/accounts?id=${id}`, {
                method: 'DELETE'
            })

            if (response.ok) {
                toast.success('Cuenta eliminada')
                fetchData()
            }
        } catch (error) {
            toast.error('Error al eliminar la cuenta')
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
        )
    }

    const domain = domains[0]
    const currentLimit = domain?.userLimit || 0
    const usagePercentage = currentLimit > 0 ? (accounts.length / currentLimit) * 100 : 0

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Correos Empresariales</h1>
                    <div className="flex items-center gap-4 mt-1">
                        <p className="text-muted-foreground">Gestiona tus cuentas de correo profesional con NameCrane y SmarterMail</p>
                        <Button 
                            variant="link" 
                            className="text-purple-600 font-bold p-0 h-auto flex items-center gap-1 hover:text-purple-700"
                            onClick={() => router.push('/template-editor/email/new')}
                        >
                            <Sparkles className="w-3 h-3" />
                            Diseñar Plantillas de Marketing
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                    <Label htmlFor="feature-toggle" className="text-sm font-medium cursor-pointer">
                        {config?.enabled ? 'Servicio Activado' : 'Servicio Desactivado'}
                    </Label>
                    <Switch
                        id="feature-toggle"
                        checked={config?.enabled}
                        onCheckedChange={handleToggleFeature}
                        disabled={actionLoading}
                    />
                </div>
            </div>

            {!config?.enabled ? (
                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-slate-200 p-3 rounded-full w-fit mb-4">
                            <ShieldCheck className="w-8 h-8 text-slate-500" />
                        </div>
                        <CardTitle>Módulo en Pruebas</CardTitle>
                        <CardDescription>
                            Activa el servicio en la esquina superior derecha para comenzar a configurar tus dominios y cuentas.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <>
                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Domain Status */}
                        <Card className="md:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-blue-500" />
                                    Dominio Principal
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {domain ? (
                                    <div className="space-y-4">
                                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                            <p className="text-sm font-bold text-blue-900">{domain.domain}</p>
                                            <Badge className="mt-2" variant={domain.status === 'active' ? 'default' : 'secondary'}>
                                                {domain.status === 'active' ? 'Activo' : 'Pendiente Verificación'}
                                            </Badge>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-medium">
                                                <span>Uso de cuentas</span>
                                                <span>{accounts.length} / {currentLimit}</span>
                                            </div>
                                            <Progress value={usagePercentage} className="h-2" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="domain">Escribe tu dominio</Label>
                                            <Input
                                                id="domain"
                                                placeholder="ejemplo.com"
                                                value={newDomain}
                                                onChange={(e) => setNewDomain(e.target.value)}
                                            />
                                        </div>
                                        <Button
                                            className="w-full"
                                            onClick={handleAddDomain}
                                            disabled={actionLoading || !newDomain}
                                        >
                                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Configurar Dominio'}
                                        </Button>
                                        <p className="text-[10px] text-muted-foreground">
                                            * El dominio debe estar verificado previamente en NameCrane.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* sm info / help */}
                        <Card className="md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Info className="w-5 h-5 text-purple-500" />
                                    Instrucciones de Acceso
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid sm:grid-cols-2 gap-4">
                                <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                                        <Globe className="w-4 h-4" />
                                        Webmail
                                    </div>
                                    <p className="text-xs text-purple-800">
                                        Accede a tus correos desde cualquier navegador:
                                    </p>
                                    <a
                                        href="https://eu1.workspace.org"
                                        target="_blank"
                                        className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1"
                                    >
                                        https://eu1.workspace.org
                                    </a>
                                </div>
                                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                                        <Key className="w-4 h-4" />
                                        Configuración IMAP/SMTP
                                    </div>
                                    <div className="text-[10px] text-emerald-800 space-y-1">
                                        <p><strong>Servidor:</strong> mail.workspace.org</p>
                                        <p><strong>IMAP:</strong> 993 (SSL)</p>
                                        <p><strong>SMTP:</strong> 465 (SSL)</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Accounts List */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle>Cuentas de Correo</CardTitle>
                                <CardDescription>Crea y administra los usuarios de tu dominio</CardDescription>
                            </div>
                            <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
                                <DialogTrigger asChild>
                                    <Button disabled={!domain || accounts.length >= currentLimit} size="sm" className="gap-2">
                                        <Plus className="w-4 h-4" /> Nueva Cuenta
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Crear Nueva Cuenta</DialogTitle>
                                        <DialogDescription>
                                            Asigna un nombre de usuario y contraseña para la nueva cuenta.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Usuario</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    placeholder="nombre"
                                                    value={newAccount.username}
                                                    onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
                                                />
                                                <span className="text-sm font-medium text-muted-foreground mr-2">@{domain?.domain}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Nombre Completo</Label>
                                            <Input
                                                placeholder="Juan Pérez"
                                                value={newAccount.fullName}
                                                onChange={(e) => setNewAccount({ ...newAccount, fullName: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Contraseña</Label>
                                            <Input
                                                type="password"
                                                placeholder="********"
                                                value={newAccount.password}
                                                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                                            />
                                            <p className="text-[10px] text-muted-foreground">Min. 8 caracteres, números y símbolos.</p>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsAddAccountOpen(false)}>Cancelar</Button>
                                        <Button onClick={handleAddAccount} disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Crear Cuenta
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent>
                            {accounts.length === 0 ? (
                                <div className="py-12 text-center border-2 border-dashed rounded-xl border-slate-100">
                                    <Mail className="mx-auto w-12 h-12 text-slate-300 mb-4" />
                                    <p className="text-slate-500 font-medium">No has creado ninguna cuenta aún</p>
                                    <p className="text-slate-400 text-sm">Comienza agregando tu primera cuenta profesional</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {accounts.map((acc) => (
                                        <div key={acc.id} className="flex items-center justify-between py-4 group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border">
                                                    <Mail className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm">{acc.email}</p>
                                                    <p className="text-xs text-muted-foreground">{acc.fullName || 'Sin nombre'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">10 GB</Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDeleteAccount(acc.id)}
                                                    disabled={actionLoading}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
