import fs from 'fs';
import path from 'path';

async function testUpload() {
  const formData = new FormData();
  const buffer = Buffer.from('dummy image data');
  const blob = new Blob([buffer], { type: 'image/png' });
  formData.append('file', blob, 'test.png');

  try {
    const res = await fetch('http://localhost:3000/api/upload/catalogo', {
      method: 'POST',
      body: formData,
    });
    
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
testUpload();
