/**
 * Detección edge-safe de crawlers de IA — solo regex, sin dependencias Node,
 * para poder usarse desde el middleware (edge runtime).
 */

const AI_CRAWLER_PATTERNS: RegExp[] = [
  /gptbot/i,
  /oai-searchbot/i,
  /chatgpt-user/i,
  /claudebot/i,
  /anthropic-ai/i,
  /perplexitybot/i,
  /perplexity-user/i,
  /google-extended/i,
  /gemini-crawler/i,
  /cohere-ai/i,
  /meta-externalagent/i,
  /facebookbot.*(content|extended)/i,
  /applebot-extended/i,
  /amazonbot/i,
  /bytespider/i,
  /ccbot/i,
  /diffbot/i,
  /imagesiftbot/i,
  /youbot/i,
  /duckduckbot.*ai/i,
  /chatbot/i,
]

export function isAICrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return AI_CRAWLER_PATTERNS.some((re) => re.test(userAgent))
}
