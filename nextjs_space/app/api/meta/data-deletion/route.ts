import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import { buffer } from 'micro'

export const dynamic = 'force-dynamic'

const APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || ''

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function parseSignedRequest(signedRequest: string): { user_id: string; algorithm: string } | null {
  try {
    const [encodedSig, payload] = signedRequest.split('.')
    
    if (!encodedSig || !payload) {
      console.error('[Data Deletion] Invalid signed_request format')
      return null
    }

    const sig = base64UrlDecode(encodedSig)
    const data = JSON.parse(base64UrlDecode(payload))

    const expectedSig = crypto
      .createHmac('sha256', APP_SECRET)
      .update(payload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const providedSig = sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    if (expectedSig !== providedSig) {
      console.error('[Data Deletion] Invalid signature')
      return null
    }

    if (data.algorithm !== 'HMAC-SHA256') {
      console.error('[Data Deletion] Unknown algorithm:', data.algorithm)
      return null
    }

    return { user_id: data.user_id, algorithm: data.algorithm }
  } catch (error) {
    console.error('[Data Deletion] Error parsing signed_request:', error)
    return null
  }
}

function generateConfirmationCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const signedRequest = formData.get('signed_request') as string

      if (!signedRequest) {
        return NextResponse.json(
          { error: 'signed_request is required' },
          { status: 400 }
        )
      }

      const parsed = parseSignedRequest(signedRequest)
      
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid signed_request' },
          { status: 400 }
        )
      }

      const { user_id } = parsed
      const confirmationCode = generateConfirmationCode()
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'
      const statusUrl = `${baseUrl}/delete-data?code=${confirmationCode}`

      const deletionRequest = await prisma.dataDeletionRequest.create({
        data: {
          platform: 'facebook',
          userScopedId: user_id,
          confirmationCode,
          statusUrl,
          status: 'pending',
          deletionDetails: {
            source: 'meta_callback',
            requestedAt: new Date().toISOString(),
            userId: user_id
          }
        }
      })

      console.log('[Data Deletion] Request created for user:', user_id)

      return NextResponse.json({
        url: statusUrl,
        confirmation_code: confirmationCode
      })
    }

    const body = await request.json()
    const { signed_request, platform = 'facebook' } = body

    if (!signed_request) {
      return NextResponse.json(
        { error: 'signed_request is required' },
        { status: 400 }
      )
    }

    const parsed = parseSignedRequest(signed_request)
    
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid signed_request' },
        { status: 400 }
      )
    }

    const { user_id } = parsed
    const confirmationCode = generateConfirmationCode()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'
    const statusUrl = `${baseUrl}/delete-data?code=${confirmationCode}`

    const deletionRequest = await prisma.dataDeletionRequest.create({
      data: {
        platform,
        userScopedId: user_id,
        confirmationCode,
        statusUrl,
        status: 'pending',
        deletionDetails: {
          source: 'meta_api',
          requestedAt: new Date().toISOString(),
          userId: user_id
        }
      }
    })

    console.log('[Data Deletion] Request created for user:', user_id)

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode
    })
  } catch (error: any) {
    console.error('[POST /api/meta/data-deletion] Error:', error)
    return NextResponse.json(
      { error: 'Error processing data deletion request' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Meta Data Deletion Callback Endpoint',
    version: '1.0',
    endpoints: {
      POST: 'Process data deletion request from Meta',
      GET: 'This information'
    },
    requirements: [
      'Configure Data Deletion Request URL in Meta Developer Dashboard',
      'URL format: YOUR_APP_URL/api/meta/data-deletion',
      'This endpoint accepts signed_request from Meta'
    ]
  })
}