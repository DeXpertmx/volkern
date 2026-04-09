import { Editor } from "grapesjs";
import {
  createServicesBlock,
  createBookingBlock,
  createLeadFormBlock,
  createTestimonialsBlock,
  createTeamBlock,
  createBlogBlock
} from './index';
import { createStandardBlocks } from './components/StandardBlocks';

export const setupVolkernBlocks = (editor: Editor) => {
  // Setup all Volkern CRM blocks using modular components from the components directory
  // This ensures a "dark premium" aesthetic and consistent API integration across all blocks
  createStandardBlocks(editor);
  createServicesBlock(editor);
  createBookingBlock(editor);
  createLeadFormBlock(editor);
  createTestimonialsBlock(editor);
  createTeamBlock(editor);
  createBlogBlock(editor);
};
