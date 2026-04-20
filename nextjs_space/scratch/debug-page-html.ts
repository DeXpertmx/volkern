import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.page.findFirst({where:{slug:'home',tenantId:null}}).then(page=>{
  const c = page?.contenido as any;
  console.log('cssPersonalizado (200chars):', (page?.cssPersonalizado||'(EMPTY)').substring(0,200));
  console.log('format:', c?.format);
  // The <style> block from html
  const html = c?.html || '';
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  if (styleMatch) {
    console.log('CSS IS embedded inside HTML tag - length:', styleMatch[1].length);
    console.log('Sample CSS:', styleMatch[1].substring(0, 300));
  }
}).finally(()=>p.$disconnect());
