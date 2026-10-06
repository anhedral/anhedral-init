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
  request: (text: string) => Promise<void>;
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
          <label>
            Cloudflare account ID
            <input
              name="cloudflareAccountId"
              defaultValue={settings?.cloudflareAccountId || ""}
              placeholder="32-character account ID"
              pattern="[a-f0-9]{32}"
            />
          </label>
          <label>
            Neon project ID
            <input
              name="neonProjectId"
              defaultValue={settings?.neonProjectId || ""}
              placeholder="Project identifier"
              pattern="[a-zA-Z0-9_-]{1,100}"
            />
          </label>
          <label>
            GitHub repository
            <input
              name="repository"
              defaultValue={settings?.repository || ""}
              placeholder="owner/repository"
              pattern="[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Save settings
          </button>
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
          <button
            className="button"
            onClick={() =>
              request(
                `${context} Help configure the recommended provider plugins and scoped read access for the Anhedral control panel. Do not put credential values into chat, source files, or project settings.`,
              )
            }
          >
            Set up developer access <Icon name="arrow" />
          </button>
        </div>
      </Panel>
      <div className="project-path">
        <span>Registered project</span>
        <code>{project.root}</code>
      </div>
    </>
  );
}
