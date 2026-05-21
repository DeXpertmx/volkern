
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Calendar, Clock, User, Mail, Phone, CheckCircle, ChevronRight, ChevronLeft, Briefcase, StickyNote, Sparkles, ArrowRight, CalendarDays } from 'lucide-react'
import { format, addDays, setHours, setMinutes, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

interface UserProfile {
    id: string
    name: string
    image: string | null
    title: string | null
    bio: string | null
    tenantId: string
    tenantName: string
}

interface Servicio {
    id: string
    nombre: string
    descripcion: string | null
    duracionMinutos: number
    precio: number
    moneda: string
    modalidad?: string
}

export default function UserBookingPage() {
    const params = useParams()
    const slug = params.slug as string
    const { toast } = useToast()

    const [step, setStep] = useState(1)
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
    const [servicios, setServicios] = useState<Servicio[]>([])
    const [selectedServicio, setSelectedServicio] = useState<Servicio | null>(null)
    const [selectedDate, setSelectedDate] = useState('')
    const [selectedTime, setSelectedTime] = useState('')
    const [availableSlots, setAvailableSlots] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoadingSlots, setIsLoadingSlots] = useState(false)

    const [rescheduling, setRescheduling] = useState<{ citaId: string; token: string } | null>(null)

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search)
        const rescheduleId = searchParams.get('reschedule')
        const rescheduleToken = searchParams.get('token')

        if (rescheduleId && rescheduleToken) {
            setRescheduling({ citaId: rescheduleId, token: rescheduleToken })
        }
    }, [])

    const [contactData, setContactData] = useState({
        nombre: '',
        email: '',
        telefono: '',
        empresa: '',
        notas: ''
    })

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await fetch(`/api/public/users/${slug}`)
                if (!response.ok) throw new Error('Usuario no encontrado')
                const data = await response.json()
                setUserProfile(data.user)
                setServicios(data.servicios)
            } catch (error) {
                console.error('Error fetching profile:', error)
                toast({
                    title: 'Error',
                    description: 'No se pudo cargar el perfil de agendamiento.',
                    variant: 'destructive',
                })
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [slug, toast])

    const fetchAvailability = async (date: string) => {
        if (!userProfile || !selectedServicio) return
        setIsLoadingSlots(true)
        try {
            const response = await fetch(
                `/api/public/citas/disponibilidad?tenantId=${userProfile.tenantId}&fecha=${date}&duracion=${selectedServicio.duracionMinutos}&usuarioId=${userProfile.id}`
            )
            if (!response.ok) throw new Error('Error al cargar disponibilidad')
            const data = await response.json()
            setAvailableSlots(data.disponibles || [])
        } catch (error) {
            console.error('Error fetching availability:', error)
        } finally {
            setIsLoadingSlots(false)
        }
    }

    const handleDateSelect = (date: string) => {
        setSelectedDate(date)
        setSelectedTime('')
        fetchAvailability(date)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!userProfile || !selectedServicio || !selectedDate || !selectedTime) return

        setIsSubmitting(true)
        try {
            const [hours, minutes] = selectedTime.split(':').map(Number)
            const fechaHora = setMinutes(setHours(new Date(selectedDate), hours), minutes)

            const response = await fetch('/api/public/citas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: userProfile.tenantId,
                    usuarioAsignadoId: userProfile.id,
                    servicioId: selectedServicio.id,
                    tipo: selectedServicio.modalidad === 'virtual' ? 'llamada' : 
                          selectedServicio.modalidad === 'presencial' ? 'reunion' : 'servicio',
                    fechaHora: fechaHora.toISOString(),
                    leadData: {
                        nombre: contactData.nombre,
                        email: contactData.email,
                        telefono: contactData.telefono,
                        empresa: contactData.empresa,
                    },
                    notas: contactData.notas
                }),
            })

            const result = await response.json()
            if (!result.success) throw new Error(result.error || 'Error al agendar')

            // Si estamos reagendando, marcar la cita anterior como cancelada
            if (rescheduling) {
                try {
                    await fetch('/api/citas/accion', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: rescheduling.token }),
                    })
                } catch (e) {
                    console.error('Error cancelling old appointment:', e)
                }
            }

            setStep(4) // Success step
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050510] flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-purple-500/20 rounded-full mb-4" />
                    <div className="h-4 w-32 bg-gray-800 rounded" />
                </div>
            </div>
        )
    }

    if (!userProfile) {
        return (
            <div className="min-h-screen bg-[#050510] flex items-center justify-center p-4">
                <Card className="bg-gray-900/50 border-gray-800 text-center p-8 max-w-md">
                    <h2 className="text-xl font-bold text-white mb-2">Perfil no encontrado</h2>
                    <p className="text-gray-400">Este enlace de agendamiento no es válido o ha sido desactivado.</p>
                </Card>
            </div>
        )
    }

    const generateAvailableDates = () => {
        const dates = []
        const today = startOfDay(new Date())
        for (let i = 1; i <= 30; i++) {
            const date = addDays(today, i)
            if (date.getDay() !== 0 && date.getDay() !== 6) {
                dates.push(format(date, 'yyyy-MM-dd'))
            }
        }
        return dates
    }

    return (
        <div className="min-h-screen bg-[#0a0a1a] text-white font-sans selection:bg-purple-500/30">
            {/* Background Orbs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-blue-600/10 blur-[100px] rounded-full" />
            </div>

            <div className="relative max-w-4xl mx-auto px-4 py-12 md:py-20">
                {/* Rescheduling Banner */}
                {rescheduling && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center"
                    >
                        <div className="flex items-center justify-center gap-2 text-yellow-400 mb-1">
                            <CalendarDays className="h-4 w-4" />
                            <span className="text-sm font-medium">Reagendando cita</span>
                        </div>
                        <p className="text-xs text-yellow-400/70">
                            Selecciona una nueva fecha y hora. Tu cita actual se cancelará automáticamente.
                        </p>
                    </motion.div>
                )}

                {/* Header - User Profile */}
                <header className="mb-12 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-block"
                    >
                        <div className="relative mb-6 mx-auto w-24 h-24">
                            {userProfile.image ? (
                                <Image
                                    src={userProfile.image}
                                    alt={userProfile.name}
                                    fill
                                    className="rounded-2xl object-cover border-2 border-purple-500/30 p-1"
                                />
                            ) : (
                                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-3xl font-bold">
                                    {userProfile.name.charAt(0)}
                                </div>
                            )}
                            <div className="absolute -bottom-2 -right-2 bg-green-500 w-5 h-5 rounded-full border-4 border-[#0a0a1a]" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                            {userProfile.name}
                        </h1>
                        {userProfile.title && (
                            <p className="text-purple-400 font-medium mb-3 uppercase tracking-widest text-xs">
                                {userProfile.title}
                            </p>
                        )}
                        {userProfile.bio && (
                            <p className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
                                {userProfile.bio}
                            </p>
                        )}
                    </motion.div>
                </header>

                {/* Stepper Navigation */}
                {step < 4 && (
                    <div className="flex justify-center mb-12">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center">
                                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                  ${step === s ? 'bg-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.5)]' : step > s ? 'bg-green-500' : 'bg-gray-800'}
                `}>
                                    {step > s ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="font-bold">{s}</span>}
                                </div>
                                {s < 3 && <div className={`w-8 h-[2px] mx-2 ${step > s ? 'bg-green-500' : 'bg-gray-800'}`} />}
                            </div>
                        ))}
                    </div>
                )}

                <main>
                    <AnimatePresence mode="wait" initial={false}>
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold">Selecciona un Servicio</h2>
                                    <p className="text-gray-400 mt-1">¿Cómo puedo ayudarte hoy?</p>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {servicios.map((s) => (
                                        <div
                                            key={s.id}
                                            onClick={() => { setSelectedServicio(s); setStep(2); }}
                                            className={`
                        group relative p-6 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
                        ${selectedServicio?.id === s.id
                                                    ? 'bg-purple-600/20 border-purple-500 shadow-xl'
                                                    : 'bg-gray-900/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/40'}
                      `}
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-3 bg-purple-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                                    <Sparkles className="w-6 h-6 text-purple-400" />
                                                </div>
                                                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                                                    {s.duracionMinutos} min
                                                </Badge>
                                            </div>
                                            <h3 className="text-xl font-bold mb-2">{s.nombre}</h3>
                                            <p className="text-gray-400 text-sm mb-4 line-clamp-2">{s.descripcion}</p>
                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-800/50">
                                                <span className="text-lg font-bold">${s.precio} <span className="text-xs text-gray-500">{s.moneda}</span></span>
                                                <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <Button variant="ghost" onClick={() => setStep(1)} className="text-gray-400 hover:text-white">
                                        <ChevronLeft className="mr-2 w-4 h-4" /> Volver
                                    </Button>
                                    <div className="text-right">
                                        <h2 className="text-2xl font-bold">Fecha y Hora</h2>
                                        <p className="text-gray-400 text-sm">{selectedServicio?.nombre}</p>
                                    </div>
                                </div>

                                <div className="grid lg:grid-cols-2 gap-10">
                                    {/* Calendar/Date Picker */}
                                    <div className="bg-gray-900/60 p-6 rounded-3xl border border-gray-800">
                                        <Label className="text-sm font-semibold uppercase tracking-widest text-purple-400 mb-6 block">
                                            Selecciona un día
                                        </Label>
                                        <div className="grid grid-cols-4 gap-3">
                                            {generateAvailableDates().map((date) => (
                                                <button
                                                    key={date}
                                                    onClick={() => handleDateSelect(date)}
                                                    className={`
                            p-4 rounded-2xl border transition-all text-center
                            ${selectedDate === date
                                                            ? 'bg-purple-600 border-purple-500 shadow-lg scale-105'
                                                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'}
                          `}
                                                >
                                                    <div className="text-xs text-gray-400 group-hover:text-white mb-1">
                                                        {format(new Date(date), 'EEE', { locale: es })}
                                                    </div>
                                                    <div className="text-lg font-bold">
                                                        {format(new Date(date), 'd')}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Time Slots */}
                                    <div className="bg-gray-900/60 p-6 rounded-3xl border border-gray-800 relative">
                                        <Label className="text-sm font-semibold uppercase tracking-widest text-purple-400 mb-6 block">
                                            Horarios disponibles
                                        </Label>

                                        {!selectedDate ? (
                                            <div className="flex flex-col items-center justify-center h-48 text-gray-500 border-2 border-dashed border-gray-800 rounded-2xl">
                                                <Clock className="w-8 h-8 mb-2 opacity-20" />
                                                <p className="text-sm">Selecciona una fecha primero</p>
                                            </div>
                                        ) : isLoadingSlots ? (
                                            <div className="flex items-center justify-center h-48">
                                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-purple-500" />
                                            </div>
                                        ) : availableSlots.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                                                <p className="text-sm">No hay horarios para este día.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-3">
                                                {availableSlots.map((time) => (
                                                    <button
                                                        key={time}
                                                        onClick={() => setSelectedTime(time)}
                                                        className={`
                                        p-3 rounded-xl border font-bold text-sm transition-all
                                        ${selectedTime === time
                                                                ? 'bg-purple-600 border-purple-400 shadow-lg'
                                                                : 'bg-gray-800/50 border-gray-700 hover:border-purple-500/50'}
                                    `}
                                                    >
                                                        {time}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-8">
                                            <Button
                                                disabled={!selectedTime}
                                                onClick={() => setStep(3)}
                                                className="w-full h-14 bg-purple-600 hover:bg-purple-500 text-lg rounded-2xl transition-all shadow-xl shadow-purple-900/20"
                                            >
                                                Confirmar Fecha <ArrowRight className="ml-2 w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="max-w-xl mx-auto"
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <Button variant="ghost" onClick={() => setStep(2)} className="text-gray-400 hover:text-white">
                                        <ChevronLeft className="mr-2 w-4 h-4" /> Volver
                                    </Button>
                                    <div className="text-right">
                                        <h2 className="text-2xl font-bold">Tus Datos</h2>
                                        <p className="text-gray-400 text-sm">Finalizar reserva</p>
                                    </div>
                                </div>

                                <div className="bg-gray-900/60 p-8 rounded-[2rem] border border-gray-800 backdrop-blur-xl">
                                    {/* Summary */}
                                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 mb-8 flex items-center gap-4">
                                        <div className="p-3 bg-purple-500/20 rounded-xl">
                                            <Calendar className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-widest text-purple-400 font-bold">Cita Confirmada</p>
                                            <p className="font-bold">{format(new Date(selectedDate), "EEEE, d 'de' MMMM", { locale: es })}</p>
                                            <p className="text-sm text-gray-400">{selectedTime} • {selectedServicio?.nombre}</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div className="space-y-2">
                                            <Label htmlFor="nombre" className="text-gray-400 ml-1">Nombre Completo</Label>
                                            <div className="relative group">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
                                                <Input
                                                    id="nombre"
                                                    value={contactData.nombre}
                                                    onChange={(e) => setContactData(p => ({ ...p, nombre: e.target.value }))}
                                                    placeholder="Escribe tu nombre"
                                                    className="h-14 pl-12 bg-gray-950/50 border-gray-800 focus:border-purple-500 rounded-2xl transition-all"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="email" className="text-gray-400 ml-1">Email Corporativo</Label>
                                            <div className="relative group">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={contactData.email}
                                                    onChange={(e) => setContactData(p => ({ ...p, email: e.target.value }))}
                                                    placeholder="nombre@empresa.com"
                                                    className="h-14 pl-12 bg-gray-950/50 border-gray-800 focus:border-purple-500 rounded-2xl transition-all"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="telefono" className="text-gray-400 ml-1">WhatsApp</Label>
                                                <div className="relative group">
                                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
                                                    <Input
                                                        id="telefono"
                                                        value={contactData.telefono}
                                                        onChange={(e) => setContactData(p => ({ ...p, telefono: e.target.value }))}
                                                        placeholder="+34 ..."
                                                        className="h-14 pl-12 bg-gray-950/50 border-gray-800 focus:border-purple-500 rounded-2xl transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="empresa" className="text-gray-400 ml-1">Empresa</Label>
                                                <div className="relative group">
                                                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
                                                    <Input
                                                        id="empresa"
                                                        value={contactData.empresa}
                                                        onChange={(e) => setContactData(p => ({ ...p, empresa: e.target.value }))}
                                                        placeholder="Nombre de empresa"
                                                        className="h-14 pl-12 bg-gray-950/50 border-gray-800 focus:border-purple-500 rounded-2xl transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="notas" className="text-gray-400 ml-1">¿Cómo podemos ayudarte?</Label>
                                            <div className="relative group">
                                                <StickyNote className="absolute left-4 top-4 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
                                                <Textarea
                                                    id="notas"
                                                    value={contactData.notas}
                                                    onChange={(e) => setContactData(p => ({ ...p, notas: e.target.value }))}
                                                    placeholder="Cuéntanos brevemente tus objetivos..."
                                                    className="min-h-[120px] pl-12 pt-4 bg-gray-950/50 border-gray-800 focus:border-purple-500 rounded-2xl transition-all resize-none"
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full h-16 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-lg rounded-2xl mt-4 shadow-xl shadow-purple-900/30"
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center">
                                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white mr-3" />
                                                    Procesando...
                                                </div>
                                            ) : (
                                                <span className="flex items-center">
                                                    Confirmar Reserva <ArrowRight className="ml-2 w-6 h-6" />
                                                </span>
                                            )}
                                        </Button>
                                    </form>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div
                                key="success"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="max-w-lg mx-auto text-center"
                            >
                                <div className="bg-gray-900/60 p-12 rounded-[3rem] border border-gray-800 backdrop-blur-xl relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 to-blue-500" />

                                    <div className="w-24 h-24 bg-green-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce">
                                        <CheckCircle className="w-12 h-12 text-green-500" />
                                    </div>

                                    <h2 className="text-3xl font-bold mb-4">¡Cita Confirmada!</h2>
                                    <p className="text-gray-400 mb-10 leading-relaxed">
                                        Tu reserva ha sido registrada correctamente. Hemos enviado un correo con los detalles y el enlace a la videollamada.
                                    </p>

                                    <div className="bg-gray-950/80 rounded-3xl p-6 text-left border border-gray-800 mb-8">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                                                <Calendar className="w-6 h-6 text-purple-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-purple-400 font-bold uppercase tracking-widest">Resumen</p>
                                                <p className="font-bold">{format(new Date(selectedDate), "d 'de' MMMM", { locale: es })} • {selectedTime}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                                                <Sparkles className="w-6 h-6 text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">Servicio</p>
                                                <p className="font-bold">{selectedServicio?.nombre}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => window.location.reload()}
                                        variant="outline"
                                        className="border-gray-800 hover:bg-gray-800 rounded-2xl px-8 h-12"
                                    >
                                        Agendar otra cita
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>

            <footer className="relative py-12 text-center text-gray-600 text-xs">
                <p>© 2026 Volkern Business Operating Hub. Reservados todos los derechos.</p>
            </footer>
        </div>
    )
}
