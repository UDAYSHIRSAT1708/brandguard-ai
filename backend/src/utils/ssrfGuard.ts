import dns from 'dns';
import net from 'net';

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * or cloud provider metadata address spaces.
 */
export function isPrivateOrBlockedIP(ip: string): boolean {
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true; // Link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local
    return false;
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [b0, b1] = parts;

    // 0.0.0.0/8 (Broadcast/Current network)
    if (b0 === 0) return true;

    // 10.0.0.0/8 (Private RFC 1918)
    if (b0 === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;

    // 169.254.0.0/16 (Link-local & Cloud Metadata endpoint e.g. 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;

    // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 – 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

    // 192.168.0.0/16 (Private RFC 1918)
    if (b0 === 192 && b1 === 168) return true;

    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

    // 198.18.0.0/15 (Benchmarking)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

    return false;
  }

  return true;
}

/**
 * Validates a target URL against SSRF vulnerabilities by resolving DNS
 * and verifying that none of the destination IP addresses fall into internal ranges.
 */
export async function validateUrlForSSRF(rawUrl: string): Promise<{
  safe: boolean;
  resolvedIp?: string;
  reason?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format.' };
  }

  // 1. Strict Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      safe: false,
      reason: `Blocked unsafe protocol '${parsed.protocol}'. Only http and https are permitted.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 2. Direct string blacklist checks
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    hostname === '169.254.169.254'
  ) {
    return {
      safe: false,
      reason: `Access to internal host '${hostname}' is strictly blocked.`,
    };
  }

  // 3. If hostname is already an IP, directly test it
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIP(hostname)) {
      return {
        safe: false,
        reason: `Target IP '${hostname}' resides in a restricted private or cloud metadata subnet.`,
      };
    }
    return { safe: true, resolvedIp: hostname };
  }

  // 4. DNS Resolution and Multi-Address Verification
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, reason: `Could not resolve hostname '${hostname}'.` };
    }

    for (const addr of addresses) {
      if (isPrivateOrBlockedIP(addr.address)) {
        return {
          safe: false,
          reason: `Resolved IP '${addr.address}' for host '${hostname}' resides in a restricted private or internal network.`,
        };
      }
    }

    return { safe: true, resolvedIp: addresses[0].address };
  } catch (dnsErr: any) {
    return { safe: false, reason: `DNS lookup failed for '${hostname}': ${dnsErr.message}` };
  }
}
