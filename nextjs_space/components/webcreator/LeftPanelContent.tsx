import React from "react";
import { Search, Plus, Type, Database, Layout as LayoutIcon, Users, History, Sparkles, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { AiBlockGenerator } from "./AiBlockGenerator";

interface LeftPanelContentProps {
  activePanel: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  historyItems: string[];
  onUndo: () => void;
  versionHistory: Array<{id: string; timestamp: string; description: string}> | null;
  currentVersionIndex: number;
  onRestoreVersion: (index: number) => void;
  onOpenAIGenerator: () => void;
  seoData: {
    metaTitulo: string;
    metaDescripcion: string;
    metaKeywords: string;
    metaImagen: string;
    scriptsHead: string;
    scriptsBody: string;
  };
  setSeoData: {
    setMetaTitulo: (val: string) => void;
    setMetaDescripcion: (val: string) => void;
    setMetaKeywords: (val: string) => void;
    setMetaImagen: (val: string) => void;
    setScriptsHead: (val: string) => void;
    setScriptsBody: (val: string) => void;
  };
  onGenerateSeo: () => void;
  isGeneratingSeo: boolean;
}

const LeftPanelContent: React.FC<LeftPanelContentProps> = ({
  activePanel,
  searchQuery,
  onSearchChange,
  historyItems,
  onUndo,
  versionHistory,
  currentVersionIndex,
  onRestoreVersion,
  onOpenAIGenerator,
  seoData,
  setSeoData,
  onGenerateSeo,
  isGeneratingSeo,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const isSmallFile = file.size < 4 * 1024 * 1024; // < 4MB
      let finalUrl = '';

      if (isSmallFile) {
        // Flujo A: Archivo pequeño (<4MB), subir vía servidor para evitar problemas de CORS
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload/catalogo', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Error al subir imagen");
        }

        const data = await response.json();
        if (!data.url) {
          throw new Error("No se recibió la URL de la imagen");
        }
        finalUrl = data.url;
      } else {
        // Flujo B: Archivo grande (>=4MB), subir directamente a almacenamiento usando URL firmada
        const presignedRes = await fetch('/api/upload/catalogo/presigned', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || 'image/png',
          }),
        });

        if (!presignedRes.ok) {
          const errorData = await presignedRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Error al autorizar carga');
        }

        const { uploadUrl, publicUrl } = await presignedRes.json();

        // Determinar Content-Type mapeado
        let contentType = file.type || 'image/png';
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'gif') {
          contentType = 'image/gif';
        } else if (ext === 'png') {
          contentType = 'image/png';
        } else if (ext === 'jpg' || ext === 'jpeg') {
          contentType = 'image/jpeg';
        } else if (ext === 'webp') {
          contentType = 'image/webp';
        } else if (ext === 'svg') {
          contentType = 'image/svg+xml';
        }

        // Subir directamente a almacenamiento
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Error en la carga directa al almacenamiento (${uploadRes.status}). Verifica la configuración CORS de tu bucket S3/R2.`);
        }

        finalUrl = publicUrl;
      }

      setSeoData.setMetaImagen(finalUrl);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al subir la imagen");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {activePanel === "blocks" && (
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Buscar bloques..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all dark:text-gray-200"
              />
            </div>
          </div>
          <div id="blocks-container" className="p-4" />
        </div>
      )}

      {activePanel === "history" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {historyItems.length > 0 ? `${historyItems.length} cambios registrados` : "Sin cambios registrados"}
            </p>
            <button
              onClick={onUndo}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold"
            >
              Deshacer último
            </button>
          </div>
          {historyItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <History className="mx-auto mb-3" size={28} />
              <p className="text-sm">Comienza a editar para ver el historial</p>
            </div>
          ) : (
            <div className="space-y-1">
              {historyItems.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    i === 0 ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-purple-500' : 'bg-gray-300 dark:bg-sale-600'}`} />
                  <span className="truncate">{item}</span>
                  {i === 0 && <span className="ml-auto text-[10px] font-bold text-purple-500 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full">ACTUAL</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === "versions" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {versionHistory?.length || 0} versiones guardadas
            </p>
            <button
              onClick={() => {
                if (currentVersionIndex >= 0 && versionHistory && versionHistory.length > 0) {
                  onRestoreVersion(currentVersionIndex);
                }
              }}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold disabled:opacity-50"
              disabled={currentVersionIndex < 0 || !versionHistory || versionHistory.length === 0}
            >
              Restaurar versión actual
            </button>
          </div>
          {(!versionHistory || versionHistory.length === 0) ? (
            <div className="text-center py-8 text-gray-400">
              <History className="mx-auto mb-3" size={28} />
              <p className="text-sm">No hay versiones guardadas todavía</p>
              <p className="text-xs mt-2">Las versiones se guardan automáticamente cada 5 segundos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versionHistory.map((version, i) => (
                <div
                  key={version.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 ${
                    i === currentVersionIndex 
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200' 
                      : 'bg-white dark:bg-slate-950 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                      {version.description}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(version.timestamp).toLocaleString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => onRestoreVersion(i)}
                    className="p-1.5 text-purple-600 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-all"
                    title="Restaurar esta versión"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 16 12 10 8 14"></polyline>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === "layers" && (
        <div className="p-4">
          <div id="layers-container" className="gjs-custom-layers" />
        </div>
      )}

      {activePanel === "assets" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Biblioteca de medios</h3>
            <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
              <Plus size={14} />
              <span>Subir</span>
            </button>
          </div>
          <div id="assets-manager" />
        </div>
      )}

      {activePanel === "styles" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Estilos personalizados</h3>
            <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
              <Plus size={14} />
              <span>Nuevo</span>
            </button>
          </div>
          <div id="styles-manager" className="mt-4" />
        </div>
      )}

      {activePanel === "cms" && (
        <div className="p-5 overflow-y-auto h-full">
          <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-purple-900/30 rounded-2xl p-6 mb-6 border border-purple-100 dark:border-purple-900/50 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 text-purple-700 dark:text-purple-300 mb-4">
              <div className="p-2 bg-purple-200/50 dark:bg-purple-900/50 rounded-lg">
                <Type size={18} className="fill-purple-700 dark:fill-purple-300" />
              </div>
              <span className="font-bold text-sm uppercase tracking-tight">AI Content Generation</span>
            </div>
            <p className="text-xs text-purple-600/85 dark:text-purple-300/85 leading-relaxed mb-5">Genera textos, imágenes y secciones completas usando el contexto de tu CRM.</p>
            <button 
              onClick={() => onOpenAIGenerator()}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 dark:from-purple-600 dark:to-purple-700 dark:hover:from-purple-700 dark:hover:to-purple-800 text-white text-xs font-bold py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
            >
              <Type size={14} className="fill-white group-hover:scale-110 transition-transform" />
              Abrir Copiloto
            </button>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Tus Colecciones</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Organiza y reutiliza contenido</p>
              </div>
              <button className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md">
                <Plus size={14} />
                <span>Nueva</span>
              </button>
            </div>
            <div className="space-y-2.5">
              {[
                { name: "Blogs", count: 12, icon: <Type size={16} />, color: "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
                { name: "Servicios", count: 8, icon: <Database size={16} />, color: "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400" },
                { name: "Testimonios", count: 24, icon: <LayoutIcon size={16} />, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400" },
                { name: "Equipo", count: 5, icon: <Users size={16} />, color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" },
              ].map(collection => (
                <div key={collection.name} className="flex items-center justify-between group cursor-pointer bg-white dark:bg-slate-800/50 hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-slate-800 dark:hover:to-transparent p-4 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${collection.color} group-hover:scale-110 transition-transform`}>
                      {collection.icon}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{collection.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">{collection.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activePanel === "variables" && (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950">
           {/* Lazy loading VariableDocumentationPanel */}
           {(() => {
              const { VariableDocumentationPanel } = require("./VariableDocumentationPanel");
              return <VariableDocumentationPanel />;
           })()}
        </div>
      )}

      {activePanel === "seo" && (
        <div className="p-5 space-y-6 overflow-y-auto h-full custom-scrollbar">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Optimización SEO</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configura cómo se verá tu página.</p>
            </div>
            <button
              onClick={onGenerateSeo}
              disabled={isGeneratingSeo}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-200 dark:shadow-none hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {isGeneratingSeo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {isGeneratingSeo ? "Generando..." : "Optimizar con IA"}
            </button>
          </div>

          <div className="space-y-4">
            {/* Google Preview */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Vista previa en Google</p>
              <div className="space-y-1">
                <div className="text-[#1a0dab] dark:text-[#8ab4f8] text-lg font-medium hover:underline cursor-pointer truncate">
                  {seoData.metaTitulo || "Título de la página - Volkern CMS"}
                </div>
                <div className="text-[#006621] dark:text-[#81ea67] text-sm truncate">
                  https://tusitio.com/{seoData.metaTitulo.toLowerCase().replace(/\s+/g, '-')}
                </div>
                <div className="text-[#4d5156] dark:text-[#bdc1c6] text-sm line-clamp-2 leading-relaxed">
                  {seoData.metaDescripcion || "Añade una descripción meta para mejorar el posicionamiento de tu sitio en los resultados de búsqueda."}
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1">Imagen Destacada (Social Share)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={seoData.metaImagen}
                      onChange={(e) => setSeoData.setMetaImagen(e.target.value)}
                      placeholder="URL de la imagen..."
                      className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-all dark:text-gray-200"
                    />
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {seoData.metaImagen && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 dark:border-slate-800 aspect-video relative group">
                    <img src={seoData.metaImagen} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setSeoData.setMetaImagen('')}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                       <Plus className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1">Meta Título</label>
                <input
                  type="text"
                  value={seoData.metaTitulo}
                  onChange={(e) => setSeoData.setMetaTitulo(e.target.value)}
                  placeholder="Título para buscadores..."
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-all dark:text-gray-200"
                />
                <div className="flex justify-between px-1">
                  <p className="text-[10px] text-gray-400">Recomendado: 50-60 caracteres</p>
                  <p className={`text-[10px] font-bold ${seoData.metaTitulo.length > 60 ? 'text-amber-500' : 'text-gray-400'}`}>{seoData.metaTitulo.length}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1">Meta Descripción</label>
                <textarea
                  value={seoData.metaDescripcion}
                  onChange={(e) => setSeoData.setMetaDescripcion(e.target.value)}
                  placeholder="Descripción breve del contenido..."
                  rows={4}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-all resize-none dark:text-gray-200"
                />
                <div className="flex justify-between px-1">
                  <p className="text-[10px] text-gray-400">Recomendado: 120-160 caracteres</p>
                  <p className={`text-[10px] font-bold ${seoData.metaDescripcion.length > 160 ? 'text-amber-500' : 'text-gray-400'}`}>{seoData.metaDescripcion.length}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1">Keywords (Separadas por comas)</label>
                <input
                  type="text"
                  value={seoData.metaKeywords}
                  onChange={(e) => setSeoData.setMetaKeywords(e.target.value)}
                  placeholder="marketing, ventas, saas..."
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-all dark:text-gray-200"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Scripts Avanzados</h4>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Scripts en HEAD (Analytics, Pixel...)
                  </label>
                  <textarea
                    value={seoData.scriptsHead}
                    onChange={(e) => setSeoData.setScriptsHead(e.target.value)}
                    placeholder="<!-- Google Tag Manager -->..."
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[11px] font-mono outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 transition-all resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Scripts al final del BODY
                  </label>
                  <textarea
                    value={seoData.scriptsBody}
                    onChange={(e) => setSeoData.setScriptsBody(e.target.value)}
                    placeholder="<script>console.log('hola');</script>..."
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[11px] font-mono outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-900 transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePanel === "ai" && (
        <div className="p-5 space-y-6">
          <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold text-lg">Gemma 4 AI Assistant</h2>
          </div>
          
          <AiBlockGenerator 
            onBlockGenerated={(block) => {
              // Lógica para añadir el bloque al editor
              window.dispatchEvent(new CustomEvent('editor:add-block', { detail: block }));
            }} 
          />
          
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sugerencias Rápidas</h3>
            <div className="grid grid-cols-1 gap-2">
              {[
                "Generar Hero con formulario",
                "Crear sección de Precios",
                "Bloque de Testimonios dinámicos",
                "FAQ con acordeón"
              ].map(suggest => (
                <button 
                  key={suggest}
                  className="text-left p-3 text-xs bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg border border-transparent hover:border-indigo-100 transition-all text-slate-600 dark:text-slate-400"
                >
                  {suggest}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeftPanelContent;
