'use client'

import { useEffect, useRef } from 'react'

interface TallyEmbedProps {
  tallyFormId: string
  height?: number
  title?: string
  className?: string
  /**
   * If true, hides the Tally branding footer
   * Note: Only works on paid Tally plans
   */
  hideFooter?: boolean
  /**
   * Pre-filled field values (Tally Hidden Fields)
   * Example: { "utm_source": "google", "email": "test@example.com" }
   */
  prefill?: Record<string, string>
  /**
   * Callback when the form is submitted
   */
  onSubmitted?: () => void
}

/**
 * TallyEmbed - Embed a Tally.so form in any page
 *
 * Usage:
 * ```tsx
 * <TallyEmbed
 *   tallyFormId="3xXXXXX"
 *   height={600}
 *   title="Contact Form"
 * />
 * ```
 *
 * For landing pages in the CMS, use this component with the
 * form ID from your Tally account.
 */
export function TallyEmbed({
  tallyFormId,
  height = 600,
  title = 'Formulario',
  className = '',
  hideFooter = false,
  prefill,
  onSubmitted,
}: TallyEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isSubmittedRef = useRef(false)

  // Build the embed URL
  const embedUrl = `https://tally.so/embed/${tallyFormId}${hideFooter ? '?hideFooter=1' : ''}`

  // Listen for Tally postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Tally sends structured messages via postMessage
      if (event.origin !== 'https://tally.so') return

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data

        // Tally sends 'tally-form-submitted' when the form is submitted
        if (data?.event === 'tally-form-submitted' && !isSubmittedRef.current) {
          isSubmittedRef.current = true
          onSubmitted?.()
        }
      } catch {
        // Not a JSON message, ignore
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onSubmitted])

  return (
    <div className={`w-full ${className}`}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        width="100%"
        height={height}
        frameBorder="0"
        marginHeight={0}
        marginWidth={0}
        title={title}
        className="w-full"
        loading="lazy"
        allow="fullscreen; clipboard-read; clipboard-write"
        // Allow Tally to resize the iframe automatically
        onLoad={(e) => {
          const iframe = e.currentTarget
          // Tally sends resize events via postMessage
          // We handle it via the generic message listener
        }}
      />
    </div>
  )
}
