'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  File, 
  Upload, 
  Download, 
  Trash2, 
  Loader2, 
  Plus,
  Paperclip,
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Attachment {
  id: string;
  nombre: string;
  tipoArchivo: string;
  tamano: number;
  cloud_storage_path: string;
  descripcion?: string;
  fechaSubida: string;
  usuario?: {
    name: string;
  };
}

interface LeadAttachmentsProps {
  leadId: string;
}

export function LeadAttachments({ leadId }: LeadAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/leads/${leadId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leadId) fetchAttachments();
  }, [leadId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      
      if (!validTypes.includes(file.type)) {
        toast.error('Solo se permiten archivos PDF, PNG o JPG');
        return;
      }
      
      setFileToUpload(file);
    }
  };

  const handleUpload = async () => {
    if (!fileToUpload) return;

    setUploading(true);
    try {
      // 1. Subir a S3 usando el endpoint existente
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('type', 'document');

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Error al subir a S3');
      const uploadData = await uploadRes.json();

      // 2. Registrar en la base de datos de leads
      const registRes = await fetch(`/api/leads/${leadId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: fileToUpload.name,
          tipoArchivo: fileToUpload.type,
          tamano: fileToUpload.size,
          cloud_storage_path: uploadData.cloud_storage_path,
          descripcion: ''
        })
      });

      if (registRes.ok) {
        toast.success('Archivo subido correctamente');
        setFileToUpload(null);
        setShowUpload(false);
        fetchAttachments();
      } else {
        toast.error('Error al registrar documento');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error durante la subida');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este documento?')) return;

    try {
      const res = await fetch(`/api/leads/${leadId}/attachments?attachmentId=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Documento eliminado');
        fetchAttachments();
      }
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const getIcon = (type: string) => {
    if (type.includes('image')) return <ImageIcon className="text-blue-500" />;
    if (type.includes('pdf')) return <FileText className="text-red-500" />;
    return <File className="text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-blue-600" />
            Documentos Adjuntos
          </CardTitle>
          <CardDescription>PDF, PNG o JPG vinculados a este lead</CardDescription>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowUpload(!showUpload)}
          className="rounded-full shadow-sm"
        >
          {showUpload ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-2" />}
          {showUpload ? 'Cerrar' : 'Añadir'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showUpload && (
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-200 bg-white p-6 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
              <input 
                type="file" 
                id="file-upload" 
                className="hidden" 
                onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg"
              />
              <label htmlFor="file-upload" className="w-full text-center cursor-pointer">
                {!fileToUpload ? (
                  <>
                    <Upload className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Seleccionar archivo</p>
                    <p className="text-xs text-slate-500 mt-1">Sube PDF, PNG o JPG (Máx 10MB)</p>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    {getIcon(fileToUpload.type)}
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800 line-clamp-1">{fileToUpload.name}</p>
                      <p className="text-xs text-slate-500">{formatSize(fileToUpload.size)}</p>
                    </div>
                  </div>
                )}
              </label>
            </div>
            
            {fileToUpload && (
              <Button 
                onClick={handleUpload} 
                disabled={uploading} 
                className="w-full rounded-xl premium-gradient-primary"
              >
                {uploading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Comenzar Subida
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin h-6 w-6 text-slate-300" />
          </div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
            <File className="h-10 w-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500 uppercase font-bold tracking-tight">Sin documentos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((file) => (
              <div 
                key={file.id} 
                className="group p-3 border border-slate-100 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition-colors"
              >
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  {getIcon(file.tipoArchivo)}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate" title={file.nombre}>
                    {file.nombre}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                    <span>{formatSize(file.tamano)}</span>
                    <span>•</span>
                    <span>{format(new Date(file.fechaSubida), 'PPp', { locale: es })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    asChild
                  >
                    <a href={file.cloud_storage_path} target="_blank" rel="noopener noreferrer">
                      <Download size={16} />
                    </a>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(file.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
