import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
export function createDatabase(connectionString: string) {
  // Pass env.HYPERDRIVE.connectionString from the Worker. Disable caching for authoritative reads in Hyperdrive configuration.
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export * as schema from './schema.js';
