import path from 'node:path';
import { ANHEDRAL_LOGO_PUBLIC_PATH, writeAnhedralLogo } from '../branding.js';
import { writeFile } from '../util.js';

export function writeDefaultWebEnvExample(root: string): void {
  writeFile(path.join(root, '.env.example'), `# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
CLERK_SECRET_KEY=sk_test_***
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Neon + Drizzle
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Stripe
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
STRIPE_PRICE_STARTER=price_***
`);
}

export function writeDefaultWebFiles(root: string, displayName: string): void {
  writeFile(path.join(root, 'lib/db/client.ts'), `import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  return process.env.DATABASE_URL;
}

export function getDb() {
  const sql = neon(requireDatabaseUrl());
  return drizzle(sql, { schema });
}
`);

  writeFile(path.join(root, 'lib/db/schema.ts'), `import { integer, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  subscriptionTier: text('subscription_tier').notNull().default('starter'),
  subscriptionStatus: text('subscription_status').notNull().default('setup_required'),
  creditsBalance: integer('credits_balance').notNull().default(250),
  avatarObjectKey: text('avatar_object_key'),
  avatarMimeType: text('avatar_mime_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('users_clerk_user_id_idx').on(table.clerkUserId),
  index('users_email_idx').on(table.email),
]);

export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull().unique(),
  bucket: text('bucket').notNull(),
  contentType: text('content_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
`);

  writeFile(path.join(root, 'lib/db/queries/users.ts'), `import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { uploads, users } from '../schema';

type SyncUserInput = {
  clerkUserId: string;
  email: string;
  displayName: string | null;
};

export async function findUserByClerkId(clerkUserId: string) {
  const db = getDb();
  return db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
}

export async function syncUserProfile(input: SyncUserInput) {
  const db = getDb();
  await db
    .insert(users)
    .values({
      id: input.clerkUserId,
      clerkUserId: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: input.email,
        displayName: input.displayName,
        updatedAt: new Date(),
      },
    });

  return findUserByClerkId(input.clerkUserId);
}

export async function updateStripeCustomerForUser(clerkUserId: string, stripeCustomerId: string) {
  const db = getDb();
  await db
    .update(users)
    .set({
      stripeCustomerId,
      subscriptionStatus: 'checkout_started',
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId));
}

export async function updateAvatarForUser(
  clerkUserId: string,
  input: { objectKey: string; contentType: string | null },
) {
  const db = getDb();
  await db
    .update(users)
    .set({
      avatarObjectKey: input.objectKey,
      avatarMimeType: input.contentType,
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId));
}

export async function createUploadRecord(
  clerkUserId: string,
  input: { objectKey: string; bucket: string; contentType: string | null },
) {
  const db = getDb();
  await db.insert(uploads).values({
    id: crypto.randomUUID(),
    userId: clerkUserId,
    objectKey: input.objectKey,
    bucket: input.bucket,
    contentType: input.contentType,
  });
}
`);

  writeFile(path.join(root, 'lib/db/queries/uploads.ts'), `import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { uploads } from '../schema';

export async function listUploadsForUser(userId: string) {
  const db = getDb();
  return db.query.uploads.findMany({
    where: eq(uploads.userId, userId),
  });
}
`);

  writeFile(path.join(root, 'lib/db/queries/index.ts'), `export * from './uploads';
export * from './users';
`);

  writeFile(path.join(root, 'lib/db/migrate.ts'), `import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });
config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './lib/db/migrations' });
`);

  writeFile(path.join(root, 'lib/db/migrations/.gitkeep'), '');

  writeFile(path.join(root, 'lib/storage/r2.ts'), `import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: \`https://\${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export function requireR2Bucket(): string {
  if (!process.env.R2_BUCKET) {
    throw new Error('R2_BUCKET is not configured');
  }

  return process.env.R2_BUCKET;
}

export async function uploadUserAsset(input: {
  objectKey: string;
  body: Buffer;
  contentType: string | null;
}) {
  const bucket = requireR2Bucket();

  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    Body: input.body,
    ContentType: input.contentType ?? undefined,
  }));

  return {
    bucket,
    objectKey: input.objectKey,
  };
}

export async function createSignedAssetUrl(objectKey: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: requireR2Bucket(),
      Key: objectKey,
    }),
    { expiresIn: 60 * 10 },
  );
}
`);

  writeFile(path.join(root, 'lib/payments/stripe.ts'), `import Stripe from 'stripe';

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function requireStarterPriceId(): string {
  if (!process.env.STRIPE_PRICE_STARTER) {
    throw new Error('STRIPE_PRICE_STARTER is not configured');
  }

  return process.env.STRIPE_PRICE_STARTER;
}
`);

  writeFile(path.join(root, 'lib/auth/clerk.ts'), `type ClerkLikeUser = {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
  }>;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
} | null;

export const clerkNavigation = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  afterAuth: '/dashboard',
} as const;

export function getPrimaryEmail(user: ClerkLikeUser): string | null {
  if (!user) {
    return null;
  }

  if (user.primaryEmailAddressId) {
    const primaryEmail = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
    if (primaryEmail?.emailAddress) {
      return primaryEmail.emailAddress;
    }
  }

  return user.emailAddresses[0]?.emailAddress ?? null;
}

export function getDisplayName(user: ClerkLikeUser, fallbackEmail: string | null): string {
  if (user) {
    const firstName = user.firstName?.trim() ?? '';
    const lastName = user.lastName?.trim() ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    if (fullName) {
      return fullName;
    }

    const username = user.username?.trim();
    if (username) {
      return username;
    }
  }

  if (fallbackEmail) {
    const emailLocalPart = fallbackEmail.split('@')[0]?.trim();
    if (emailLocalPart) {
      return emailLocalPart;
    }
  }

  return 'Builder';
}

export function getClerkProfile(user: ClerkLikeUser) {
  const email = getPrimaryEmail(user);

  return {
    email,
    displayName: getDisplayName(user, email),
  };
}
`);

  writeFile(path.join(root, 'lib/app/dashboard.ts'), `import { findUserByClerkId, syncUserProfile } from '@/lib/db/queries';

type DashboardStateInput = {
  clerkUserId: string;
  email: string;
  displayName: string;
};

export type DashboardState = {
  email: string;
  displayName: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  creditsBalance: number;
  stripeCustomerId: string | null;
  avatarUrl: string | null;
  databaseReady: boolean;
};

export async function getDashboardState(input: DashboardStateInput): Promise<DashboardState> {
  try {
    if (!process.env.DATABASE_URL) {
      return {
        email: input.email,
        displayName: input.displayName,
        subscriptionTier: 'starter',
        subscriptionStatus: 'setup_required',
        creditsBalance: 250,
        stripeCustomerId: null,
        avatarUrl: null,
        databaseReady: false,
      };
    }

    await syncUserProfile({
      clerkUserId: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
    });

    const user = await findUserByClerkId(input.clerkUserId);

    if (!user) {
      throw new Error('User could not be loaded after sync');
    }

    return {
      email: user.email,
      displayName: user.displayName ?? input.displayName,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      creditsBalance: user.creditsBalance,
      stripeCustomerId: user.stripeCustomerId,
      avatarUrl: user.avatarObjectKey
        ? \`/api/account/avatar?v=\${user.updatedAt.getTime()}\`
        : null,
      databaseReady: true,
    };
  } catch {
    return {
      email: input.email,
      displayName: input.displayName,
      subscriptionTier: 'starter',
      subscriptionStatus: 'setup_required',
      creditsBalance: 250,
      stripeCustomerId: null,
      avatarUrl: null,
      databaseReady: false,
    };
  }
}
`);

  writeFile(path.join(root, 'lib/ui/button.ts'), `import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: 'h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3',
        sm: 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3.5',
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8',
        'icon-xs':
          'size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*="size-"])]:size-3',
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
`);

  writeFile(path.join(root, 'components/ui/button.tsx'), `'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { type ButtonVariantProps, buttonVariants } from '@/lib/ui/button';
import { cn } from '@/lib/utils';

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & ButtonVariantProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
`);

  writeFile(path.join(root, 'components/dashboard/header-user-menu.tsx'), `'use client';

import Image from 'next/image';
import { SignOutButton } from '@clerk/nextjs';
import { Camera, ChevronDown, Coins, CreditCard, Loader2, LogOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type HeaderUserMenuProps = {
  displayName: string;
  email: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  creditsBalance: number;
  avatarUrl: string | null;
};

async function readJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function HeaderUserMenu(props: HeaderUserMenuProps) {
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPortalPending, setIsPortalPending] = useState(false);
  const [isUploadPending, setIsUploadPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initials = props.displayName
    .split(' ')
    .map((chunk) => chunk[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleManageSubscription = async () => {
    setIsPortalPending(true);
    setNotice(null);

    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        setNotice(payload?.error ?? 'Stripe portal is not ready yet.');
        return;
      }

      if (payload?.url) {
        window.location.href = payload.url;
      }
    } finally {
      setIsPortalPending(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setIsUploadPending(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch('/api/account/avatar', {
        method: 'POST',
        body: formData,
      });

      const payload = await readJsonSafely(response);

      if (!response.ok) {
        setNotice(payload?.error ?? 'Avatar upload failed.');
        return;
      }

      setAvatarUrl(payload?.avatarUrl ?? null);
      setNotice('Avatar updated.');
    } finally {
      input.value = '';
      setIsUploadPending(false);
    }
  };

  const avatarThumbnail = avatarUrl ? (
    <div className="relative size-9 overflow-hidden rounded-full border border-border/70">
      <Image
        alt={props.displayName}
        className="object-cover"
        fill
        sizes="36px"
        src={avatarUrl}
        unoptimized
      />
    </div>
  ) : (
    <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {initials}
    </div>
  );

  const avatarPanel = avatarUrl ? (
    <div className="relative size-14 overflow-hidden rounded-2xl border border-border/70">
      <Image
        alt={props.displayName}
        className="object-cover"
        fill
        sizes="56px"
        src={avatarUrl}
        unoptimized
      />
    </div>
  ) : (
    <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
      {initials}
    </div>
  );

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-full border border-border/70 bg-background/90 px-3 py-2 shadow-sm transition hover:border-foreground/20 hover:shadow-md [&::-webkit-details-marker]:hidden">
        {avatarThumbnail}
        <div className="hidden text-left sm:block">
          <p className="text-sm font-medium leading-none">{props.displayName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{props.subscriptionTier} plan</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>

      <div className="absolute right-0 z-20 mt-3 w-[22rem] rounded-3xl border border-border/70 bg-background/95 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-4 border-b border-border/70 pb-4">
          {avatarPanel}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{props.displayName}</p>
            <p className="truncate text-sm text-muted-foreground">{props.email}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <CreditCard className="size-3.5" />
              Subscription
            </div>
            <p className="mt-3 text-lg font-semibold capitalize">{props.subscriptionTier}</p>
            <p className="text-sm capitalize text-muted-foreground">{props.subscriptionStatus.replaceAll('_', ' ')}</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <Coins className="size-3.5" />
              Credits
            </div>
            <p className="mt-3 text-lg font-semibold">{props.creditsBalance}</p>
            <p className="text-sm text-muted-foreground">Starter balance seeded in the schema.</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            void handleUpload(event);
          }}
          type="file"
        />

        <div className="mt-4 grid gap-2">
          <Button disabled={isPortalPending} onClick={() => void handleManageSubscription()} type="button" variant="outline">
            {isPortalPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Manage subscription
          </Button>

          <Button disabled={isUploadPending} onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
            {isUploadPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Upload avatar to R2
          </Button>

          <SignOutButton redirectUrl="/">
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground" type="button">
              <LogOut className="size-4" />
              Sign out
            </button>
          </SignOutButton>
        </div>

        {notice ? (
          <p className="mt-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </div>
    </details>
  );
}
`);

  writeFile(path.join(root, 'app/api/health/route.ts'), `export async function GET() {
  return Response.json({ ok: true });
}
`);

  writeFile(path.join(root, 'app/api/account/avatar/route.ts'), `import { auth, currentUser } from '@clerk/nextjs/server';
import { getClerkProfile } from '@/lib/auth/clerk';
import { createUploadRecord, findUserByClerkId, syncUserProfile, updateAvatarForUser } from '@/lib/db/queries';
import { createSignedAssetUrl, uploadUserAsset } from '@/lib/storage/r2';

export const runtime = 'nodejs';

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await findUserByClerkId(userId);
  if (!user?.avatarObjectKey) {
    return Response.json({ error: 'Avatar not found' }, { status: 404 });
  }

  const signedUrl = await createSignedAssetUrl(user.avatarObjectKey);
  return Response.redirect(signedUrl, 307);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const { email, displayName } = getClerkProfile(clerkUser);
  if (!email) {
    return Response.json({ error: 'No email address found for the signed-in user.' }, { status: 400 });
  }

  await syncUserProfile({
    clerkUserId: userId,
    email,
    displayName,
  });

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'Select an image before uploading.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: 'Avatar uploads are capped at 5MB.' }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || 'avatar');
  const objectKey = \`avatars/\${userId}/\${Date.now()}-\${safeName || 'avatar'}\`;
  const body = Buffer.from(await file.arrayBuffer());
  const upload = await uploadUserAsset({
    objectKey,
    body,
    contentType: file.type || null,
  });

  await updateAvatarForUser(userId, {
    objectKey,
    contentType: file.type || null,
  });

  await createUploadRecord(userId, {
    objectKey,
    bucket: upload.bucket,
    contentType: file.type || null,
  });

  return Response.json({
    ok: true,
    avatarUrl: \`/api/account/avatar?v=\${Date.now()}\`,
  });
}
`);

  writeFile(path.join(root, 'app/api/stripe/checkout/route.ts'), `import { auth, currentUser } from '@clerk/nextjs/server';
import { getClerkProfile } from '@/lib/auth/clerk';
import { syncUserProfile, updateStripeCustomerForUser } from '@/lib/db/queries';
import { getStripe, requireStarterPriceId } from '@/lib/payments/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const { email, displayName } = getClerkProfile(clerkUser);
  if (!email) {
    return Response.json({ error: 'No email address found for the signed-in user.' }, { status: 400 });
  }

  await syncUserProfile({
    clerkUserId: userId,
    email,
    displayName,
  });

  const origin = new URL(request.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: requireStarterPriceId(),
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    customer_email: email,
    client_reference_id: userId,
    success_url: \`\${origin}/dashboard?checkout=success\`,
    cancel_url: \`\${origin}/dashboard?checkout=cancelled\`,
    metadata: {
      clerkUserId: userId,
    },
  });

  if (typeof session.customer === 'string' && session.customer.length > 0) {
    await updateStripeCustomerForUser(userId, session.customer);
  }

  return Response.json({ url: session.url });
}
`);

  writeFile(path.join(root, 'app/api/stripe/portal/route.ts'), `import { auth } from '@clerk/nextjs/server';
import { findUserByClerkId } from '@/lib/db/queries';
import { getStripe } from '@/lib/payments/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await findUserByClerkId(userId);

  if (!user?.stripeCustomerId) {
    return Response.json({
      error: 'No Stripe customer is attached yet. Run the starter checkout flow once to seed billing.',
    }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: \`\${origin}/dashboard\`,
  });

  return Response.json({ url: session.url });
}
`);

  writeFile(path.join(root, 'app/dashboard/page.tsx'), `import Link from 'next/link';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ArrowRight, CreditCard, Database, HardDriveUpload, Sparkles } from 'lucide-react';
import { HeaderUserMenu } from '@/components/dashboard/header-user-menu';
import { getClerkProfile } from '@/lib/auth/clerk';
import { getDashboardState } from '@/lib/app/dashboard';
import { buttonVariants } from '@/lib/ui/button';
import { cn } from '@/lib/utils';

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();
  const profile = getClerkProfile(user);
  const email = profile.email ?? 'builder@example.com';
  const displayName = profile.displayName;
  const dashboard = await getDashboardState({
    clerkUserId: userId,
    email,
    displayName,
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_24%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4 rounded-[2rem] border border-border/70 bg-background/85 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">anhedral starter</p>
            <h1 className="text-lg font-semibold tracking-tight">{displayName}</h1>
          </div>
          <HeaderUserMenu
            avatarUrl={dashboard.avatarUrl}
            creditsBalance={dashboard.creditsBalance}
            displayName={dashboard.displayName}
            email={dashboard.email}
            subscriptionStatus={dashboard.subscriptionStatus}
            subscriptionTier={dashboard.subscriptionTier}
          />
        </header>

        <section className="grid flex-1 gap-6 py-10 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-border/70 bg-background/90 p-8 shadow-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="size-3.5" />
                Dashboard starter
              </div>
              <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Ship the logged-in shell first. Replace the placeholders after your product model is clear.
              </h2>
              <p className="mt-4 max-w-2xl text-base text-muted-foreground">
                The scaffold already wires a protected dashboard, a subscription surface, seeded credits, and R2-backed avatar upload.
                Your team can start inside the app shell instead of building this plumbing from scratch.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <form action="/api/stripe/checkout" method="post">
                  <button className={cn(buttonVariants({ size: 'lg' }))} type="submit">
                    Start starter checkout
                    <ArrowRight className="size-4" />
                  </button>
                </form>

                <Link className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))} href="/">
                  View landing page
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-[1.75rem] border border-border/70 bg-background/90 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <CreditCard className="size-3.5" />
                  Billing
                </div>
                <p className="mt-4 text-2xl font-semibold capitalize">{dashboard.subscriptionStatus.replaceAll('_', ' ')}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stripe Billing uses Checkout for subscription start and the customer portal for self-serve management.
                </p>
              </article>

              <article className="rounded-[1.75rem] border border-border/70 bg-background/90 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <Database className="size-3.5" />
                  Credits
                </div>
                <p className="mt-4 text-2xl font-semibold">{dashboard.creditsBalance}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Seeded in Drizzle so you can attach real entitlement logic without redesigning the menu.
                </p>
              </article>

              <article className="rounded-[1.75rem] border border-border/70 bg-background/90 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <HardDriveUpload className="size-3.5" />
                  Storage
                </div>
                <p className="mt-4 text-2xl font-semibold">R2 avatar flow</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  The header menu uploads profile images into R2 and serves them back through a signed route.
                </p>
              </article>
            </div>
          </div>

          <aside className="space-y-4 rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Template notes</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">Replace these first</h3>
            </div>

            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Swap the starter Stripe price id with your real recurring product and add webhook handlers.
              </li>
              <li className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Replace the seeded credits model with your real usage accounting rules.
              </li>
              <li className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Expand the dashboard once your primary signed-in workflow is defined.
              </li>
            </ul>

            {!dashboard.databaseReady ? (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                Database connectivity is not ready yet. The starter falls back to placeholder subscription and credits data until your Neon env and Drizzle migrations are in place.
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/layout.tsx'), `import { shadcn } from '@clerk/ui/themes';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: '${displayName}',
  description: 'Anhedral starter with Clerk auth, Stripe billing, Neon + Drizzle, and R2 avatars.',
};

const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: 'oklch(0.205 0 0)',
    colorBackground: 'oklch(1 0 0)',
    borderRadius: '1rem',
  },
  options: {
    logoImageUrl: '${ANHEDRAL_LOGO_PUBLIC_PATH}',
    socialButtonsVariant: 'iconButton' as const,
    socialButtonsPlacement: 'top' as const,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        suppressHydrationWarning
        className="antialiased font-sans"
      >
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
`);

  writeFile(path.join(root, 'app/page.tsx'), `import { auth } from '@clerk/nextjs/server';
import { ArrowRight, Cloud, CreditCard, Database, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/lib/ui/button';
import { cn } from '@/lib/utils';

const pillars = [
  {
    title: 'Landing page here',
    description: 'This placeholder is intentional. Replace the copy, media, and pricing once your narrative is ready.',
    icon: Cloud,
  },
  {
    title: 'Clerk custom auth',
    description: 'Custom-branded sign-in and sign-up routes are already mounted at /sign-in and /sign-up.',
    icon: ShieldCheck,
  },
  {
    title: 'Stripe + credits',
    description: 'The signed-in shell already reserves space for subscription state, checkout, and credit balances.',
    icon: CreditCard,
  },
  {
    title: 'Neon + Drizzle + R2',
    description: 'Core persistence and avatar upload plumbing are scaffolded so your product team starts higher in the stack.',
    icon: Database,
  },
];

export default async function HomePage() {
  const { userId } = await auth();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_25%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-4 rounded-[2rem] border border-border/70 bg-background/85 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">anhedral starter</p>
            <p className="text-lg font-semibold tracking-tight">${displayName}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link className={cn(buttonVariants({ variant: 'ghost' }))} href="/sign-in">
              Sign in
            </Link>
            <Link className={cn(buttonVariants())} href={userId ? '/dashboard' : '/sign-up'}>
              {userId ? 'Open dashboard' : 'Start with sign up'}
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-14 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2.25rem] border border-border/70 bg-background/90 p-8 shadow-sm sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Replace me with your real story
            </div>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl">
              Landing page here. Keep the shell, then turn it into your actual acquisition motion.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              The generated project starts with a real auth flow, a signed-in dashboard shell, Stripe billing entry points,
              and an R2 avatar path so your first sprint is focused on product, not setup.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link className={cn(buttonVariants({ size: 'lg' }))} href={userId ? '/dashboard' : '/sign-up'}>
                {userId ? 'Go to dashboard' : 'Create your first account'}
                <ArrowRight className="size-4" />
              </Link>
              <Link className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))} href="/sign-in">
                See the sign-in flow
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            {pillars.map(({ title, description, icon: Icon }) => (
              <article key={title} className="rounded-[1.75rem] border border-border/70 bg-background/90 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="text-lg font-semibold">{title}</h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/sign-in/[[...sign-in]]/page.tsx'), `import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_24%)] px-6 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex flex-col justify-between rounded-[2rem] border border-border/70 bg-background/90 p-8 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Clerk custom UI</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Sign in without rebuilding the basics.</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            This route is intentionally branded and lives alongside your app shell. Swap the copy and continue shipping.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-border/70 bg-muted/30 p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Already wired:</p>
          <ul className="mt-3 space-y-2">
            <li>Custom route at /sign-in</li>
            <li>Clerk shadcn theme through ClerkProvider</li>
            <li>Dashboard redirect after authentication</li>
          </ul>
          <p className="mt-4">
            Need a different conversion flow? Pair this page with the installed Clerk skill and replace it with a hook-driven form later.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center py-8 lg:py-0">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-background/95 p-4 shadow-xl">
          <SignIn forceRedirectUrl="/dashboard" path="/sign-in" routing="path" signUpUrl="/sign-up" />
          <p className="px-4 pb-2 text-center text-sm text-muted-foreground">
            Need an account?{' '}
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/sign-up">
              Create one
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/sign-up/[[...sign-up]]/page.tsx'), `import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(29,78,216,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.14),transparent_24%)] px-6 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="flex items-center justify-center py-8 lg:order-2 lg:py-0">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-background/95 p-4 shadow-xl">
          <SignUp forceRedirectUrl="/dashboard" path="/sign-up" routing="path" signInUrl="/sign-in" />
          <p className="px-4 pb-2 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/sign-in">
              Sign in
            </Link>
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-between rounded-[2rem] border border-border/70 bg-background/90 p-8 shadow-sm lg:order-1">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Starter onboarding</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Get users into the product shell immediately.</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            The generated starter sends new accounts straight into the dashboard with billing, credits, and avatar plumbing already waiting.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-border/70 bg-muted/30 p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Good first replacements:</p>
          <ul className="mt-3 space-y-2">
            <li>Swap the starter tier labels and pricing copy</li>
            <li>Add your real onboarding questionnaire or workspace creation step</li>
            <li>Connect webhook-driven billing state once Stripe products are finalized</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/globals.css'), `@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
@import '@clerk/ui/themes/shadcn.css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-heading: var(--font-app-sans);
  --font-sans: var(--font-app-sans);
  --font-mono: var(--font-app-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --font-app-sans: 'Avenir Next', 'Inter', 'Segoe UI', sans-serif;
  --font-app-mono: 'JetBrains Mono', 'SFMono-Regular', monospace;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.875rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  html {
    @apply font-sans;
  }

  body {
    @apply bg-background text-foreground;
  }
}
`);

  writeFile(path.join(root, 'next.config.mjs'), `import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
`);

  writeFile(path.join(root, 'proxy.ts'), `import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
`);

  writeAnhedralLogo(root);
}
