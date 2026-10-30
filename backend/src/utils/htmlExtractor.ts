/**
 * Clean and robust HTML content extractor without external native binaries.
 * Strips markup, scripts, stylesheets, and navigation artifacts to extract
 * pure editorial copy and guideline text for RAG ingestion.
 */

export function extractCleanWebContent(html: string): { title: string; text: string } {
  if (!html || typeof html !== 'string') {
    return { title: 'Untitled Web Page', text: '' };
  }

  // 1. Extract title
  let title = 'Untitled Web Page';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  } else {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }
  }

  // 2. Strip scripts, styles, iframes, and noscript tags
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Strip header, nav, footer, and aside elements to isolate main content
  cleaned = cleaned
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');

  // 4. Convert block tags into line breaks
  cleaned = cleaned
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*[\/]?>/gi, '\n');

  // 5. Remove remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 6. Decode common HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 7. Normalize whitespace
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);

  const text = lines.join('\n\n');

  return { title, text };
}

/**
 * Extracts URL locations from sitemap XML.
 */
export function extractSitemapUrls(xml: string, maxUrls: number = 10): string[] {
  if (!xml || typeof xml !== 'string') return [];
  const urls: string[] = [];
  const regex = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && urls.length < maxUrls) {
    if (match[1]) {
      urls.push(match[1].trim());
    }
  }

  return urls;
}
