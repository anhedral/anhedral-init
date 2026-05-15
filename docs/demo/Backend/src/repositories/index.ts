import type { Database } from '../db/index.js';
import { UserRepository } from './UserRepository.js';
import { SubscriptionRepository } from './SubscriptionRepository.js';
import { SubscriptionEventRepository } from './SubscriptionEventRepository.js';
import { PromoCodeRepository } from './PromoCodeRepository.js';

export class Repositories {
  public readonly users: UserRepository;
  public readonly subscriptions: SubscriptionRepository;
  public readonly subscriptionEvents: SubscriptionEventRepository;
  public readonly promoCodes: PromoCodeRepository;

  constructor(db: Database) {
    this.users = new UserRepository(db);
    this.subscriptions = new SubscriptionRepository(db);
    this.subscriptionEvents = new SubscriptionEventRepository(db);
    this.promoCodes = new PromoCodeRepository(db);
  }
}

export { UserRepository } from './UserRepository.js';
export { SubscriptionRepository } from './SubscriptionRepository.js';
export { SubscriptionEventRepository } from './SubscriptionEventRepository.js';
export { PromoCodeRepository } from './PromoCodeRepository.js';
export type { UserAuthData } from './UserRepository.js';
export type { RecordEventParams } from './SubscriptionEventRepository.js';
