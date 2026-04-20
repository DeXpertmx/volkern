import { Editor } from "grapesjs";
import { createServicesBlock } from './components/ServicesBlock';
import { createBookingBlock } from './components/BookingBlock';
import { createLeadFormBlock } from './components/LeadFormBlock';
import { createTestimonialsBlock } from './components/TestimonialsBlock';
import { createTeamBlock } from './components/TeamBlock';
import { createBlogBlock } from './components/BlogBlock';
import { createCatalogBlock } from './components/CatalogBlock';
import { createVolkernFormBlock } from './components/VolkernFormBlock';
import { createCRMFieldBlock } from './components/CRMFieldBlock';
import { createStockBlock } from './components/StockBlock';

// Import Premium blocks statically for maximum stability
import { 
  createHeroPremiumBlock,
  createFeaturesPremiumBlock,
  createTestimonialsPremiumBlock,
  createCTAPremiumBlock,
  createPricingPremiumBlock,
  createTeamPremiumBlock,
  createFAQPremiumBlock,
  createStatsPremiumBlock,
  createFooterPremiumBlock,
  createContactPremiumBlock,
  createMediaPremiumBlocks,
  createInteractivePremiumBlocks,
  createCommercePremiumBlocks,
  createElementPremiumBlocks,
  createTestimonialsCarouselBlock
} from './premium/index';

/**
 * Registra todos los bloques dinámicos de Volkern y bloques Premium.
 * Se movió a carga estática para evitar problemas de sincronización en el editor.
 */
export const setupVolkernBlocksAsync = (editor: Editor) => {
  try {
    console.log('[Webcreator] Registrando bloques de CRM...');
    // Initialize CRM blocks
    createServicesBlock(editor);
    createBookingBlock(editor);
    createLeadFormBlock(editor);
    createTestimonialsBlock(editor);
    createTeamBlock(editor);
    createBlogBlock(editor);
    createCatalogBlock(editor);
    createVolkernFormBlock(editor);
    createCRMFieldBlock(editor);
    createStockBlock(editor);

    console.log('[Webcreator] Registrando bloques Premium...');
    // Initialize Premium blocks
    createHeroPremiumBlock(editor);
    createFeaturesPremiumBlock(editor);
    createTestimonialsPremiumBlock(editor);
    createCTAPremiumBlock(editor);
    createPricingPremiumBlock(editor);
    createTeamPremiumBlock(editor);
    createFAQPremiumBlock(editor);
    createStatsPremiumBlock(editor);
    createFooterPremiumBlock(editor);
    createContactPremiumBlock(editor);
    createMediaPremiumBlocks(editor);
    createInteractivePremiumBlocks(editor);
    createCommercePremiumBlocks(editor);
    createElementPremiumBlocks(editor);
    createTestimonialsCarouselBlock(editor);
    
    console.log('[Webcreator] Todos los bloques registrados correctamente.');
  } catch (e) {
    console.error("[Webcreator] Error fatal registrando bloques:", e);
  }
};