import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const dateStr = '2026-05-20';
const timezone = 'Europe/Madrid';

// Create strings representing the start and end of that day locally
const startLocalStr = `${dateStr}T00:00:00`;
const endLocalStr = `${dateStr}T23:59:59.999`;

// Convert those local strings, assuming they are in 'timezone', to UTC Dates
const startUTC = fromZonedTime(startLocalStr, timezone);
const endUTC = fromZonedTime(endLocalStr, timezone);

console.log("startUTC:", startUTC.toISOString());
console.log("endUTC:", endUTC.toISOString());

// Test with another timezone
const startUTC2 = fromZonedTime(startLocalStr, 'America/Mexico_City');
console.log("startUTC Mexico:", startUTC2.toISOString());

