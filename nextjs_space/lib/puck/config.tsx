/**
 * Volkern CMS - Puck Editor Configuration
 * 
 * Define los componentes disponibles en el editor visual
 */

import type { Config } from "@measured/puck";
import { ComponentConfig } from "@measured/puck";

// ============== TIPOS ==============

export type PuckComponentProps = {
  // Layout
  Hero: {
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
  };
  Section: {
    backgroundColor: string;
    backgroundImage: string;
    paddingY: string;
    paddingX: string;
    maxWidth: "full" | "7xl" | "6xl" | "5xl" | "4xl";
  };
  Columns: {
    columns: number;
    gap: string;
    verticalAlign: "top" | "center" | "bottom";
  };
  
  // Texto
  Heading: {
    text: string;
    level: "h1" | "h2" | "h3" | "h4";
    alignment: "left" | "center" | "right";
    color: string;
  };
  Text: {
    content: string;
    alignment: "left" | "center" | "right" | "justify";
    color: string;
    fontSize: "sm" | "base" | "lg" | "xl";
  };
  RichText: {
    html: string;
  };
  
  // Media
  Image: {
    src: string;
    alt: string;
    width: string;
    height: string;
    objectFit: "cover" | "contain" | "fill";
    rounded: "none" | "sm" | "md" | "lg" | "xl" | "full";
    shadow: "none" | "sm" | "md" | "lg" | "xl";
  };
  Video: {
    url: string;
    autoplay: boolean;
    controls: boolean;
    loop: boolean;
    muted: boolean;
  };
  
  // Interactivos
  Button: {
    text: string;
    link: string;
    style: "primary" | "secondary" | "outline" | "ghost";
    size: "sm" | "md" | "lg";
    fullWidth: boolean;
    openInNewTab: boolean;
  };
  
  // CRM Integrations
  LeadForm: {
    title: string;
    description: string;
    fields: Array<{
      name: string;
      label: string;
      type: "text" | "email" | "phone" | "textarea" | "select";
      required: boolean;
      options?: string;
    }>;
    submitText: string;
    successMessage: string;
    webhookUrl: string;
  };
  BookingCalendar: {
    serviceId: string;
    title: string;
    description: string;
    showPrice: boolean;
  };
  
  // Elementos UI
  Card: {
    title: string;
    description: string;
    image: string;
    ctaText: string;
    ctaLink: string;
  };
  Testimonial: {
    quote: string;
    author: string;
    role: string;
    avatar: string;
    rating: number;
  };
  Features: {
    title: string;
    subtitle: string;
    features: Array<{
      icon: string;
      title: string;
      description: string;
    }>;
    columns: number;
  };
  Pricing: {
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
  };
  FAQ: {
    title: string;
    items: Array<{
      question: string;
      answer: string;
    }>;
  };
  
  // Social
  SocialLinks: {
    links: Array<{
      platform: "facebook" | "instagram" | "twitter" | "linkedin" | "youtube" | "tiktok" | "whatsapp";
      url: string;
    }>;
    style: "icons" | "buttons";
    size: "sm" | "md" | "lg";
  };
  
  // Espaciado
  Spacer: {
    height: string;
  };
  Divider: {
    style: "solid" | "dashed" | "dotted";
    color: string;
    thickness: string;
  };
  
  // Navigation
  Navbar: {
    logo: string;
    logoText: string;
    links: Array<{ label: string; url: string }>;
    ctaText: string;
    ctaLink: string;
    sticky: boolean;
    transparent: boolean;
  };
  Footer: {
    logo: string;
    description: string;
    columns: Array<{
      title: string;
      links: Array<{ label: string; url: string }>;
    }>;
    copyright: string;
    socialLinks: Array<{
      platform: string;
      url: string;
    }>;
  };
};

// ============== ROOT CONFIG ==============

export type RootProps = {
  title: string;
  description: string;
  favicon: string;
  ogImage: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
};

export const rootConfig: ComponentConfig<RootProps> = {
  fields: {
    title: {
      type: "text",
      label: "Título de la página",
    },
    description: {
      type: "textarea",
      label: "Meta descripción",
    },
    favicon: {
      type: "text",
      label: "Favicon URL",
    },
    ogImage: {
      type: "text",
      label: "Imagen OG (compartir)",
    },
    primaryColor: {
      type: "text",
      label: "Color primario",
    },
    secondaryColor: {
      type: "text",
      label: "Color secundario",
    },
    fontFamily: {
      type: "select",
      label: "Tipografía",
      options: [
        { label: "Inter", value: "Inter" },
        { label: "Roboto", value: "Roboto" },
        { label: "Open Sans", value: "Open Sans" },
        { label: "Poppins", value: "Poppins" },
        { label: "Montserrat", value: "Montserrat" },
      ],
    },
  },
  defaultProps: {
    title: "Mi Página",
    description: "",
    favicon: "",
    ogImage: "",
    primaryColor: "#3b82f6",
    secondaryColor: "#10b981",
    fontFamily: "Inter",
  },
  render: ({ children }: any) => <>{children}</>,
};
