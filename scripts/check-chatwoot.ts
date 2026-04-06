import { chatwootApi } from '../lib/nexus/chatwoot-api';

async function checkChatwootConnection() {
    console.log('--- Checking Chatwoot Connection ---');
    console.log(`Base URL: ${process.env.CHATWOOT_BASE_URL || 'https://volkern.dimension.expert'}`);
    
    try {
        const isHealthy = await chatwootApi.healthCheck();
        console.log(`Health Check Result: ${isHealthy ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        if (process.env.CHATWOOT_SUPER_ADMIN_TOKEN) {
            console.log('Super Admin Token is configured.');
            // Test a protected call if healthy
            if (isHealthy) {
               try {
                   const botUser = await chatwootApi.getOrCreateBotUser();
                   console.log(`Bot User Check: ✅ SUCCESS (ID: ${botUser.id})`);
               } catch (err: any) {
                   console.log(`Bot User Check: ❌ FAILED (${err.message})`);
               }
            }
        } else {
            console.log('Super Admin Token is MISSING.');
        }
    } catch (error: any) {
        console.error('Connection test error:', error.message);
    }
}

checkChatwootConnection();
