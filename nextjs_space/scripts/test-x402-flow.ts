/**
 * Test script for the full x402 payment flow.
 *
 * Usage:
 *   npx tsx scripts/test-x402-flow.ts
 *
 * This script:
 * 1. Sends a request without PAYMENT-SIGNATURE → expects 402
 * 2. Decodes the PAYMENT-REQUIRED challenge
 * 3. Creates a mock payment payload (in production, this would be signed by a wallet)
 * 4. Sends the request with PAYMENT-SIGNATURE → expects 200 with search results
 */

const BASE_URL = process.env.TEST_URL || 'https://volkern.app'
const SEARCH_ENDPOINT = `${BASE_URL}/api/public/paid-search`

function encodeX402(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function decodeX402<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T
}

async function testNoSignature() {
  console.log('\n=== Test 1: Request sin PAYMENT-SIGNATURE ===')
  const response = await fetch(`${SEARCH_ENDPOINT}?q=crm`, {
    signal: AbortSignal.timeout(15000),
  })

  console.log(`HTTP Status: ${response.status}`)
  const body = await response.json()
  console.log('Response body:', JSON.stringify(body, null, 2))

  const paymentRequired = response.headers.get('PAYMENT-REQUIRED')
  console.log('PAYMENT-REQUIRED header:', paymentRequired ? 'present' : 'missing')

  if (response.status === 402 && paymentRequired) {
    console.log('✅ Test 1 PASSED: Got 402 with PAYMENT-REQUIRED')
    return decodeX402(paymentRequired)
  } else {
    console.log('❌ Test 1 FAILED: Expected 402 with PAYMENT-REQUIRED')
    return null
  }
}

async function testWithValidSignature(requirements: any) {
  console.log('\n=== Test 2: Request con PAYMENT-SIGNATURE válida ===')

  // In production, this would be a real signed transaction.
  // For testing, we create a mock payload that the facilitator will verify.
  const mockPaymentPayload = {
    x402Version: 2,
    scheme: 'exact',
    network: requirements.accepts[0].network,
    asset: requirements.accepts[0].asset,
    amount: requirements.accepts[0].amount,
    payTo: requirements.accepts[0].payTo,
    from: '0x2222222222222222222222222222222222222222',
    nonce: Date.now().toString(),
    timestamp: Math.floor(Date.now() / 1000),
    expiry: Math.floor(Date.now() / 1000) + 300,
  }

  const signature = encodeX402(mockPaymentPayload)
  console.log('Mock payment payload created')
  console.log('Payload:', JSON.stringify(mockPaymentPayload, null, 2))

  const response = await fetch(`${SEARCH_ENDPOINT}?q=crm`, {
    headers: {
      'PAYMENT-SIGNATURE': signature,
    },
    signal: AbortSignal.timeout(15000),
  })

  console.log(`HTTP Status: ${response.status}`)
  const body = await response.json()
  console.log('Response body:', JSON.stringify(body, null, 2))

  const paymentResponse = response.headers.get('PAYMENT-RESPONSE')
  console.log('PAYMENT-RESPONSE header:', paymentResponse ? 'present' : 'missing')

  if (response.status === 200 && paymentResponse) {
    console.log('✅ Test 2 PASSED: Got 200 with search results and PAYMENT-RESPONSE')
    return true
  } else {
    console.log('❌ Test 2 FAILED: Expected 200 with PAYMENT-RESPONSE')
    return false
  }
}

async function main() {
  console.log('🚀 Testing x402 payment flow')
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Endpoint: ${SEARCH_ENDPOINT}`)

  try {
    // Test 1: No signature → 402
    const requirements = await testNoSignature()
    if (!requirements) {
      console.log('\n❌ Cannot proceed without valid challenge')
      process.exit(1)
    }

    // Test 2: Valid signature → 200
    const success = await testWithValidSignature(requirements)

    console.log('\n=== Summary ===')
    if (success) {
      console.log('✅ All tests passed!')
      console.log('The x402 payment flow is working correctly:')
      console.log('1. Server returns 402 with PAYMENT-REQUIRED challenge')
      console.log('2. Client creates payment and sends PAYMENT-SIGNATURE')
      console.log('3. Server verifies payment with facilitator')
      console.log('4. Server returns search results with PAYMENT-RESPONSE')
    } else {
      console.log('❌ Some tests failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error)
    process.exit(1)
  }
}

main()
