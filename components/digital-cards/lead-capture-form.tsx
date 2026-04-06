'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface LeadCaptureFormProps {
    cardId: string;
    cardName: string;
    isOpen: boolean;
    onClose: () => void;
    accentColor?: string;
}

export function LeadCaptureForm({ cardId, cardName, isOpen, onClose, accentColor = '#3B82F6' }: LeadCaptureFormProps) {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        nombre: '',
        email: '',
        telefono: '',
        empresa: '',
        nota: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('/api/tarjetas-digitales/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cardId,
                    ...formData,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error al enviar información');
            }

            setSubmitted(true);
            toast.success('¡Información enviada con éxito!');
        } catch (error: any) {
            console.error('Error in LeadCaptureForm:', error);
            toast.error(error.message || 'Hubo un problema al enviar tu contacto');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[425px] text-center">
                    <div className="py-12 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-green-100">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-center">¡Gracias por conectar!</DialogTitle>
                            <DialogDescription className="text-center text-lg">
                                Tu información ha sido enviada a <strong>{cardName}</strong>. Se pondrán en contacto contigo pronto.
                            </DialogDescription>
                        </DialogHeader>
                        <Button onClick={onClose} className="mt-6 w-full" style={{ backgroundColor: accentColor }}>
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Intercambiar contacto</DialogTitle>
                    <DialogDescription>
                        Envía tu información a {cardName} para conectar profesionalmente.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="nombre">Nombre Completo *</Label>
                        <Input
                            id="nombre"
                            name="nombre"
                            value={formData.nombre}
                            onChange={handleChange}
                            placeholder="Ej: Ana García"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="ana@ejemplo.com"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="telefono">WhatsApp / Tel</Label>
                            <Input
                                id="telefono"
                                name="telefono"
                                type="tel"
                                value={formData.telefono}
                                onChange={handleChange}
                                placeholder="+52 55..."
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="empresa">Empresa</Label>
                        <Input
                            id="empresa"
                            name="empresa"
                            value={formData.empresa}
                            onChange={handleChange}
                            placeholder="Nombre de tu empresa"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="nota">Mensaje (opcional)</Label>
                        <Textarea
                            id="nota"
                            name="nota"
                            value={formData.nota}
                            onChange={handleChange}
                            placeholder="¿Cómo te gustaría conectar?"
                            rows={3}
                        />
                    </div>
                    <DialogFooter className="mt-6">
                        <Button
                            type="submit"
                            className="w-full gap-2"
                            disabled={loading}
                            style={{ backgroundColor: accentColor }}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {loading ? 'Enviando...' : 'Enviar mi contacto'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
