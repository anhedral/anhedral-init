import path from 'node:path';
import { writeReactLintConfig } from './lint.js';
import { writeFile } from '../util.js';
import type { ProjectOptions } from '../project.js';
import { EXTENSION_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, htmlText, jsString, markdownHeading } from '../render.js';
export async function scaffoldExtension(root: string, options: ProjectOptions): Promise<void> {
    const { projectName, displayName, extensionSurface = 'sidepanel' } = options;
    const dir = path.join(root, 'apps/extension');
    writePackageJson(dir, projectName);
    writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: './.wxt/tsconfig.json', compilerOptions: { strict: true, jsx: 'react-jsx', paths: { '@/*': ['./src/*'] } } }, null, 2) + '\n');
    writeReactLintConfig(dir);
    writeWxtConfig(dir, displayName, extensionSurface);
    writeEnvExample(dir);
    writePostcssConfig(dir);
    writeTailwindConfig(dir);
    writeShadcnConfig(dir);
    writeReadme(dir, displayName, extensionSurface);
    writeCnUtil(dir);
    writeButtonComponent(dir);
    if (extensionSurface === 'sidepanel') writeBackground(dir);
    writeSurfaceEntry(dir, extensionSurface);
    writeSurfaceHtml(dir, displayName, extensionSurface);
    writeSurfaceApp(dir, extensionSurface);
    writeStyles(dir);
}
function writePackageJson(dir: string, projectName: string): void {
    writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: childPackageName(projectName, 'chrome-ext'),
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
            dev: 'wxt',
            build: 'wxt build',
            postinstall: 'wxt prepare',
            zip: 'wxt zip',
            typecheck: 'tsc --noEmit',
            lint: 'eslint src --max-warnings 0',
        },
        dependencies: EXTENSION_DEPENDENCIES.dependencies,
        devDependencies: { ...EXTENSION_DEPENDENCIES.devDependencies, '@workspace/eslint-config': 'workspace:*', eslint: '9.39.1' },
    }, null, 2) + '\n');
}
function writeWxtConfig(dir: string, displayName: string, surface: 'sidepanel' | 'popup'): void {
    const nameLiteral = jsString(displayName);
    const descriptionLiteral = jsString(`${displayName} Chrome Extension`);
    const actionTitleLiteral = jsString(`Open ${displayName}`);
    writeFile(path.join(dir, 'wxt.config.ts'), `import { defineConfig } from 'wxt';


export default defineConfig({
  srcDir: 'src',
  manifest: () => {
    const crxPublicKey = import.meta.env.VITE_CRX_PUBLIC_KEY || '';


    return {
      name: ${nameLiteral},
      description: ${descriptionLiteral},
      version: '0.1.0',
      ...(crxPublicKey ? { key: crxPublicKey } : {}),
      ${surface === 'sidepanel' ? "minimum_chrome_version: '114'," : ''}
      permissions: ${surface === 'sidepanel' ? "['activeTab', 'scripting', 'sidePanel']" : "['activeTab', 'scripting']"},
      host_permissions: [],
      action: {
        default_title: ${actionTitleLiteral},
        ${surface === 'popup' ? "default_popup: 'popup.html'," : ''}
      },
      ${surface === 'sidepanel' ? "side_panel: { default_path: 'sidepanel.html' }," : ''}
    };
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 3000,
    },
  }),
});
`);
}
function extensionEnvContents(): string {
    const sections: string[] = [];
    sections.push(`# Chrome Extension CRX public key (optional, for stable extension ID)
VITE_CRX_PUBLIC_KEY=`);
    return `${sections.join('\n\n')}\n`;
}
function writeEnvExample(dir: string): void {
    writeFile(path.join(dir, '.env.example'), extensionEnvContents());
}
function writePostcssConfig(dir: string): void {
    writeFile(path.join(dir, 'postcss.config.cjs'), `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);
}
function writeShadcnConfig(dir: string): void {
    writeFile(path.join(dir, 'components.json'), JSON.stringify({
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'new-york',
        rsc: false,
        tsx: true,
        tailwind: {
            config: '',
            css: 'src/styles/main.css',
            baseColor: 'neutral',
            cssVariables: true,
            prefix: '',
        },
        aliases: {
            components: '@/components',
            utils: '@/lib/utils',
            ui: '@/components/ui',
            lib: '@/lib',
            hooks: '@/hooks',
        },
        iconLibrary: 'lucide',
    }, null, 2) + '\n');
}
function writeCnUtil(dir: string): void {
    writeFile(path.join(dir, 'src/lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);
}
function writeButtonComponent(dir: string): void {
    writeFile(path.join(dir, 'src/components/ui/button.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
`);
}
function writeTailwindConfig(dir: string): void {
    writeFile(path.join(dir, 'tailwind.config.cjs'), `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
`);
}
function writeReadme(dir: string, displayName: string, surface: 'sidepanel' | 'popup'): void {
    writeFile(path.join(dir, 'README.md'), `# ${markdownHeading(displayName)} Chrome Extension

WXT ${surface} extension generated by anhedral. Choose the surface for the task; content UI, options pages and background-only behavior require targeted implementation.

## Development

\`\`\`bash
cp .env.example .env
pnpm dev
pnpm build
pnpm zip
\`\`\`

Run these commands from \`apps/extension\`. Anhedral generates only \`.env.example\`; keep the local \`.env\` file uncommitted. Set \`VITE_CRX_PUBLIC_KEY\` only when you need a stable Chrome extension ID.

## Chrome

Run \`pnpm build\`, then load \`.output/chrome-mv3\` as an unpacked extension from \`chrome://extensions\`.

${surface === 'sidepanel' ? "The browser action opens the Side Panel API surface (Chrome 114+) with the sidePanel permission." : "The browser action opens popup.html; no sidePanel permission or panel background handler is generated."} Active-page reads use a user-triggered activeTab + scripting grant instead of persistent site access. Remove these permissions and the example read action if the product does not need page inspection.
`);
}
function writeBackground(dir: string): void {
    writeFile(path.join(dir, 'src/entrypoints/background.ts'), `type ChromeWithSidePanel = typeof chrome & {
  sidePanel: {
    setPanelBehavior: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
  };
};

export default defineBackground(() => {

  // Open the side panel when the extension icon is clicked.
  (chrome as ChromeWithSidePanel).sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
`);
}
function writeSurfaceEntry(dir: string, surface: 'sidepanel' | 'popup'): void {
    writeFile(path.join(dir, `src/entrypoints/${surface}/main.tsx`), `import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ExtensionApp } from './app';
import '../../styles/main.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ExtensionApp />
    </React.StrictMode>
  );
}
`);
}
function writeSurfaceHtml(dir: string, displayName: string, surface: 'sidepanel' | 'popup'): void {
    writeFile(path.join(dir, `src/entrypoints/${surface}/index.html`), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${htmlText(displayName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`);
}
function writeSurfaceApp(dir: string, surface: 'sidepanel' | 'popup'): void {
    writeFile(path.join(dir, `src/entrypoints/${surface}/app.tsx`), `import * as React from 'react';
import { Button } from '../../components/ui/button';

type PageSnapshot = {
  title: string;
  location: string;
};

async function readPageSnapshot(): Promise<PageSnapshot> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab is available.');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ title: document.title, location: window.location.href }),
  });
  if (!result) throw new Error('The active page did not return a snapshot.');
  return result as PageSnapshot;
}

export function ExtensionApp() {
  const [page, setPage] = React.useState<PageSnapshot | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const readActivePage = React.useCallback(async () => {
    setPageError(null);
    try {
      setPage(await readPageSnapshot());
    } catch {
      setPageError('Chrome does not allow this page to be inspected. Open a normal website and try again.');
    }
  }, []);


  return (
    <div style={{ padding: 24${surface === 'popup' ? ', minWidth: 320' : ''} }}>
      <h2>Welcome!</h2>
      <Button type="button" onClick={() => void readActivePage()}>Read active page</Button>
      {page ? (
        <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <strong>{page.title || 'Untitled page'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{page.location}</p>
        </div>
      ) : null}
      {pageError ? <p role="alert" aria-live="assertive" style={{ color: 'hsl(var(--destructive))' }}>{pageError}</p> : null}
    </div>
  );
}
`);
}
function writeStyles(dir: string): void {
    writeFile(path.join(dir, 'src/styles/main.css'), `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 63.9%;
    --radius: 0.5rem;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`);
}
