'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export function ImageUploader({ images, onChange, maxImages = 10 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const isSingleImageMode = maxImages === 1;

    // Verificar límite si NO es modo de imagen única
    if (!isSingleImageMode && images.length + files.length > maxImages) {
      toast.error(`Máximo ${maxImages} imágenes permitidas`);
      return;
    }

    setUploading(true);
    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validar tipo
      const isImage = !file.type || file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
      if (!isImage) {
        toast.error(`${file.name} no es una imagen válida`);
        continue;
      }

      // Validar tamaño (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} excede el límite de 5MB`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload/catalogo', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const error = await res.json();
          toast.error(error.error || 'Error al subir imagen');
          continue;
        }

        const data = await res.json();
        newImages.push(data.url);
      } catch (error) {
        console.error('Error uploading:', error);
        toast.error(`Error al subir ${file.name}`);
      }
    }

    if (newImages.length > 0) {
      if (isSingleImageMode) {
        onChange([newImages[newImages.length - 1]]); // Reemplazar con la última
      } else {
        onChange([...images, ...newImages]);
      }
      toast.success(`${newImages.length} imagen(es) subida(s)`);
    }

    setUploading(false);
    // Limpiar input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onChange(newImages);
  };

  return (
    <div className="space-y-3">
      {/* Grid de imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((url, index) => (
            <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border bg-muted">
              <Image
                src={url}
                alt={`Imagen ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Área de upload */}
      <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 hover:border-primary/50 transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*, .png, .jpg, .jpeg, .webp"
          multiple={maxImages > 1}
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading || (maxImages !== 1 && images.length >= maxImages)}
        />
        
        {uploading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Subiendo...</span>
          </div>
        ) : (
          <>
            <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={maxImages !== 1 && images.length >= maxImages}
            >
              <Upload className="h-4 w-4 mr-2" />
              {maxImages === 1 && images.length > 0 ? 'Reemplazar imagen' : 'Subir imágenes'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {images.length}/{maxImages} imágenes • Máx. 5MB por imagen
            </p>
          </>
        )}
      </div>
    </div>
  );
}
