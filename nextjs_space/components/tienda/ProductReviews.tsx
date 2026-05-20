'use client';

interface ProductReviewsProps {
  reviews: {
    id: string;
    rating: number;
    titulo: string | null;
    comentario: string | null;
    verificado: boolean;
    createdAt: string;
    contact: { nombre: string; email: string } | null;
  }[];
}

export function ProductReviews({ reviews }: ProductReviewsProps) {
  return (
    <div className="space-y-6">
      {reviews.map((review) => (
        <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg
                      key={i}
                      className={`w-4 h-4 ${
                        i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                {review.verificado && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                    Compra verificada
                  </span>
                )}
              </div>
              {review.titulo && (
                <h4 className="font-semibold text-gray-900 mt-2">{review.titulo}</h4>
              )}
            </div>
            <time className="text-sm text-gray-500">
              {new Date(review.createdAt).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          </div>
          {review.comentario && (
            <p className="mt-3 text-gray-600 leading-relaxed">{review.comentario}</p>
          )}
          <p className="mt-2 text-sm text-gray-500">
            Por: {review.contact?.nombre || 'Anónimo'}
          </p>
        </div>
      ))}
    </div>
  );
}
