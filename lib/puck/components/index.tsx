/**
 * Volkern CMS - Puck Components
 * 
 * Componentes visuales para el editor Puck
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Facebook, Instagram, Twitter, Linkedin, Youtube, MessageCircle, Star, Menu, X, ExternalLink } from "lucide-react";

// ============== HERO ==============

export const HeroComponent: React.FC<{
  title: string;
  subtitle: string;
  backgroundImage: string;
  backgroundOverlay: boolean;
  overlayOpacity: number;
  alignment: "left" | "center" | "right";
  ctaText: string;
  ctaLink: string;
  ctaStyle: "primary" | "secondary" | "outline";
  minHeight: string;
}> = ({
  title,
  subtitle,
  backgroundImage,
  backgroundOverlay,
  overlayOpacity,
  alignment,
  ctaText,
  ctaLink,
  ctaStyle,
  minHeight,
}) => {
  const alignmentClasses = {
    left: "items-start text-left",
    center: "items-center text-center",
    right: "items-end text-right",
  };

  const buttonStyles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    outline: "border border-white text-white hover:bg-white/10",
  };

  return (
    <div
      className={cn("relative flex flex-col justify-center px-6 py-20", alignmentClasses[alignment])}
      style={{
        minHeight: minHeight || "500px",
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {backgroundOverlay && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity / 100 }}
        />
      )}
      <div className="relative z-10 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
          {title || "Título Principal"}
        </h1>
        <p className="text-lg md:text-xl text-white/90 mb-8">
          {subtitle || "Subtítulo descriptivo"}
        </p>
        {ctaText && (
          <a href={ctaLink || "#"}>
            <button className={cn("px-8 py-3 rounded-lg font-medium transition-colors", buttonStyles[ctaStyle])}>
              {ctaText}
            </button>
          </a>
        )}
      </div>
    </div>
  );
};

// ============== SECTION ==============

export const SectionComponent: React.FC<{
  backgroundColor: string;
  backgroundImage: string;
  paddingY: string;
  paddingX: string;
  maxWidth: "full" | "7xl" | "6xl" | "5xl" | "4xl";
  children?: React.ReactNode;
}> = ({ backgroundColor, backgroundImage, paddingY, paddingX, maxWidth, children }) => {
  const maxWidthClasses = {
    full: "max-w-full",
    "7xl": "max-w-7xl",
    "6xl": "max-w-6xl",
    "5xl": "max-w-5xl",
    "4xl": "max-w-4xl",
  };

  return (
    <section
      style={{
        backgroundColor: backgroundColor || "transparent",
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        paddingTop: paddingY || "4rem",
        paddingBottom: paddingY || "4rem",
        paddingLeft: paddingX || "1.5rem",
        paddingRight: paddingX || "1.5rem",
      }}
    >
      <div className={cn("mx-auto", maxWidthClasses[maxWidth || "7xl"])}>
        {children}
      </div>
    </section>
  );
};

// ============== COLUMNS ==============

export const ColumnsComponent: React.FC<{
  columns: number;
  gap: string;
  verticalAlign: "top" | "center" | "bottom";
  children?: React.ReactNode;
}> = ({ columns, gap, verticalAlign, children }) => {
  const alignClasses = {
    top: "items-start",
    center: "items-center",
    bottom: "items-end",
  };

  return (
    <div
      className={cn("grid", alignClasses[verticalAlign || "top"])}
      style={{
        gridTemplateColumns: `repeat(${columns || 2}, minmax(0, 1fr))`,
        gap: gap || "1.5rem",
      }}
    >
      {children}
    </div>
  );
};

// ============== HEADING ==============

export const HeadingComponent: React.FC<{
  text: string;
  level: "h1" | "h2" | "h3" | "h4";
  alignment: "left" | "center" | "right";
  color: string;
}> = ({ text, level, alignment, color }) => {
  const Tag = level || "h2";
  const sizeClasses = {
    h1: "text-4xl md:text-5xl font-bold",
    h2: "text-3xl md:text-4xl font-bold",
    h3: "text-2xl md:text-3xl font-semibold",
    h4: "text-xl md:text-2xl font-semibold",
  };
  const alignClasses = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <Tag
      className={cn(sizeClasses[level], alignClasses[alignment || "left"])}
      style={{ color: color || "inherit" }}
    >
      {text || "Título"}
    </Tag>
  );
};

// ============== TEXT ==============

export const TextComponent: React.FC<{
  content: string;
  alignment: "left" | "center" | "right" | "justify";
  color: string;
  fontSize: "sm" | "base" | "lg" | "xl";
}> = ({ content, alignment, color, fontSize }) => {
  const sizeClasses = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };
  const alignClasses = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  };

  return (
    <p
      className={cn(sizeClasses[fontSize || "base"], alignClasses[alignment || "left"])}
      style={{ color: color || "inherit" }}
    >
      {content || "Texto de ejemplo"}
    </p>
  );
};

// ============== RICH TEXT ==============

export const RichTextComponent: React.FC<{ html: string }> = ({ html }) => {
  return (
    <div
      className="prose prose-lg max-w-none"
      dangerouslySetInnerHTML={{ __html: html || "<p>Contenido enriquecido</p>" }}
    />
  );
};

// ============== IMAGE ==============

export const ImageComponent: React.FC<{
  src: string;
  alt: string;
  width: string;
  height: string;
  objectFit: "cover" | "contain" | "fill";
  rounded: "none" | "sm" | "md" | "lg" | "xl" | "full";
  shadow: "none" | "sm" | "md" | "lg" | "xl";
}> = ({ src, alt, width, height, objectFit, rounded, shadow }) => {
  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  };
  const shadowClasses = {
    none: "",
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg",
    xl: "shadow-xl",
  };

  return (
    <img
      src={src || "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg4M77ekzcDHLW12pSpFhLNCc-3BgfWOhKd8QngsztX5svGuF1zk7X3gsCKvj8Y4TIJdj22ocNnlNZWC5THRTvBjDm0gDcx1k2vqkH45jUHoyFc24rjj0xRSNH-tiCq2DrnWZ0IKAI9i2cInBAYw9y1LpensvydFZgJFhM6U66QWhqrTrz_UyFR6zfFwPE/s1600/image-path.JPG"}
      alt={alt || "Imagen"}
      className={cn(
        "max-w-full",
        roundedClasses[rounded || "none"],
        shadowClasses[shadow || "none"]
      )}
      style={{
        width: width || "100%",
        height: height || "auto",
        objectFit: objectFit || "cover",
      }}
    />
  );
};

// ============== VIDEO ==============

export const VideoComponent: React.FC<{
  url: string;
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  muted: boolean;
}> = ({ url, autoplay, controls, loop, muted }) => {
  // Detectar YouTube o Vimeo
  const isYouTube = url?.includes("youtube.com") || url?.includes("youtu.be");
  const isVimeo = url?.includes("vimeo.com");

  if (isYouTube) {
    const videoId = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([^?&]+)/)?.[1];
    return (
      <div className="relative aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&loop=${loop ? 1 : 0}&mute=${muted ? 1 : 0}&controls=${controls ? 1 : 0}`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  if (isVimeo) {
    const videoId = url?.match(/vimeo\.com\/([0-9]+)/)?.[1];
    return (
      <div className="relative aspect-video">
        <iframe
          src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoplay ? 1 : 0}&loop=${loop ? 1 : 0}&muted=${muted ? 1 : 0}`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <video
      src={url}
      autoPlay={autoplay}
      controls={controls}
      loop={loop}
      muted={muted}
      className="w-full rounded-lg"
    />
  );
};

// ============== BUTTON ==============

export const ButtonComponent: React.FC<{
  text: string;
  link: string;
  style: "primary" | "secondary" | "outline" | "ghost";
  size: "sm" | "md" | "lg";
  fullWidth: boolean;
  openInNewTab: boolean;
}> = ({ text, link, style, size, fullWidth, openInNewTab }) => {
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4",
    lg: "h-12 px-6 text-lg",
  };

  return (
    <a
      href={link || "#"}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        variants[style || "primary"],
        sizes[size || "md"],
        fullWidth && "w-full"
      )}
    >
      {text || "Botón"}
      {openInNewTab && <ExternalLink className="w-4 h-4" />}
    </a>
  );
};

// ============== LEAD FORM ==============

export const LeadFormComponent: React.FC<{
  title: string;
  description: string;
  selectedFields: string[];
  submitText: string;
  successMessage: string;
  fuente: string;
  contextoProyecto: string;
}> = ({ title, description, selectedFields, submitText, successMessage, fuente, contextoProyecto }) => {
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const LEAD_FIELD_MAP: Record<string, { label: string; type: string; required: boolean }> = {
    nombre: { label: "Nombre", type: "text", required: true },
    email: { label: "Email", type: "email", required: true },
    telefono: { label: "Teléfono", type: "tel", required: false },
    empresa: { label: "Empresa", type: "text", required: false },
    cargo: { label: "Cargo", type: "text", required: false },
    ubicacion: { label: "Ubicación", type: "text", required: false },
    notas: { label: "Notas / Mensaje", type: "textarea", required: false },
    contextoProyecto: { label: "Contexto del Proyecto", type: "textarea", required: false },
  };

  const fields = (selectedFields?.length ? selectedFields : ["nombre", "email", "notas"])
    .filter(f => LEAD_FIELD_MAP[f])
    .map(f => ({ name: f, ...LEAD_FIELD_MAP[f] }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    fields.forEach(f => { data[f.name] = formData.get(f.name) as string || ""; });
    if (fuente) data.fuente = fuente;
    if (contextoProyecto) data.contextoProyecto = contextoProyecto;

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) setSubmitted(true);
    } catch (err) {
      console.error("Error submitting lead:", err);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="py-12 text-center">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-lg font-semibold">{successMessage || "¡Gracias! Te contactaremos pronto."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>{title || "Contáctanos"}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {fields.map((field, idx) => (
            <div key={idx} className="space-y-2">
              <Label htmlFor={field.name}>
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Label>
              {field.type === "textarea" ? (
                <Textarea id={field.name} name={field.name} required={field.required} />
              ) : (
                <Input id={field.name} name={field.name} type={field.type} required={field.required} />
              )}
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : (submitText || "Enviar")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

// ============== TESTIMONIAL ==============

export const TestimonialComponent: React.FC<{
  quote: string;
  author: string;
  role: string;
  avatar: string;
  rating: number;
}> = ({ quote, author, role, avatar, rating }) => {
  return (
    <Card className="p-6">
      {rating > 0 && (
        <div className="flex gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={cn(
                "w-5 h-5",
                i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
              )}
            />
          ))}
        </div>
      )}
      <p className="text-lg italic mb-4">"{quote || "Excelente servicio, muy recomendado."}
      </p>
      <div className="flex items-center gap-3">
        <img
          src={avatar || "https://cdn.pixabay.com/photo/2017/02/23/13/05/avatar-2092113_1280.png"}
          alt={author}
          className="w-12 h-12 rounded-full object-cover"
        />
        <div>
          <p className="font-semibold">{author || "Cliente Satisfecho"}</p>
          <p className="text-sm text-muted-foreground">{role || ""}</p>
        </div>
      </div>
    </Card>
  );
};

// ============== FAQ ==============

export const FAQComponent: React.FC<{
  title: string;
  items: Array<{ question: string; answer: string }>;
}> = ({ title, items }) => {
  const defaultItems = [
    { question: "¿Cómo puedo contactarlos?", answer: "Puedes contactarnos por email o teléfono." },
    { question: "¿Cuáles son sus horarios?", answer: "Lunes a Viernes de 9am a 6pm." },
  ];

  const faqItems = items?.length ? items : defaultItems;

  return (
    <div className="max-w-3xl mx-auto">
      {title && <h2 className="text-2xl font-bold text-center mb-8">{title}</h2>}
      <Accordion type="single" collapsible className="w-full">
        {faqItems.map((item, idx) => (
          <AccordionItem key={idx} value={`item-${idx}`}>
            <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

// ============== SOCIAL LINKS ==============

export const SocialLinksComponent: React.FC<{
  links: Array<{
    platform: "facebook" | "instagram" | "twitter" | "linkedin" | "youtube" | "tiktok" | "whatsapp";
    url: string;
  }>;
  style: "icons" | "buttons";
  size: "sm" | "md" | "lg";
}> = ({ links, style, size }) => {
  const icons: Record<string, React.ReactNode> = {
    facebook: <Facebook />,
    instagram: <Instagram />,
    twitter: <Twitter />,
    linkedin: <Linkedin />,
    youtube: <Youtube />,
    whatsapp: <MessageCircle />,
    tiktok: <span className="font-bold">TT</span>,
  };

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const defaultLinks = [
    { platform: "facebook" as const, url: "#" },
    { platform: "instagram" as const, url: "#" },
  ];

  const socialLinks = links?.length ? links : defaultLinks;

  return (
    <div className="flex gap-3 justify-center">
      {socialLinks.map((link, idx) => (
        <a
          key={idx}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors",
            sizeClasses[size || "md"]
          )}
        >
          {icons[link.platform]}
        </a>
      ))}
    </div>
  );
};

// ============== SPACER ==============

export const SpacerComponent: React.FC<{ height: string }> = ({ height }) => {
  return <div style={{ height: height || "2rem" }} />;
};

// ============== DIVIDER ==============

export const DividerComponent: React.FC<{
  style: "solid" | "dashed" | "dotted";
  color: string;
  thickness: string;
}> = ({ style: borderStyle, color, thickness }) => {
  return (
    <hr
      style={{
        borderStyle: borderStyle || "solid",
        borderColor: color || "#e5e7eb",
        borderWidth: thickness || "1px",
      }}
    />
  );
};

// ============== FEATURES ==============

export const FeaturesComponent: React.FC<{
  title: string;
  subtitle: string;
  features: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  columns: number;
}> = ({ title, subtitle, features, columns }) => {
  const defaultFeatures = [
    { icon: "⭐", title: "Característica 1", description: "Descripción de la característica." },
    { icon: "🚀", title: "Característica 2", description: "Descripción de la característica." },
    { icon: "💡", title: "Característica 3", description: "Descripción de la característica." },
  ];

  const featureItems = features?.length ? features : defaultFeatures;

  return (
    <div>
      {(title || subtitle) && (
        <div className="text-center mb-12">
          {title && <h2 className="text-3xl font-bold mb-4">{title}</h2>}
          {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div
        className="grid gap-8"
        style={{ gridTemplateColumns: `repeat(${columns || 3}, minmax(0, 1fr))` }}
      >
        {featureItems.map((feature, idx) => (
          <div key={idx} className="text-center">
            <div className="text-4xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
            <p className="text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============== PRICING ==============

export const PricingComponent: React.FC<{
  title: string;
  subtitle: string;
  plans: Array<{
    name: string;
    price: string;
    period: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    highlighted: boolean;
  }>;
}> = ({ title, subtitle, plans }) => {
  const defaultPlans = [
    {
      name: "Básico",
      price: "$99",
      period: "/mes",
      features: ["Característica 1", "Característica 2"],
      ctaText: "Empezar",
      ctaLink: "#",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "$199",
      period: "/mes",
      features: ["Todo en Básico", "Característica 3", "Característica 4"],
      ctaText: "Empezar",
      ctaLink: "#",
      highlighted: true,
    },
  ];

  const pricingPlans = plans?.length ? plans : defaultPlans;

  return (
    <div>
      {(title || subtitle) && (
        <div className="text-center mb-12">
          {title && <h2 className="text-3xl font-bold mb-4">{title}</h2>}
          {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {pricingPlans.map((plan, idx) => (
          <Card
            key={idx}
            className={cn(
              "relative",
              plan.highlighted && "border-primary shadow-lg scale-105"
            )}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                Popular
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, fidx) => (
                  <li key={fidx} className="flex items-center gap-2">
                    <span className="text-green-500">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.highlighted ? "default" : "outline"}
                asChild
              >
                <a href={plan.ctaLink || "#"}>{plan.ctaText || "Comenzar"}</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ============== NAVBAR ==============

export const NavbarComponent: React.FC<{
  logo: string;
  logoText: string;
  links: Array<{ label: string; url: string }>;
  ctaText: string;
  ctaLink: string;
  sticky: boolean;
  transparent: boolean;
}> = ({ logo, logoText, links, ctaText, ctaLink, sticky, transparent }) => {
  const defaultLinks = [
    { label: "Inicio", url: "#" },
    { label: "Servicios", url: "#servicios" },
    { label: "Contacto", url: "#contacto" },
  ];

  const navLinks = links?.length ? links : defaultLinks;

  return (
    <nav
      className={cn(
        "flex items-center justify-between px-6 py-4",
        sticky && "sticky top-0 z-50",
        transparent ? "bg-transparent" : "bg-background border-b"
      )}
    >
      <div className="flex items-center gap-2">
        {logo && <img src={logo} alt="Logo" className="h-8" />}
        {logoText && <span className="font-bold text-xl">{logoText}</span>}
      </div>
      <div className="hidden md:flex items-center gap-6">
        {navLinks.map((link, idx) => (
          <a key={idx} href={link.url} className="hover:text-primary transition-colors">
            {link.label}
          </a>
        ))}
      </div>
      {ctaText && (
        <Button asChild>
          <a href={ctaLink || "#"}>{ctaText}</a>
        </Button>
      )}
    </nav>
  );
};

// ============== FOOTER ==============

export const FooterComponent: React.FC<{
  logo: string;
  description: string;
  columns: Array<{
    title: string;
    links: Array<{ label: string; url: string }>;
  }>;
  copyright: string;
  socialLinks: Array<{ platform: string; url: string }>;
}> = ({ logo, description, columns, copyright, socialLinks }) => {
  const defaultColumns = [
    {
      title: "Empresa",
      links: [
        { label: "Nosotros", url: "#" },
        { label: "Contacto", url: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacidad", url: "#" },
        { label: "Términos", url: "#" },
      ],
    },
  ];

  const footerColumns = columns?.length ? columns : defaultColumns;

  return (
    <footer className="bg-muted py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            {logo && <img src={logo} alt="Logo" className="h-8 mb-4" />}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {footerColumns.map((col, idx) => (
            <div key={idx}>
              <h4 className="font-semibold mb-4">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link, lidx) => (
                  <li key={lidx}>
                    <a href={link.url} className="text-sm text-muted-foreground hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            {copyright || `© ${new Date().getFullYear()} Todos los derechos reservados.`}
          </p>
          {socialLinks?.length > 0 && (
            <div className="flex gap-4 mt-4 md:mt-0">
              {socialLinks.map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};

// ============== CARD ==============

export const CardComponent: React.FC<{
  title: string;
  description: string;
  image: string;
  ctaText: string;
  ctaLink: string;
}> = ({ title, description, image, ctaText, ctaLink }) => {
  return (
    <Card className="overflow-hidden">
      {image && (
        <div className="aspect-video relative">
          <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <CardHeader>
        <CardTitle>{title || "Título de la tarjeta"}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {ctaText && (
        <CardContent>
          <Button asChild className="w-full">
            <a href={ctaLink || "#"}>{ctaText}</a>
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

// ============== BOOKING CALENDAR ==============

export const BookingCalendarComponent: React.FC<{
  servicioNombre: string;
  title: string;
  description: string;
  showPrice: boolean;
}> = ({ servicioNombre, title, description, showPrice }) => {
  const [services, setServices] = React.useState<any[]>([]);
  const [selectedService, setSelectedService] = React.useState<string>(servicioNombre || "");
  const [selectedDate, setSelectedDate] = React.useState("");
  const [selectedTime, setSelectedTime] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/servicios")
      .then(r => r.ok ? r.json() : { servicios: [] })
      .then(data => {
        const list = data.servicios || data.items || [];
        setServices(list);
        if (servicioNombre && !selectedService) {
          const match = list.find((s: any) => s.nombre === servicioNombre);
          if (match) setSelectedService(match.nombre);
        }
      })
      .catch(() => {});
  }, []);

  const active = services.find((s: any) => s.nombre === selectedService);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !selectedDate || !selectedTime || !nombre || !email) return;
    try {
      await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicioId: active.id,
          titulo: `Reserva: ${active.nombre}`,
          fechaHora: `${selectedDate}T${selectedTime}:00`,
          duracion: active.duracionMinutos || 60,
          leadData: { nombre, email },
        }),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Error booking:", err);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <div className="text-4xl mb-4">📅</div>
          <p className="text-lg font-semibold">¡Cita agendada correctamente!</p>
          <p className="text-muted-foreground mt-2">Te enviaremos una confirmación por email.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{title || "Agenda tu cita"}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Servicio</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
            >
              <option value="">Selecciona un servicio</option>
              {services.map((s: any) => (
                <option key={s.id} value={s.nombre}>
                  {s.nombre} {showPrice ? `- ${s.precio} ${s.moneda}` : ""} ({s.duracionMinutos} min)
                </option>
              ))}
            </select>
          </div>
          {active && showPrice && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p><strong>Precio:</strong> {active.precio} {active.moneda}</p>
              <p><strong>Duración:</strong> {active.duracionMinutos} min</p>
              {active.modalidad && <p><strong>Modalidad:</strong> {active.modalidad}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!selectedService}>
            Agendar Cita
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

// ============== SERVICE CATALOG (CRM) ==============

export const ServiceCatalogComponent: React.FC<{
  titulo: string;
  layout: "grid" | "list";
  showPrices: boolean;
  showDuration: boolean;
  showBookButton: boolean;
  categoriaFiltro: string;
}> = ({ titulo, layout, showPrices, showDuration, showBookButton, categoriaFiltro }) => {
  const [items, setItems] = React.useState<any[]>([]);

  React.useEffect(() => {
    fetch("/api/servicios")
      .then(r => r.ok ? r.json() : { servicios: [] })
      .then(data => {
        let list = data.servicios || data.items || [];
        setItems(list);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="py-8">
      {titulo && <h2 className="text-2xl font-bold text-center mb-8">{titulo}</h2>}
      <div className={cn(
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          : "space-y-4 max-w-3xl mx-auto"
      )}>
        {items.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            <p>No hay servicios configurados</p>
            <p className="text-sm">Agrega servicios desde el CRM para mostrarlos aquí.</p>
          </div>
        )}
        {items.map((item: any) => (
          <Card key={item.id} className={layout === "list" ? "flex items-center" : ""}>
            <CardHeader className={layout === "list" ? "flex-1" : ""}>
              <CardTitle className="text-lg">{item.nombre}</CardTitle>
              {item.descripcion && <CardDescription>{item.descripcion}</CardDescription>}
            </CardHeader>
            <CardContent className={cn("space-y-2", layout === "list" && "flex items-center gap-4 pb-0")}>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {showDuration && item.duracionMinutos && (
                  <span>⏱ {item.duracionMinutos} min</span>
                )}
                {item.modalidad && <span>📍 {item.modalidad}</span>}
              </div>
              {showPrices && (
                <p className="text-xl font-bold">{item.precio} {item.moneda}</p>
              )}
              {showBookButton && (
                <Button size="sm" className="w-full mt-2">Reservar</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ============== PRODUCT CATALOG (CRM) ==============

export const ProductCatalogComponent: React.FC<{
  titulo: string;
  tipoFiltro: string;
  layout: "grid" | "list";
  showPrices: boolean;
  showCategories: boolean;
  showCustomFields: boolean;
}> = ({ titulo, tipoFiltro, layout, showPrices, showCategories, showCustomFields }) => {
  const [items, setItems] = React.useState<any[]>([]);

  React.useEffect(() => {
    fetch("/api/catalogo")
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        let list = data.items || [];
        if (tipoFiltro) list = list.filter((i: any) => i.tipo === tipoFiltro);
        setItems(list);
      })
      .catch(() => {});
  }, [tipoFiltro]);

  return (
    <div className="py-8">
      {titulo && <h2 className="text-2xl font-bold text-center mb-8">{titulo}</h2>}
      <div className={cn(
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          : "space-y-4 max-w-3xl mx-auto"
      )}>
        {items.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            <p>No hay productos configurados</p>
            <p className="text-sm">Agrega productos al catálogo del CRM.</p>
          </div>
        )}
        {items.map((item: any) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{item.nombre}</CardTitle>
                {item.tipo && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
                    {item.tipo}
                  </span>
                )}
              </div>
              {item.descripcion && <CardDescription>{item.descripcion}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-2">
              {showCategories && item.categorias?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.categorias.map((cat: string, i: number) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{cat}</span>
                  ))}
                </div>
              )}
              {showCustomFields && item.customFieldValues && typeof item.customFieldValues === "object" && (
                <div className="space-y-1 text-sm">
                  {Object.entries(item.customFieldValues as Record<string, any>).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-medium">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
              {showPrices && (
                <p className="text-xl font-bold mt-2">{item.precioBase} {item.moneda}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
