import path from 'node:path';
import type { InfrastructureSelections, ProjectOptions } from '../project.js';
import { writeFile } from '../util.js';

type ProvisionPhase = {
  readonly id: string;
  readonly product: keyof InfrastructureSelections;
  readonly summary: string;
  readonly probes: readonly string[];
  readonly plannedChanges: readonly string[];
  readonly approvalGates: readonly string[];
  readonly verification: readonly string[];
};

const EMPTY_INFRASTRUCTURE: Readonly<InfrastructureSelections> = Object.freeze({
  ubuntu: false,
  docker: false,
  postgres: false,
  nginx: false,
  certbot: false,
});

function infrastructureFor(options: ProjectOptions): Readonly<InfrastructureSelections> {
  return options.infrastructure ?? EMPTY_INFRASTRUCTURE;
}

const PHASES: readonly ProvisionPhase[] = Object.freeze([
  {
    id: 'host-baseline',
    product: 'ubuntu',
    summary: 'Validate the Ubuntu host and establish a recoverable administration baseline.',
    probes: [
      'uname -s',
      'cat /etc/os-release',
      'id',
      'ss -lntup',
    ],
    plannedChanges: [
      'Apply supported Ubuntu security updates.',
      'Configure a non-root administrative account with SSH key authentication.',
      'Enable automatic security updates and persistent system logging.',
    ],
    approvalGates: [
      'Confirm provider-console access before changing SSH or administrator accounts.',
      'Confirm a second authenticated SSH session before ending the current session.',
    ],
    verification: [
      'The administrative account can open a new SSH session.',
      'Password authentication and direct root login match the documented policy.',
      'Pending security updates and failed systemd units are reviewed.',
    ],
  },
  {
    id: 'container-runtime',
    product: 'docker',
    summary: 'Install and validate Docker Engine and the Compose plugin from Docker’s package repository.',
    probes: [
      'docker version',
      'docker compose version',
      'systemctl is-enabled docker',
      'systemctl is-active docker',
    ],
    plannedChanges: [
      'Install Docker Engine and the Compose plugin from the official apt repository.',
      'Enable Docker at boot and grant runtime access only to approved operators.',
      'Define container-aware firewall policy before publishing ports.',
    ],
    approvalGates: [
      'Review Docker daemon privileges and operator group membership.',
      'Review the DOCKER-USER firewall policy; do not replace it with unrestricted forwarding.',
    ],
    verification: [
      'Docker and Compose report expected versions.',
      'Only explicitly declared container ports are reachable externally.',
      'Docker starts successfully after a host reboot.',
    ],
  },
  {
    id: 'postgres-runtime',
    product: 'postgres',
    summary: 'Prepare an internal PostgreSQL service with durable storage and off-host backups.',
    probes: [
      'docker compose config',
      'docker volume ls',
      'df -h',
    ],
    plannedChanges: [
      'Create a private PostgreSQL service without a public host port.',
      'Store database credentials outside Git and inject them at deployment time.',
      'Configure encrypted, off-host logical backups and a tested restore procedure.',
    ],
    approvalGates: [
      'Confirm the database image digest and supported PostgreSQL release.',
      'Confirm backup destination, retention, encryption, and restore ownership.',
    ],
    verification: [
      'PostgreSQL is reachable only from the intended private container network.',
      'The application connects with a least-privilege role.',
      'A restore drill succeeds from an off-host backup.',
    ],
  },
  {
    id: 'reverse-proxy',
    product: 'nginx',
    summary: 'Prepare Nginx as the only public HTTP entry point.',
    probes: [
      'getent hosts "$DOMAIN"',
      'ss -lntup',
      'docker compose config',
    ],
    plannedChanges: [
      'Publish only TCP ports 80 and 443 through the reverse proxy.',
      'Render the Nginx configuration from explicitly validated domain values.',
      'Forward requests only to named services on a private container network.',
    ],
    approvalGates: [
      'Confirm DNS resolves to the intended host before enabling production routing.',
      'Review proxy headers, trusted-hop count, request limits, and health endpoints.',
    ],
    verification: [
      'Nginx configuration validation succeeds.',
      'HTTP health checks reach the intended upstream services.',
      'Application and database containers have no unintended public ports.',
    ],
  },
  {
    id: 'tls-lifecycle',
    product: 'certbot',
    summary: 'Prepare Let’s Encrypt issuance and observable certificate renewal.',
    probes: [
      'getent hosts "$DOMAIN"',
      'curl -fsS "http://$DOMAIN/.well-known/acme-challenge/anhedral-probe"',
      'openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN"',
    ],
    plannedChanges: [
      'Issue certificates only after DNS and the HTTP-01 challenge path verify.',
      'Run renewal on a documented schedule with Nginx reload after successful renewal.',
      'Surface Certbot or reload failures instead of masking them.',
    ],
    approvalGates: [
      'Confirm the Let’s Encrypt account email and every requested hostname.',
      'Use the staging ACME endpoint for rehearsal before production issuance.',
    ],
    verification: [
      'A staging dry-run renewal succeeds.',
      'The served certificate covers every intended hostname and has a complete chain.',
      'Renewal failures produce an actionable alert.',
    ],
  },
]);

function selectedPhases(options: ProjectOptions): readonly ProvisionPhase[] {
  const infrastructure = infrastructureFor(options);
  return PHASES.filter((phase) => infrastructure[phase.product]);
}

function generatedPlan(options: ProjectOptions): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    project: options.projectName,
    mode: 'plan-only',
    products: Object.entries(infrastructureFor(options))
      .filter(([, selected]) => selected)
      .map(([product]) => product),
    phases: selectedPhases(options),
    safety: {
      mutatesRemoteHost: false,
      requiresExplicitApplyCommand: true,
      commandHistoryReplayAllowed: false,
    },
  }, null, 2)}\n`;
}

function generatedReadme(options: ProjectOptions): string {
  const products = Object.entries(infrastructureFor(options))
    .filter(([, selected]) => selected)
    .map(([product]) => `\`--${product}\``)
    .join(', ');
  return `# ${options.displayName} infrastructure

Selected products: ${products}.

This directory is a declarative, plan-only starting point for a self-hosted deployment. It does not replay shell history and it does not mutate a remote host. Inspect the machine-readable plan with:

\`\`\`sh
pnpm provision:plan
pnpm provision:plan:json
\`\`\`

Each phase follows **probe → plan → approval → apply → verify**. The generated plan currently implements the first two stages only. A future executor must be resumable and idempotent, checkpoint after every phase, reconnect after SSH-sensitive changes, and stop for explicit approval before account, SSH, firewall, DNS, certificate, database, or destructive container operations.

Do not treat a Docker volume as a backup. Keep PostgreSQL private, use encrypted off-host backups, and test restoration. Published Docker ports require container-aware firewall policy; broad system-wide forwarding is not an acceptable workaround.
`;
}

const PLAN_READER = `import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== '--json') throw new Error('provision:plan only supports --json; remote apply is not implemented.');
}

const plan = JSON.parse(readFileSync(new URL('../deploy/anhedral-provision.json', import.meta.url), 'utf8'));
if (plan.mode !== 'plan-only' || plan.safety?.mutatesRemoteHost !== false) {
  throw new Error('Refusing to read a provisioning plan without the plan-only safety contract.');
}

if (args.has('--json')) {
  process.stdout.write(JSON.stringify(plan, null, 2) + '\\n');
} else {
  console.log('Provisioning plan for ' + plan.project);
  console.log('Products: ' + plan.products.join(', '));
  for (const [index, phase] of plan.phases.entries()) {
    console.log('\\n' + (index + 1) + '. ' + phase.summary);
    console.log('   probes: ' + phase.probes.join('; '));
    console.log('   approval gates: ' + phase.approvalGates.length);
  }
  console.log('\\nPlan only: no local or remote state was changed.');
}
`;

export function scaffoldInfrastructure(root: string, options: ProjectOptions): void {
  writeFile(path.join(root, 'deploy', 'anhedral-provision.json'), generatedPlan(options));
  writeFile(path.join(root, 'deploy', 'README.md'), generatedReadme(options));
  writeFile(path.join(root, 'scripts', 'provision-plan.mjs'), PLAN_READER);
}
