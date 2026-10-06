import Stripe from 'stripe';
export function createBilling(apiKey: string) { return new Stripe(apiKey); }
