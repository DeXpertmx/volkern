import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  ShieldCheck, 
  Building, 
  User, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  Mail,
  CreditCard,
  MapPin,
  Percent
} from 'lucide-react'
import { validateSpanishID } from '@/lib/utils/tax-validator'
import { cn } from '@/lib/utils'

interface FiscalOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (fiscalData: any) => void
  leadName: string
  isConverting: boolean
}

export function FiscalOnboardingModal({
  isOpen,
  onClose,
  onConfirm,
  leadName,
  isConverting
}: FiscalOnboardingModalProps) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    tipo: 'EMPRESA',
    nif: '',
    razonSocial: leadName,
    address: '',
    zipCode: '',
    city: '',
    province: '',
    country: 'ES',
    tipoIdFiscal: 'CIF',
    defaultIva: '21.0',
    defaultIrpf: '0.0',
    recargoEquivalencia: false,
    emailFacturacion: '',
    iban: '',
    // Campos México
    rfc: '',
    regimenFiscal: '601', // General de Ley Personas Morales
    usoCFDI: 'G03' // Gastos en general
  })

  const [viesStatus, setViesStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setViesStatus('idle')
      setErrors({})
    }
  }, [isOpen])

  const validateCurrentStep = () => {
    const newErrors: Record<string, string> = {}
    
    if (step === 1) {
      if (!formData.nif) {
        newErrors.nif = 'Requerido'
      } else if (formData.country === 'ES') {
        const result = validateSpanishID(formData.nif)
        if (!result.isValid) {
          newErrors.nif = result.error || 'Formato inválido'
        }
      }
      if (!formData.razonSocial) newErrors.razonSocial = 'Requerido'
      
      if (formData.country === 'MX') {
        const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[012])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$/
        if (!formData.rfc) {
          newErrors.rfc = 'RFC Requerido'
        } else if (!rfcRegex.test(formData.rfc.toUpperCase())) {
          newErrors.rfc = 'Formato de RFC inválido'
        }
      }
    }

    if (step === 2) {
      if (!formData.address) newErrors.address = 'Requerido'
      if (!formData.zipCode) newErrors.zipCode = 'Requerido'
      else if (formData.country === 'ES' && !/^[0-9]{5}$/.test(formData.zipCode)) {
        newErrors.zipCode = 'CP debe ser de 5 dígitos'
      }
      if (!formData.city) newErrors.city = 'Requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateCurrentStep()) {
      setStep(s => s + 1)
    }
  }

  const handleBack = () => setStep(s => s - 1)

  const handleValidateVies = () => {
    if (!formData.nif || errors.nif) return

    setViesStatus('loading')
    setTimeout(() => {
      setViesStatus('success')
    }, 1500)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateCurrentStep()) {
      onConfirm(formData)
    }
  }

  const stepTitles = [
    'Identidad Fiscal',
    'Localización',
    'Configuración de Impuestos',
    'Datos de Operación'
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Gobernanza Veri*factu</DialogTitle>
              <DialogDescription>
                Paso {step} de 4: {stepTitles[step - 1]}
              </DialogDescription>
            </div>
          </div>
          
          {/* Stepper Progress */}
          <div className="flex gap-1 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <div 
                key={i} 
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all duration-300",
                  step >= i ? "bg-emerald-500" : "bg-muted"
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="py-6 min-h-[320px]">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Sujeto</Label>
                  <Select 
                    value={formData.tipo} 
                    onValueChange={(v) => {
                      const type = v === 'EMPRESA' ? 'CIF' : 'NIF'
                      setFormData({ 
                        ...formData, 
                        tipo: v, 
                        tipoIdFiscal: type,
                        defaultIrpf: v === 'EMPRESA' ? '0.0' : formData.defaultIrpf 
                      })
                      setViesStatus('idle')
                    }}
                  >
                    <SelectTrigger id="tipo" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTONOMO">Autónomo (Física)</SelectItem>
                      <SelectItem value="EMPRESA">Empresa (Jurídica)</SelectItem>
                      <SelectItem value="CLIENTE_EXTRANJERO">Extranjero / UE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">País</Label>
                  <Select 
                    value={formData.country} 
                    onValueChange={(v) => {
                      setFormData({ ...formData, country: v })
                      setViesStatus('idle')
                    }}
                  >
                    <SelectTrigger id="country" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ES">España</SelectItem>
                      <SelectItem value="AD">Andorra</SelectItem>
                      <SelectItem value="PT">Portugal</SelectItem>
                      <SelectItem value="FR">Francia</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <Label htmlFor="nif">{formData.country === 'ES' ? 'NIF / CIF' : 'Tax ID / VAT'}</Label>
                  {formData.country === 'ES' && (
                    <button 
                      type="button"
                      onClick={handleValidateVies}
                      disabled={viesStatus === 'loading' || !formData.nif || !!errors.nif}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 flex items-center gap-1 transition-all"
                    >
                      {viesStatus === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                      Validar AEAT (VIES)
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="nif"
                    required
                    placeholder="Ej: B12345678"
                    className={cn(
                      "h-11 pr-10 uppercase font-mono tracking-wider",
                      errors.nif ? "border-destructive focus-visible:ring-destructive" : 
                      viesStatus === 'success' ? "border-emerald-500 focus-visible:ring-emerald-500" : ""
                    )}
                    value={formData.nif}
                    onChange={(e) => {
                      setFormData({ ...formData, nif: e.target.value.toUpperCase() })
                      setViesStatus('idle')
                      setErrors({ ...errors, nif: '' })
                    }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {viesStatus === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500 animate-in zoom-in" />}
                    {errors.nif && <AlertCircle className="h-5 w-5 text-destructive animate-pulse" />}
                  </div>
                </div>
                {errors.nif && <p className="text-[10px] text-destructive font-bold uppercase">{errors.nif}</p>}
                {viesStatus === 'success' && <p className="text-[10px] text-emerald-600 font-bold uppercase">Formato verificado en Censo AEAT (Simulado)</p>}
              </div>

              {formData.country === 'MX' && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <Label htmlFor="rfc">RFC (México)</Label>
                  <div className="relative">
                    <Input
                      id="rfc"
                      required
                      placeholder="ABCD123456XYZ"
                      className={cn(
                        "h-11 uppercase font-mono tracking-wider",
                        errors.rfc ? "border-destructive" : ""
                      )}
                      value={formData.rfc}
                      onChange={(e) => {
                        setFormData({ ...formData, rfc: e.target.value.toUpperCase() })
                        setErrors({ ...errors, rfc: '' })
                      }}
                    />
                    {errors.rfc && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-destructive" />}
                  </div>
                  {errors.rfc && <p className="text-[10px] text-destructive font-bold uppercase">{errors.rfc}</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="razonSocial">Nombre o Razón Social</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="razonSocial"
                    required
                    placeholder="Nombre legal completo"
                    className="h-11 pl-10"
                    value={formData.razonSocial}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Label htmlFor="address">Dirección Fiscal Completa</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="address"
                    required
                    placeholder="Calle, número, piso, puerta..."
                    className="h-11 pl-10"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zipCode">Código Postal</Label>
                  <Input
                    id="zipCode"
                    required
                    placeholder="28001"
                    maxLength={5}
                    className={cn("h-11", errors.zipCode && "border-destructive")}
                    value={formData.zipCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      setFormData({ ...formData, zipCode: val })
                      setErrors({ ...errors, zipCode: '' })
                    }}
                  />
                  {errors.zipCode && <p className="text-[10px] text-destructive font-bold uppercase">{errors.zipCode}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Localidad / Ciudad</Label>
                  <Input
                    id="city"
                    required
                    placeholder="Madrid"
                    className="h-11"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="province">Provincia</Label>
                <Input
                  id="province"
                  placeholder="Madrid"
                  className="h-11"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3 text-emerald-800 text-sm">
                <Percent className="h-5 w-5 shrink-0 mt-0.5" />
                <p>Configura las reglas impositivas predeterminadas para este cliente. Esto automatiza tus facturas Veri*factu.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultIva">Régimen de IVA Predeterminado</Label>
                <Select 
                  value={formData.defaultIva} 
                  onValueChange={(v) => setFormData({ ...formData, defaultIva: v })}
                >
                  <SelectTrigger id="defaultIva" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="21.0">General (21%)</SelectItem>
                    <SelectItem value="10.0">Reducido (10%)</SelectItem>
                    <SelectItem value="4.0">Superreducido (4%)</SelectItem>
                    <SelectItem value="0.0">Exento (0%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultIrpf">Retención IRPF (%)</Label>
                  <Select 
                    value={formData.defaultIrpf} 
                    disabled={formData.tipo === 'EMPRESA'}
                    onValueChange={(v) => setFormData({ ...formData, defaultIrpf: v })}
                  >
                    <SelectTrigger id="defaultIrpf" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.0">Sin retención (0%)</SelectItem>
                      <SelectItem value="7.0">Profesionales inicio (7%)</SelectItem>
                      <SelectItem value="15.0">Profesionales general (15%)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.tipo === 'EMPRESA' && <p className="text-[10px] text-muted-foreground italic">IRPF bloqueado al 0% para Empresas</p>}
                </div>
              </div>

              {formData.country === 'MX' && (
                <div className="pt-4 border-t space-y-4 animate-in fade-in duration-300">
                  <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Datos SAT (CFDI 4.0)
                  </h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="regimenFiscal">Régimen Fiscal</Label>
                    <Select 
                      value={formData.regimenFiscal} 
                      onValueChange={(v) => setFormData({ ...formData, regimenFiscal: v })}
                    >
                      <SelectTrigger id="regimenFiscal" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="601">601 - General de Ley Personas Morales</SelectItem>
                        <SelectItem value="603">603 - Personas Morales con Fines no Lucrativos</SelectItem>
                        <SelectItem value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</SelectItem>
                        <SelectItem value="606">606 - Arrendamiento</SelectItem>
                        <SelectItem value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</SelectItem>
                        <SelectItem value="626">626 - Régimen Simplificado de Confianza (RESICO)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="usoCFDI">Uso de CFDI</Label>
                    <Select 
                      value={formData.usoCFDI} 
                      onValueChange={(v) => setFormData({ ...formData, usoCFDI: v })}
                    >
                      <SelectTrigger id="usoCFDI" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="G01">G01 - Adquisición de mercancías</SelectItem>
                        <SelectItem value="G03">G03 - Gastos en general</SelectItem>
                        <SelectItem value="I01">I01 - Construcciones</SelectItem>
                        <SelectItem value="I02">I02 - Mobiliario y equipo de oficina</SelectItem>
                        <SelectItem value="I04">I04 - Equipo de transporte</SelectItem>
                        <SelectItem value="I08">I08 - Otros activos</SelectItem>
                        <SelectItem value="P01">P01 - Por definir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Label htmlFor="emailFacturacion">Email de Facturación</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailFacturacion"
                    type="email"
                    placeholder="facturacion@cliente.com"
                    className="h-11 pl-10"
                    value={formData.emailFacturacion}
                    onChange={(e) => setFormData({ ...formData, emailFacturacion: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Opcional. Si queda vacío, se usará el email principal.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="iban">IBAN / Cuenta Bancaria</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="iban"
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    className="h-11 pl-10 font-mono"
                    value={formData.iban}
                    onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border flex gap-3 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>Al confirmar, este contacto quedará validado fiscalmente y sus facturas se encadenarán criptográficamente bajo el estándar Veri*factu 2026.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          {step > 1 && (
            <Button 
              variant="outline" 
              onClick={handleBack} 
              disabled={isConverting}
              className="font-bold"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
          )}
          
          {step < 4 ? (
            <Button 
              onClick={handleNext} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold ml-auto"
            >
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold ml-auto"
              onClick={handleSubmit}
              disabled={isConverting}
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Efectuando Alta...
                </>
              ) : 'Finalizar Alta Fiscal'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
