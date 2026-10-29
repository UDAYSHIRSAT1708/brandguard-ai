/**
 * Client-Side PII Redaction
 * Ensures emails are not exposed in browser console logs or error reports.
 */
export function redactEmail(email: string | undefined | null): string {
  if (!email || typeof email !== 'string') return '[REDACTED]';
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '[REDACTED]';

  const userPart = trimmed.substring(0, atIdx);
  const domainPart = trimmed.substring(atIdx);

  if (userPart.length <= 2) {
    return `${userPart[0]}***${domainPart}`;
  }
  return `${userPart[0]}***${userPart[userPart.length - 1]}${domainPart}`;
}
