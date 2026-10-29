/**
 * BrandGuard AI — Logging & PII Redaction Utilities
 * Prevents customer and user emails, secrets, and personal data from being
 * printed in plaintext into application logs or telemetry streams.
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

export function redactSecret(secret: string | undefined | null): string {
  if (!secret || typeof secret !== 'string') return '[REDACTED]';
  if (secret.length <= 8) return '********';
  return `${secret.substring(0, 3)}...${secret.substring(secret.length - 3)}`;
}
