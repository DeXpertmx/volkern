const fetch = require('node-fetch');

async function testAPIs() {
  const baseUrl = 'http://localhost:3000/api/erp';
  const apiKey = 'test-api-key-admin'; // Assuming this works for local tests if configured

  const endpoints = [
    '/planning/capacity',
    '/production/assets',
    '/production/bom',
    '/production/costing',
    '/production/readiness',
    '/production/work-orders'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers: { 'x-api-key': apiKey }
      });
      console.log(`Status: ${res.status}`);
      if (res.status === 200) {
        const data = await res.json();
        console.log(`Data count: ${Array.isArray(data) ? data.length : 'Object'}`);
      } else {
        const text = await res.text();
        console.log(`Error: ${text}`);
      }
    } catch (e) {
      console.error(`Fetch failed for ${endpoint}:`, e.message);
    }
  }
}

testAPIs();
