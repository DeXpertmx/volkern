'use client';

import { useState } from 'react';
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from 'framer-motion';
import { ArrowUp } from 'lucide-react';

/**
 * Sticky "Volver arriba" button — reusable across all long public pages.
 * Appears after scrolling 400px, smooth-scrolls to top on click.
 * Spring-animated enter/exit with hover scale and tap feedback.
 */
export default function BackToTop() {
  const { scrollY } = useScroll();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setShowBackToTop(latest > 400);
  });

  return (
    <AnimatePresence>
      {showBackToTop && (
        <motion.button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="fixed bottom-8 right-8 z-50 w-12 h-12 rounded-2xl bg-slate-900/90 backdrop-blur-sm border border-slate-700 text-slate-300 hover:text-white hover:border-blue-500/50 hover:bg-slate-800 shadow-xl shadow-slate-950/50 flex items-center justify-center transition-colors"
          aria-label="Volver arriba"
          title="Volver arriba"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
