import crypto from 'crypto';

export interface ZadarmaConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Verifies the signature of a Zadarma webhook request.
 * Zadarma sends signature in the 'signature' header.
 * signature = base64_encode(hash_hmac('sha1', sorted_params_query_string, api_secret));
 */
export function verifyZadarmaSignature(
  params: Record<string, any>,
  signature: string,
  apiSecret: string
): boolean {
  // Sort params by key
  const keys = Object.keys(params).sort();
  const sortedParams: string[] = [];
  
  keys.forEach((key) => {
    if (key !== 'signature') {
      sortedParams.push(`${key}=${params[key]}`);
    }
  });

  const queryString = sortedParams.join('&');
  const hmac = crypto.createHmac('sha1', apiSecret);
  hmac.update(queryString);
  const calculatedSignature = hmac.digest('base64');

  return calculatedSignature === signature;
}

/**
 * Generates the Authorization header for Zadarma API requests.
 * Format: API_KEY:HMAC_SHA1(METHOD + QUERY_STRING + MD5(QUERY_STRING))
 */
export function getZadarmaAuthHeader(
  method: string,
  params: Record<string, any>,
  config: ZadarmaConfig
): string {
  // Sort params by key
  const keys = Object.keys(params).sort();
  const sortedParams: string[] = [];
  keys.forEach((key) => {
    sortedParams.push(`${key}=${params[key]}`);
  });

  const queryString = sortedParams.join('&');
  const md5Params = crypto.createHash('md5').update(queryString).digest('hex');
  const data = method + queryString + md5Params;
  
  const hmac = crypto.createHmac('sha1', config.apiSecret);
  hmac.update(data);
  const signature = hmac.digest('base64');
  
  return `${config.apiKey}:${signature}`;
}

/**
 * Initiates a callback (Click-to-Call) via Zadarma API.
 */
export async function initiateZadarmaCallback(
  from: string,
  to: string,
  config: ZadarmaConfig
) {
  const method = '/v1/request/callback/';
  const params = { from, to };
  
  const authHeader = getZadarmaAuthHeader(method, params, config);
  
  const url = new URL(`https://api.zadarma.com${method}`);
  Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
    },
  });
  
  return response.json();
}

/**
 * Checks account balance to verify API credentials.
 */
export async function getZadarmaBalance(config: ZadarmaConfig) {
  const method = '/v1/info/balance/';
  const params = {};
  
  const authHeader = getZadarmaAuthHeader(method, params, config);
  
  const response = await fetch(`https://api.zadarma.com${method}`, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
    },
  });
  
  return response.json();
}
