import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Label } from "./components/ui/label.js";
import type { Snapshot, Project } from "../server/status.js";
import type { FormEvent } from "react";
import { Icon, Panel } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  project: Project;
  environment: string;
  data: Snapshot | undefined;
  saveSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  settings: FullSnapshot["settings"];
  busy: boolean;
  request: (text: string) => Promise<boolean>;
  context: string;
};
export function Settings({
  project,
  environment,
  data,
  saveSettings,
  settings,
  busy,
  request,
  context,
}: Props) {
  return (
    <>
      <Panel
        title="Project connections"
        description="Store resource identifiers for this environment. Credential values are never stored here."
      >
        <form
          key={`${project.id}:${environment}:${data?.checkedAt}`}
          onSubmit={saveSettings}
          className="settings-form"
        >
          <Label>
            Cloudflare account ID
            <Input
              name="cloudflareAccountId"
              defaultValue={settings?.cloudflareAccountId || ""}
              placeholder="32-character account ID"
              pattern="[a-f0-9]{32}"
            />
          </Label>
          <Label>
            Neon project ID
            <Input
              name="neonProjectId"
              defaultValue={settings?.neonProjectId || ""}
              placeholder="Project identifier"
              pattern="[a-zA-Z0-9_-]{1,100}"
            />
          </Label>
          <Label>
            GitHub repository
            <Input
              name="repository"
              defaultValue={settings?.repository || ""}
              placeholder="owner/repository"
              pattern="[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"
            />
          </Label>
          <Button type="submit" disabled={busy}>
            Save settings
          </Button>
        </form>
      </Panel>
      <Panel
        title="Provider access"
        description="Read-only provider checks run through the local MCP server."
      >
        <div className="settings-copy">
          <p>
            Cloudflare checks use <code>CLOUDFLARE_API_TOKEN</code>. Neon uses{" "}
            <code>NEON_API_KEY</code>. Private GitHub repositories use{" "}
            <code>GITHUB_TOKEN</code> or <code>GH_TOKEN</code>. Pass these to
            the MCP runtime through your host’s secure configuration.
          </p>
          <p>
            Installing another provider plugin does not automatically grant this
            server its credentials. Use scoped credentials in the intended
            client account.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              request(
                `${context} Help configure the recommended provider plugins and scoped read access for the Anhedral control panel. Do not put credential values into chat, source files, or project settings.`,
              )
            }
          >
            Set up developer access <Icon name="arrow" />
          </Button>
        </div>
      </Panel>
      <div className="project-path">
        <span>Registered project</span>
        <code>{project.root}</code>
      </div>
    </>
  );
}
