export * from './auth-schema.js';
import { pgTable, text, timestamp, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';
export const project = pgTable('project', {
 id: text('id').primaryKey(), userId: text('user_id').notNull().references(()=>user.id),
 name: text('name').notNull(), brief: text('brief').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(),
}, t=>[index('project_user_idx').on(t.userId)]);
export const task = pgTable('task', {
 id: text('id').primaryKey(), projectId: text('project_id').notNull().references(()=>project.id),
 userId: text('user_id').notNull().references(()=>user.id), title: text('title').notNull(),
 status: text('status').default('queued').notNull(), reportKey: text('report_key'), createdAt: timestamp('created_at').defaultNow().notNull(),
}, t=>[index('task_user_idx').on(t.userId)]);
export const aiUsage = pgTable('ai_usage', {
 userId: text('user_id').notNull().references(()=>user.id), day: text('day').notNull(), count: integer('count').notNull().default(1),
},t=>[primaryKey({columns:[t.userId,t.day]})]);
