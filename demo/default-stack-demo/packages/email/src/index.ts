import { Resend } from 'resend';
export function createEmail(apiKey: string) { return new Resend(apiKey); }
