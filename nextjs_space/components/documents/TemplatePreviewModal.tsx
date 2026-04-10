"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Monitor, Tablet, Smartphone, X } from "lucide-react";

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  html: string;
  css: string;
  loading?: boolean;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  templateName,
  html,
  css,
  loading = false,
}) => {
  const [device, setDevice] = React.useState<"desktop" | "tablet" | "mobile">("desktop");

  const combinedContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${css}
          /* A4 Simulation in Preview */
          body { 
            background: #f1f5f9; 
            margin: 0; 
            padding: 20px; 
            display: flex; 
            justify-content: center; 
          }
          #preview-wrapper {
            background: white;
            width: 210mm;
            min-height: 297mm;
            padding: 1in;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            transform-origin: top center;
          }
          /* Custom overrides for preview scaling */
          @media (max-width: 800px) {
            #preview-wrapper { width: 95%; padding: 0.5in; }
          }
        </style>
      </head>
      <body>
        <div id="preview-wrapper">
          ${html}
        </div>
      </body>
    </html>
  `;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-white dark:bg-slate-900 border-b flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Monitor className="h-5 w-5 text-indigo-600" />
              Vista Previa: <span className="text-indigo-900 dark:text-indigo-400">{templateName}</span>
            </DialogTitle>
            <DialogDescription>
              Visualiza cómo se verá el documento final antes de aplicarlo.
            </DialogDescription>
          </div>
          
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
             <button 
                onClick={() => setDevice("desktop")}
                className={`p-2 rounded-lg transition-all ${device === 'desktop' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
             >
                <Monitor size={16} />
             </button>
             <button 
                onClick={() => setDevice("tablet")}
                className={`p-2 rounded-lg transition-all ${device === 'tablet' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
             >
                <Tablet size={16} />
             </button>
             <button 
                onClick={() => setDevice("mobile")}
                className={`p-2 rounded-lg transition-all ${device === 'mobile' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
             >
                <Smartphone size={16} />
             </button>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto flex justify-center p-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Generando vista previa...</p>
            </div>
          ) : (
            <div 
                className="transition-all duration-500 ease-in-out origin-top"
                style={{ 
                    width: device === 'desktop' ? '1000px' : device === 'tablet' ? '768px' : '375px',
                    maxWidth: '100%' 
                }}
            >
                <iframe
                    title="Template Preview"
                    srcDoc={combinedContent}
                    className="w-full h-full min-h-[1200px] border-none shadow-lg rounded-md bg-white"
                />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
