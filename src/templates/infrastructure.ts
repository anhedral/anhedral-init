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

This directory contains both a declarative provisioning plan and an explicit,
idempotent bootstrap for a fresh Ubuntu VPS. The plan never mutates a host:

\`\`\`sh
pnpm provision:plan
pnpm provision:plan:json
\`\`\`

Run the bootstrap **on the VPS from a checked-out release**. First inspect its
preflight, then apply the complete host baseline with one command:

\`\`\`sh
pnpm dlx anhedral@latest setup-vps --check
ANHEDRAL_DOMAIN=app.example.com \\
ANHEDRAL_EMAIL=ops@example.com \\
ANHEDRAL_ENABLE_TLS=1 \\
pnpm dlx anhedral@latest setup-vps
\`\`\`

\`setup-vps\` validates this checkout against \`anhedral.json\`, then elevates
with \`sudo\`, installs security updates, unattended
upgrades, UFW, Fail2ban, the selected container/proxy/TLS packages, and an
application release service under \`/opt/${options.projectName}\`. It creates a
non-root administrator by copying an existing authorized-keys file; it refuses
to continue when no usable public key exists. Root password login is disabled,
but root key login remains available as a recovery path until an operator has
verified a second session and deliberately tightens that policy.

The command does not fetch application source or transport secrets. Put each
immutable release on the host, include a reviewed \`compose.yaml\`, then activate
it with \`sudo anhedral-deploy /absolute/path/to/release\`. Compose validation
must pass before the \`current\` symlink and systemd service change.

Each phase follows **probe → plan → approval → apply → verify**. Review the plan,
keep provider-console access available, and open a second authenticated SSH
session before ending the first one after any SSH or firewall change.

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

function generatedVpsSetup(options: ProjectOptions): string {
  const infrastructure = infrastructureFor(options);
  return `#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME='${options.projectName}'
INSTALL_DOCKER='${infrastructure.docker ? '1' : '0'}'
INSTALL_NGINX='${infrastructure.nginx ? '1' : '0'}'
INSTALL_CERTBOT='${infrastructure.certbot ? '1' : '0'}'
MODE='check'

if [ "$#" -gt 1 ]; then
  echo "Usage: bash deploy/vps/setup.sh [--check|--apply]" >&2
  exit 64
fi
if [ "$#" -eq 1 ]; then MODE="$1"; fi
if [ "$MODE" != '--check' ] && [ "$MODE" != '--apply' ] && [ "$MODE" != 'check' ]; then
  echo "Usage: bash deploy/vps/setup.sh [--check|--apply]" >&2
  exit 64
fi

DOMAIN="$(printenv ANHEDRAL_DOMAIN 2>/dev/null || true)"
EMAIL="$(printenv ANHEDRAL_EMAIL 2>/dev/null || true)"
ADMIN_USER="$(printenv ANHEDRAL_ADMIN_USER 2>/dev/null || true)"
AUTHORIZED_KEYS_FILE="$(printenv ANHEDRAL_AUTHORIZED_KEYS_FILE 2>/dev/null || true)"
ENABLE_TLS="$(printenv ANHEDRAL_ENABLE_TLS 2>/dev/null || true)"

if [ -z "$ADMIN_USER" ]; then
  ADMIN_USER="$(printenv SUDO_USER 2>/dev/null || true)"
fi
if [ -z "$ADMIN_USER" ] || [ "$ADMIN_USER" = root ]; then ADMIN_USER=deploy; fi
if ! printf '%s' "$ADMIN_USER" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$'; then
  echo "ANHEDRAL_ADMIN_USER is not a valid Linux account name." >&2
  exit 64
fi
if [ -n "$DOMAIN" ] && ! printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+$'; then
  echo "ANHEDRAL_DOMAIN contains unsupported characters." >&2
  exit 64
fi
if [ "$ENABLE_TLS" = 1 ] && { [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; }; then
  echo "TLS issuance requires ANHEDRAL_DOMAIN and ANHEDRAL_EMAIL." >&2
  exit 64
fi

echo "Anhedral VPS bootstrap"
echo "  project: $PROJECT_NAME"
echo "  admin: $ADMIN_USER"
echo "  domain: \${DOMAIN:-not configured}"
echo "  Docker: $INSTALL_DOCKER; Nginx: $INSTALL_NGINX; Certbot: $INSTALL_CERTBOT"
echo "  mode: $MODE"

if [ "$MODE" != '--apply' ]; then
  echo "Preflight only. Run pnpm dlx anhedral@latest setup-vps to apply on the intended Ubuntu host."
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  exec sudo --preserve-env=ANHEDRAL_DOMAIN,ANHEDRAL_EMAIL,ANHEDRAL_ADMIN_USER,ANHEDRAL_AUTHORIZED_KEYS_FILE,ANHEDRAL_ENABLE_TLS bash "$0" --apply
fi

if [ ! -r /etc/os-release ]; then
  echo "Cannot identify the operating system." >&2
  exit 1
fi
. /etc/os-release
if [ "$ID" != ubuntu ]; then
  echo "This bootstrap supports Ubuntu only; found $ID." >&2
  exit 1
fi

if [ -z "$AUTHORIZED_KEYS_FILE" ]; then
  if [ -s /root/.ssh/authorized_keys ]; then
    AUTHORIZED_KEYS_FILE=/root/.ssh/authorized_keys
  elif [ -n "$(printenv SUDO_USER 2>/dev/null || true)" ] && [ -s "/home/$(printenv SUDO_USER)/.ssh/authorized_keys" ]; then
    AUTHORIZED_KEYS_FILE="/home/$(printenv SUDO_USER)/.ssh/authorized_keys"
  fi
fi
if [ -z "$AUTHORIZED_KEYS_FILE" ] || [ ! -s "$AUTHORIZED_KEYS_FILE" ]; then
  echo "Refusing SSH changes without ANHEDRAL_AUTHORIZED_KEYS_FILE or an existing root/sudo-user authorized_keys file." >&2
  exit 1
fi
if ! grep -Eq '^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp(256|384|521)) ' "$AUTHORIZED_KEYS_FILE"; then
  echo "The authorized-keys source does not contain a recognized SSH public key." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$ADMIN_USER"
fi
usermod -aG sudo "$ADMIN_USER"
install -d -m 0700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
install -m 0600 -o "$ADMIN_USER" -g "$ADMIN_USER" "$AUTHORIZED_KEYS_FILE" "/home/$ADMIN_USER/.ssh/authorized_keys"
printf '%s ALL=(ALL:ALL) ALL\\n' "$ADMIN_USER" > "/etc/sudoers.d/90-anhedral-$ADMIN_USER"
chmod 0440 "/etc/sudoers.d/90-anhedral-$ADMIN_USER"
visudo -cf "/etc/sudoers.d/90-anhedral-$ADMIN_USER"

install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/90-anhedral.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
SSH
sshd -t

SSH_PORT="$(sshd -T | awk '$1 == "port" { print $2; exit }')"
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT/tcp"
if [ "$INSTALL_NGINX" = 1 ]; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
ufw --force enable

cat > /etc/fail2ban/jail.d/anhedral-sshd.local <<'FAIL2BAN'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
FAIL2BAN
systemctl enable --now fail2ban
systemctl reload-or-restart ssh
dpkg-reconfigure -f noninteractive unattended-upgrades

cat > /etc/sysctl.d/90-anhedral.conf <<'SYSCTL'
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
SYSCTL
sysctl --system >/dev/null

if [ "$INSTALL_DOCKER" = 1 ]; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\\n' "$ARCH" "$CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  usermod -aG docker "$ADMIN_USER"

  cat > /usr/local/sbin/anhedral-docker-firewall <<'DOCKER_FIREWALL'
#!/usr/bin/env bash
set -Eeuo pipefail
PUBLIC_INTERFACE="$(ip route show default | awk '{ print $5; exit }')"
test -n "$PUBLIC_INTERFACE"
iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A DOCKER-USER -i "$PUBLIC_INTERFACE" -j DROP
iptables -A DOCKER-USER -j RETURN
DOCKER_FIREWALL
  chmod 0755 /usr/local/sbin/anhedral-docker-firewall
  cat > /etc/systemd/system/anhedral-docker-firewall.service <<'DOCKER_FIREWALL_SERVICE'
[Unit]
Description=Anhedral container ingress firewall
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/anhedral-docker-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
DOCKER_FIREWALL_SERVICE
  systemctl daemon-reload
  systemctl enable --now anhedral-docker-firewall.service
fi

APP_ROOT="/opt/$PROJECT_NAME"
install -d -m 0755 "$APP_ROOT/releases" "$APP_ROOT/shared"
chown -R "$ADMIN_USER:$ADMIN_USER" "$APP_ROOT"

if [ "$INSTALL_DOCKER" = 1 ]; then
  cat > /etc/systemd/system/anhedral-app.service <<SERVICE
[Unit]
Description=$PROJECT_NAME application containers
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
ConditionPathExists=$APP_ROOT/current/compose.yaml

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_ROOT/current
ExecStart=/usr/bin/docker compose --env-file $APP_ROOT/shared/app.env up -d --build --remove-orphans
ExecReload=/usr/bin/docker compose --env-file $APP_ROOT/shared/app.env up -d --build --remove-orphans
ExecStop=/usr/bin/docker compose --env-file $APP_ROOT/shared/app.env stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SERVICE

  cat > /usr/local/sbin/anhedral-deploy <<DEPLOY
#!/usr/bin/env bash
set -Eeuo pipefail
if [ "\$#" -ne 1 ] || [ "\$(id -u)" -ne 0 ]; then
  echo "Usage: sudo anhedral-deploy /absolute/path/to/release" >&2
  exit 64
fi
RELEASE="\$(realpath "\$1")"
case "\$RELEASE" in
  $APP_ROOT/releases/*) ;;
  *) echo "Release must be below $APP_ROOT/releases." >&2; exit 64 ;;
esac
test -f "\$RELEASE/compose.yaml"
test -f "$APP_ROOT/shared/app.env"
/usr/bin/docker compose --project-directory "\$RELEASE" --env-file "$APP_ROOT/shared/app.env" config --quiet
ln -sfn "\$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
systemctl daemon-reload
systemctl enable --now anhedral-app.service
systemctl reload-or-restart anhedral-app.service
/usr/bin/docker compose --project-directory "$APP_ROOT/current" ps
DEPLOY
  chmod 0755 /usr/local/sbin/anhedral-deploy
  touch "$APP_ROOT/shared/app.env"
  chmod 0600 "$APP_ROOT/shared/app.env"
  chown "$ADMIN_USER:$ADMIN_USER" "$APP_ROOT/shared/app.env"
  systemctl daemon-reload
fi

if [ "$INSTALL_NGINX" = 1 ]; then
  apt-get install -y nginx
  SERVER_NAME="\${DOMAIN:-_}"
  cat > "/etc/nginx/sites-available/$PROJECT_NAME" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;
    server_tokens off;
    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
}
NGINX
  ln -sfn "/etc/nginx/sites-available/$PROJECT_NAME" "/etc/nginx/sites-enabled/$PROJECT_NAME"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
fi

if [ "$INSTALL_CERTBOT" = 1 ]; then
  apt-get install -y certbot python3-certbot-nginx
  if [ "$ENABLE_TLS" = 1 ]; then
    getent ahosts "$DOMAIN" >/dev/null
    certbot --nginx --non-interactive --agree-tos --redirect --email "$EMAIL" -d "$DOMAIN"
    certbot renew --dry-run
  else
    echo "Certbot installed; set ANHEDRAL_ENABLE_TLS=1 with a verified domain and email to issue a certificate."
  fi
fi

systemctl --failed --no-legend || true
ss -lntup
echo
echo "VPS baseline complete. Open a second SSH session as $ADMIN_USER before closing this one."
echo "Place releases below $APP_ROOT/releases and activate with: sudo anhedral-deploy /absolute/path/to/release"
`;
}

export function scaffoldInfrastructure(root: string, options: ProjectOptions): void {
  writeFile(path.join(root, 'deploy', 'anhedral-provision.json'), generatedPlan(options));
  writeFile(path.join(root, 'deploy', 'README.md'), generatedReadme(options));
  writeFile(path.join(root, 'deploy', 'vps', 'setup.sh'), generatedVpsSetup(options));
  writeFile(path.join(root, 'scripts', 'provision-plan.mjs'), PLAN_READER);
}
