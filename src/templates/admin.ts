import path from 'node:path';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../project.js';
import { childPackageName, jsString } from '../render.js';
import { writeFile } from '../util.js';
import { WEB_APP_DEPENDENCIES } from '../dependencies.js';

export async function scaffoldAdmin(root: string, options: ProjectOptions): Promise<void> {
  if (options.adminMode !== 'app') return;
  const dir = path.join(root, 'apps/admin');
  const dependencies = { ...(WEB_APP_DEPENDENCIES.dependencies ?? {}) };
  delete dependencies['@clerk/nextjs'];
  delete dependencies['@clerk/ui'];
  delete dependencies['@shared/api-client'];
  delete dependencies['@shared/realtime'];
  dependencies['@shared/db'] = 'workspace:*';
  dependencies['drizzle-orm'] = '0.45.2';

  anhedralPrint.section('Admin (separate Next.js application)');
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'admin'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev --port 3001',
      build: 'next build',
      start: 'next start --port 3001',
      typecheck: 'tsc --noEmit',
    },
    dependencies,
    devDependencies: WEB_APP_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'react-jsx',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');
  writeFile(path.join(dir, 'next.config.ts'), `import type { NextConfig } from 'next';
const nextConfig: NextConfig = {};
export default nextConfig;
`);
  writeFile(path.join(dir, 'postcss.config.mjs'), `export default { plugins: { '@tailwindcss/postcss': {} } };
`);
  writeFile(path.join(dir, '.env.example'), `ADMIN_AUTH_SECRET=replace-with-a-different-32-character-random-secret
DATABASE_URL=YOUR_NEON_POSTGRES_URL
`);
  writeFile(path.join(dir, 'app/globals.css'), `@import "tailwindcss";
body { margin: 0; background: #fafafa; color: #171717; font-family: Arial, Helvetica, sans-serif; }
`);
  writeFile(path.join(dir, 'app/layout.tsx'), `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: ${jsString(`${options.displayName} Admin`)},
  description: 'Restricted platform administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`);
  writeFile(path.join(dir, 'app/(auth)/auth.config.ts'), `import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: { signIn: '/sign-in' },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (!nextUrl.pathname.startsWith('/admin')) return true;
      return Boolean(auth?.user?.id && auth.user.role === 'admin');
    },
  },
} satisfies NextAuthConfig;
`);
  writeFile(path.join(dir, 'app/(auth)/auth.ts'), `import { compare } from 'bcrypt-ts';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { consumeLoginRateLimit } from '@/lib/auth-rate-limit';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  username: z.string().trim().email(),
  password: z.string().min(8).max(200),
});
const isProduction = process.env.NODE_ENV === 'production';

export const {
  handlers: { GET, POST }, auth, signIn, signOut,
} = NextAuth({
  ...authConfig,
  secret: process.env.ADMIN_AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8, updateAge: 60 * 30 },
  cookies: {
    sessionToken: {
      name: isProduction ? '__Secure-authjs.admin.session-token' : 'authjs.admin.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: isProduction },
    },
  },
  providers: [Credentials({
    credentials: {
      username: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(rawCredentials, request) {
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      const email = parsed.data.username.toLowerCase();
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown';
      if (!await consumeLoginRateLimit('admin-ip:' + ip, 60)) return null;
      if (!await consumeLoginRateLimit('admin-email:' + email, 12)) return null;
      const [{ db, users }, { eq }] = await Promise.all([
        import('@shared/db'),
        import('drizzle-orm'),
      ]);
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (!user || user.status !== 'active' || user.disabledAt || !user.isPlatformAdmin) return null;
      if (!await compare(parsed.data.password, user.passwordHash)) return null;
      return { id: user.id, email: user.email, name: user.name, role: 'admin' };
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      if (typeof token.id !== 'string') return token;
      const [{ db, users }, { eq }] = await Promise.all([
        import('@shared/db'),
        import('drizzle-orm'),
      ]);
      const current = await db.query.users.findFirst({ where: eq(users.id, token.id) });
      if (!current || current.status !== 'active' || current.disabledAt || !current.isPlatformAdmin) {
        delete token.id;
        token.role = 'member';
      } else {
        token.role = 'admin';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === 'string') {
        session.user.id = token.id;
        session.user.role = token.role === 'admin' ? 'admin' : 'member';
      }
      return session;
    },
  },
});
`);
  writeFile(path.join(dir, 'lib/auth-rate-limit.ts'), `import 'server-only';

export async function consumeLoginRateLimit(key: string, maximum: number): Promise<boolean> {
  const [{ authRateLimits, db }, { sql }] = await Promise.all([
    import('@shared/db'),
    import('drizzle-orm'),
  ]);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const [result] = await db.insert(authRateLimits)
    .values({ key, attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        attempts: sql\`case when \${authRateLimits.windowStartedAt} < \${cutoff} then 1 else \${authRateLimits.attempts} + 1 end\`,
        windowStartedAt: sql\`case when \${authRateLimits.windowStartedAt} < \${cutoff} then \${now} else \${authRateLimits.windowStartedAt} end\`,
      },
    })
    .returning({ attempts: authRateLimits.attempts });
  return Boolean(result && result.attempts <= maximum);
}
`);
  writeFile(path.join(dir, 'app/(auth)/actions.ts'), `'use server';
import { AuthError } from 'next-auth';
import { signIn, signOut } from './auth';

export async function login(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirectTo: '/admin',
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return 'Invalid administrator credentials.';
    throw error;
  }
}
export async function logout() { await signOut({ redirectTo: '/sign-in' }); }
`);
  writeFile(path.join(dir, 'app/(auth)/api/auth/[...nextauth]/route.ts'), `export { GET, POST } from '@/app/(auth)/auth';
`);
  writeFile(path.join(dir, 'app/(auth)/sign-in/page.tsx'), `'use client';
import { useActionState } from 'react';
import { login } from '../actions';

export default function SignInPage() {
  const [error, action, pending] = useActionState(login, null);
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
    <form action={action} className="w-full space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Administrator sign in</h1>
      <input className="h-10 w-full rounded-md border px-3" name="username" placeholder="Email" type="email" required />
      <input className="h-10 w-full rounded-md border px-3" name="password" placeholder="Password" type="password" required minLength={8} />
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <button className="h-10 w-full rounded-md bg-black text-white disabled:opacity-50" disabled={pending} type="submit">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  </main>;
}
`);
  writeFile(path.join(dir, 'lib/authz.ts'), `import 'server-only';
import { auth } from '@/app/(auth)/auth';

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const [{ db, users }, { eq }] = await Promise.all([
    import('@shared/db'),
    import('drizzle-orm'),
  ]);
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user || user.status !== 'active' || user.disabledAt || !user.isPlatformAdmin) throw new Error('Unauthorized');
  return { session, user };
}
`);
  writeFile(path.join(dir, 'app/(admin)/admin/layout.tsx'), `import { logout } from '@/app/(auth)/actions';
import { requireAdmin } from '@/lib/authz';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireAdmin();
  return <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
    <header className="mb-8 flex items-center justify-between border-b pb-4">
      <strong>${options.displayName} Admin</strong>
      <div className="flex items-center gap-4 text-sm"><span>{session.user.email}</span>
        <form action={logout}><button type="submit">Sign out</button></form>
      </div>
    </header>
    {children}
  </div>;
}
`);
  writeFile(path.join(dir, 'app/(admin)/admin/page.tsx'), `import { requireAdmin } from '@/lib/authz';

export default async function AdminPage() {
  await requireAdmin();
  const { db, users } = await import('@shared/db');
  const allUsers = await db.select({
    id: users.id, name: users.name, email: users.email, status: users.status,
    isPlatformAdmin: users.isPlatformAdmin, createdAt: users.createdAt,
  }).from(users).limit(100);
  return <main className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Administration</h1>
      <p className="text-neutral-600">Platform users and selected module details.</p>
    </div>
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-xl font-medium">Users</h2>
      <ul className="divide-y">{allUsers.map((user) => <li className="flex justify-between py-3 text-sm" key={user.id}>
        <span>{user.name} · {user.email}</span>
        <span>{user.isPlatformAdmin ? 'Platform admin' : user.status}</span>
      </li>)}</ul>
    </section>
  </main>;
}
`);
  writeFile(path.join(dir, 'types/next-auth.d.ts'), `import 'next-auth';
import 'next-auth/jwt';
declare module 'next-auth' {
  interface User { role?: 'member' | 'admin' }
  interface Session { user: User & { id: string; email: string; role: 'member' | 'admin' } }
}
declare module 'next-auth/jwt' {
  interface JWT { id?: string; role?: 'member' | 'admin' }
}
`);
  writeFile(path.join(dir, 'proxy.ts'), `import NextAuth from 'next-auth';
import { authConfig } from '@/app/(auth)/auth.config';
export const proxy = NextAuth(authConfig).auth;
export const config = { matcher: ['/admin/:path*'] };
`);
  anhedralPrint.done('Separate Next.js admin application written');
}
