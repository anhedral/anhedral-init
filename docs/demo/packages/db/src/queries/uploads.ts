import { eq } from 'drizzle-orm';
import { db } from '../index';
import { uploads } from '../schema';

export async function listUploadsForUser(userId: string) {
  return db.query.uploads.findMany({
    where: eq(uploads.userId, userId),
  });
}
