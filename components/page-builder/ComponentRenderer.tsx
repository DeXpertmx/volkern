import { PageComponent } from "@/lib/page-builder";
import NextImage from "next/image";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComponentRendererProps {
  component: PageComponent;
  isSelected: boolean;
  onSelect: (id: string) => void;
  deviceMode?: "desktop" | "tablet" | "mobile";
  isPublic?: boolean;
  tenantId?: string | null;
  isOverlay?: boolean;
  onUpdateProps?: (id: string, props: Record<string, any>) => void;
}

export function ComponentRenderer({
  component,
  isSelected,
  onSelect,
  deviceMode = "desktop",
  isPublic = false,
  tenantId,
  isOverlay = false,
  onUpdateProps,
}: ComponentRendererProps) {
  const { type, props, children } = component;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: component.id,
    disabled: isPublic // Deshabilitar D&D en vista pública
  });

  const isPixelPerfect = (props.x !== undefined || props.y !== undefined) && !['section', 'container'].includes(type);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : (props.opacity !== undefined ? props.opacity : 1),
    zIndex: props.zIndex || (isSelected ? 50 : 0),
    padding: props.padding || "0",
    margin: props.margin || "0",
    backgroundColor: props.backgroundColor || "transparent",
    backgroundImage: props.backgroundImage || undefined,
    borderRadius: props.borderRadius || "0",
    boxShadow: props.boxShadow || "none",
    borderWidth: props.borderWidth || "0",
    borderStyle: props.borderStyle || "solid",
    borderColor: props.borderColor || "transparent",
    animation: props.animation && props.animation !== "none" ? `${props.animation} 0.5s ease-out` : undefined,
    // Pixel Perfect Positioning
    ...(isPixelPerfect ? {
      position: "absolute",
      left: `${props.x || 0}px`,
      top: `${props.y || 0}px`,
      width: props.width || 'auto',
      height: props.height || 'auto',
    } : {
      position: "relative",
    })
  };

  const combinedStyle = style;

  // Check device-specific visibility
  const shouldHide =
    (deviceMode === "mobile" && props.hideMobile) ||
    (deviceMode === "tablet" && props.hideTablet) ||
    (deviceMode === "desktop" && props.hideDesktop);

  // If hidden on current device, don't render
  if (shouldHide) {
    return null;
  }

  const wrapperClass = cn(
    "relative cursor-pointer transition-all duration-200 group",
    isSelected
      ? "ring-2 ring-blue-500 shadow-xl z-50 ring-offset-2 ring-offset-white"
      : "hover:ring-2 hover:ring-blue-300 hover:z-40",
    isDragging && "opacity-30 grayscale",
    !isPublic && "select-none"
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  // Renderizado recursivo de hijos
  const renderChildren = () => {
    if (!children || children.length === 0) return null;

    return (
      <SortableContext
        items={children.map(c => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {children.map((child: PageComponent) => (
          <ComponentRenderer
            key={child.id}
            component={child}
            isSelected={false}
            onSelect={onSelect}
            deviceMode={deviceMode}
            isPublic={isPublic}
            tenantId={tenantId}
            onUpdateProps={onUpdateProps}
          />
        ))}
      </SortableContext>
    );
  };

  // Botón para arrastrar (solo en editor)
  const EditorUI = !isPublic && (
    <>
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "absolute -left-6 -top-6 p-1.5 bg-blue-600 rounded-md shadow-lg opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:bg-blue-700 transition-all z-50",
          isSelected && "opacity-100"
        )}
        title="Arrastrar para mover"
      >
        <GripVertical className="w-4 h-4 text-white" />
      </div>

      {/* Selection Label */}
      {isSelected && (
        <div className="absolute -top-7 left-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-t-md uppercase tracking-wider z-50 shadow-sm">
          {type}
        </div>
      )}

      {/* Resize Handle Indicator */}
      {isSelected && (
        <div
          className="absolute -right-1 -bottom-1 w-4 h-4 bg-white border-2 border-blue-600 rounded-full z-50 shadow-md cursor-nwse-resize flex items-center justify-center hover:scale-110 hover:bg-blue-50 transition-transform"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(String(props.width || 200));
            const startHeight = parseInt(String(props.height || 100));

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;

              let newWidth = Math.max(50, startWidth + deltaX);
              let newHeight = Math.max(20, startHeight + deltaY);

              // Snap to grid if it was intended (we don't have showGrid here, but we can assume gridStep=8)
              newWidth = Math.round(newWidth / 8) * 8;
              newHeight = Math.round(newHeight / 8) * 8;

              if (onUpdateProps) {
                onUpdateProps(component.id, {
                  ...props,
                  width: newWidth,
                  height: newHeight
                });
              }
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        >
          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
        </div>
      )}
    </>
  );

  // Render different component types
  switch (type) {
    case "container":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <div
            style={{
              maxWidth: props.maxWidth || "1200px",
              margin: "0 auto",
              minHeight: "100px",
              position: "relative",
            }}
          >
            {renderChildren()}
          </div>
        </div>
      );

    case "section":
      return (
        <section
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={cn(wrapperClass, "w-full py-12 px-4")}
        >
          {EditorUI}
          <div className="max-w-7xl mx-auto relative min-h-[200px]">
            {renderChildren()}
          </div>
        </section>
      );

    case "row":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <div
            style={{
              display: "flex",
              gap: props.gap || "20px",
              alignItems: props.align || "flex-start",
              justifyContent: props.justify || "flex-start",
              flexWrap: props.wrap || "nowrap",
              minHeight: "50px",
            }}
          >
            <SortableContext
              items={children?.map(c => c.id) || []}
              strategy={verticalListSortingStrategy}
            >
              {children?.map((child: PageComponent) => (
                <ComponentRenderer
                  key={child.id}
                  component={child}
                  isSelected={false}
                  onSelect={onSelect}
                  deviceMode={deviceMode}
                />
              ))}
            </SortableContext>
          </div>
        </div>
      );

    case "column":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <div
            style={{
              width: props.width || "100%",
              padding: props.padding || "0",
              minHeight: "50px",
            }}
          >
            <SortableContext
              items={children?.map(c => c.id) || []}
              strategy={verticalListSortingStrategy}
            >
              {children?.map((child: PageComponent) => (
                <ComponentRenderer
                  key={child.id}
                  component={child}
                  isSelected={false}
                  onSelect={onSelect}
                  deviceMode={deviceMode}
                />
              ))}
            </SortableContext>
          </div>
        </div>
      );

    case "spacer":
      return (
        <div
          ref={setNodeRef}
          style={{ ...style, height: props.height || "40px" }}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
        </div>
      );

    case "divider":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <hr
            style={{
              borderColor: props.color || "#e5e7eb",
              borderWidth: props.height || "1px",
              margin: props.margin || "20px 0",
            }}
          />
        </div>
      );

    case "text":
    case "heading":
    case "paragraph":
      const Tag = type === "heading" ? props.level || "h2" : "div";
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <Tag
            style={{
              fontSize: props.fontSize || "16px",
              color: props.color || "#1f2937",
              fontWeight: props.fontWeight || "400",
              textAlign: props.textAlign || "left",
              lineHeight: props.lineHeight || "1.5",
              padding: props.padding || "0",
              margin: props.margin || "0",
            }}
          >
            {props.content || "Texto de ejemplo"}
          </Tag>
        </div>
      );

    case "image":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <div
            style={{
              width: props.width || "100%",
              position: "relative",
              aspectRatio: props.aspectRatio || "16/9",
            }}
          >
            <NextImage
              src={props.src || "/placeholder-image.png"}
              alt={props.alt || "Imagen"}
              fill
              style={{
                objectFit: props.objectFit || "cover",
                borderRadius: props.borderRadius || "0px",
              }}
            />
          </div>
        </div>
      );

    case "video":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          {props.src ? (
            <video
              src={props.src}
              controls={props.controls !== false}
              autoPlay={props.autoplay || false}
              style={{
                width: props.width || "100%",
                height: props.height || "auto",
                borderRadius: props.borderRadius || "0px",
              }}
            />
          ) : (
            <div className="bg-gray-200 flex items-center justify-center h-64 rounded">
              <p className="text-gray-500">Añadir URL de video</p>
            </div>
          )}
        </div>
      );

    case "button":
      return (
        <div
          ref={setNodeRef}
          style={combinedStyle}
          onClick={handleClick}
          className={wrapperClass}
        >
          {EditorUI}
          <button
            style={{
              backgroundColor: props.backgroundColor || "#3b82f6",
              color: props.color || "#ffffff",
              fontSize: props.fontSize || "16px",
              padding: props.padding || "12px 24px",
              borderRadius: props.borderRadius || "6px",
              fontWeight: props.fontWeight || "600",
              border: "none",
              cursor: "pointer",
            }}
          >
            {props.text || "Haz Clic Aquí"}
          </button>
        </div>
      );

    case "lead_form":
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-6 bg-white rounded-lg shadow-md max-w-md`}>
          {EditorUI}
          <h3 className="text-2xl font-bold mb-2">{props.titulo || "¿Interesado? ¡Contáctanos!"}</h3>
          <p className="text-gray-600 mb-4">{props.descripcion || "Déjanos tus datos"}</p>
          <div className="space-y-3">
            <input type="text" placeholder="Nombre" className="w-full p-2 border rounded" />
            <input type="email" placeholder="Email" className="w-full p-2 border rounded" />
            <input type="tel" placeholder="Teléfono" className="w-full p-2 border rounded" />
            <button
              style={{ backgroundColor: props.colorBoton || "#10b981" }}
              className="w-full text-white p-2 rounded font-semibold"
            >
              {props.textoBoton || "Enviar"}
            </button>
          </div>
        </div>
      );

    case "booking_calendar":
      // Si está en modo público, renderizar el iframe del embed de booking
      if (isPublic && tenantId) {
        return (
          <div className={wrapperClass}>
            <iframe
              src={`/embed/booking?tenantId=${tenantId}${props.servicioId ? `&servicioId=${props.servicioId}` : ''}`}
              className="w-full border-0 rounded-lg shadow-md"
              style={{ minHeight: '600px', height: '100vh', maxHeight: '800px' }}
              title="Calendario de Reservas"
            />
          </div>
        );
      }

      // Si está en el editor, mostrar un preview informativo
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-6 bg-white rounded-lg shadow-md border-2 ${isSelected ? 'border-blue-500' : 'border-gray-200'}`}>
          {EditorUI}
          <h3 className="text-2xl font-bold mb-2">{props.titulo || "Agenda una Cita"}</h3>
          <p className="text-gray-600 mb-4">{props.descripcion || "Selecciona el mejor horario"}</p>
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 h-64 rounded flex flex-col items-center justify-center border-2 border-dashed border-blue-300">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-blue-700 font-semibold mb-2">📅 Calendario de Reservas</p>
              <p className="text-sm text-gray-600 max-w-xs">El calendario funcional se mostrará aquí cuando publiques la página</p>
              {props.servicioId && (
                <div className="mt-3 inline-block bg-white px-3 py-1 rounded-full text-xs text-blue-600 border border-blue-200">
                  Servicio vinculado: {props.servicioId}
                </div>
              )}
            </div>
          </div>
        </div>
      );

    case "payment_button":
      return (
        <button
          onClick={handleClick}
          className={wrapperClass}
          style={{
            backgroundColor: props.backgroundColor || "#10b981",
            color: props.color || "#ffffff",
            padding: "16px 32px",
            borderRadius: "8px",
            fontSize: "18px",
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
          }}
        >
          {EditorUI}
          {props.texto || "Comprar Ahora"} - {props.precio || 0} {props.moneda || "EUR"}
        </button>
      );

    case "hero":
      return (
        <div
          onClick={handleClick}
          className={wrapperClass}
          style={{
            backgroundImage: props.imagenFondo ? `url(${props.imagenFondo})` : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            padding: "80px 20px",
            textAlign: "center",
            color: "#ffffff",
          }}
        >
          <h1 className="text-5xl font-bold mb-4">{props.titulo || "Bienvenido"}</h1>
          <h2 className="text-2xl mb-6">{props.subtitulo || "La mejor solución"}</h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto">{props.descripcion || "Descripción"}</p>
          <a
            href={props.linkBoton || "#"}
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            onClick={(e) => {
              if (props.linkBoton?.startsWith("#")) {
                e.preventDefault();
                const element = document.querySelector(props.linkBoton);
                if (element) {
                  element.scrollIntoView({ behavior: "smooth" });
                }
              }
            }}
          >
            {props.textoBoton || "Comenzar"}
          </a>
        </div>
      );

    case "features":
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-12`}>
          <h2 className="text-3xl font-bold text-center mb-12">{props.titulo || "Características"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {props.items?.map((item: any, idx: number) => (
              <div key={idx} className="text-center">
                <div className="text-4xl mb-4">⭐</div>
                <h3 className="text-xl font-semibold mb-2">{item.titulo}</h3>
                <p className="text-gray-600">{item.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "testimonials":
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-12 bg-gray-50`}>
          <h2 className="text-3xl font-bold text-center mb-12">{props.titulo || "Testimonios"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {props.testimonios?.map((test: any, idx: number) => (
              <div key={idx} className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-700 mb-4">"{test.testimonio}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                  <div>
                    <div className="font-semibold">{test.nombre}</div>
                    <div className="text-sm text-gray-500">{test.cargo}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "pricing":
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-12`}>
          <h2 className="text-3xl font-bold text-center mb-12">{props.titulo || "Planes"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {props.planes?.map((plan: any, idx: number) => (
              <div
                key={idx}
                className={`p-6 rounded-lg ${plan.destacado ? "bg-blue-600 text-white ring-4 ring-blue-300" : "bg-white shadow"}`}
              >
                <h3 className="text-2xl font-bold mb-4">{plan.nombre}</h3>
                <div className="text-4xl font-bold mb-6">
                  {plan.precio} <span className="text-lg">{plan.moneda}/{plan.periodo}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.caracteristicas?.map((feat: string, i: number) => (
                    <li key={i}>✓ {feat}</li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded font-semibold ${plan.destacado ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                    }`}
                >
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div onClick={handleClick} className={`${wrapperClass} p-4 bg-gray-100 rounded`}>
          {EditorUI}
          <p className="text-gray-500">Componente: {type}</p>
        </div>
      );
  }
}
