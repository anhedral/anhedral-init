import type { FastifyRequest } from 'fastify';

export function extractDeviceType(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  if (ua.includes('chrome-extension') || ua.includes('firefox-extension')) return 'extension';
  return 'desktop';
}

export function extractIpAddress(req: FastifyRequest): string | null {
  const realIp = req.headers['x-real-ip'] as string | undefined;
  if (realIp) return realIp;
  const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.ip || null;
}

export function extractDeviceInfo(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'] || null;
  const deviceType = extractDeviceType(userAgent);
  const rawIp = extractIpAddress(req);
  const ipAddress = anonymizeIp(rawIp);
  return { deviceType, userAgent, ipAddress };
}

export function sanitizeEmail(email: unknown): string {
  return String(email || '').toLowerCase().trim();
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const maskedLocal = local.length > 0 ? `${local[0]}***` : '***';
  return `${maskedLocal}@${domain}`;
}

export function anonymizeIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) { parts[3] = '0'; return parts.join('.'); }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) return `${parts.slice(0, 3).join(':')}::`;
  }
  return ip;
}
