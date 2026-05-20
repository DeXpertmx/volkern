'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ProductGalleryProps {
  images: any[];
  nombre: string;
}

export function ProductGallery({ images, nombre }: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const validImages = images.filter(
    (img) => img && (img.url || img.src)
  );

  if (validImages.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
        <svg className="w-24 h-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  const getImageUrl = (img: any) => img.url || img.src;

  return (
    <div>
      {/* Main image */}
      <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden mb-4">
        <Image
          src={getImageUrl(validImages[currentIndex])}
          alt={nombre}
          fill
          className="object-cover"
        />
      </div>

      {/* Thumbnails */}
      {validImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {validImages.map((img, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                currentIndex === index
                  ? 'border-primary'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Image
                src={getImageUrl(img)}
                alt={`${nombre} - ${index + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
