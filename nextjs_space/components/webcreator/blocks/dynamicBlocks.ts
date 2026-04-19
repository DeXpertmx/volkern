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

// Async function to setup all Volkern CRM blocks with static core registration
export const setupVolkernBlocksAsync = async (editor: Editor) => {
  // Initialize CRM blocks (Static imports for stability)
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

  // Load Premium blocks asynchronously (They are less critical during load)
  try {
    const premiumBlocksModule = await import('./premium/index');
    premiumBlocksModule.createHeroPremiumBlock(editor);
    premiumBlocksModule.createFeaturesPremiumBlock(editor);
    premiumBlocksModule.createTestimonialsPremiumBlock(editor);
    premiumBlocksModule.createCTAPremiumBlock(editor);
    premiumBlocksModule.createPricingPremiumBlock(editor);
    premiumBlocksModule.createTeamPremiumBlock(editor);
    premiumBlocksModule.createFAQPremiumBlock(editor);
    premiumBlocksModule.createStatsPremiumBlock(editor);
    premiumBlocksModule.createFooterPremiumBlock(editor);
    premiumBlocksModule.createContactPremiumBlock(editor);
    premiumBlocksModule.createMediaPremiumBlocks(editor);
    premiumBlocksModule.createInteractivePremiumBlocks(editor);
    premiumBlocksModule.createCommercePremiumBlocks(editor);
    premiumBlocksModule.createElementPremiumBlocks(editor);
    premiumBlocksModule.createTestimonialsCarouselBlock(editor);
  } catch (e) {
    console.error("Error loading premium blocks:", e);
  }
};