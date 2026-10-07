import type { Snapshot, Project } from "../server/status.js";
import { Icon, Badge, Panel, Empty } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  readiness: FullSnapshot["readiness"];
  capabilities: FullSnapshot["capabilities"];
  request: (text: string) => Promise<boolean>;
  context: string;
};
export function Readiness({
  readiness,
  capabilities,
  request,
  context,
}: Props) {
  return (
    <>
      <Panel
        title="Local foundation"
        description="Read-only checks of the registered project"
      >
        {readiness?.checks.map((check) => (
          <div className="check-row" key={check.id}>
            <span className={check.ok ? "check-pass" : "attention-dot"}>
              {check.ok ? "✓" : ""}
            </span>
            <div>
              <strong>{check.id.replaceAll("-", " ")}</strong>
              <p>{check.detail}</p>
            </div>
            <Badge status={check.ok ? "verified" : "missing"} />
          </div>
        ))}
      </Panel>
      <Panel
        title="Stack requirements"
        description="Source scaffolding does not prove provider setup or product readiness"
      >
        {capabilities.map((capability) => (
          <details key={capability.id}>
            <summary>
              <div>
                <strong>{capability.id}</strong>
                <span>{capability.purpose}</span>
              </div>
              <Badge status="unverified" />
            </summary>
            <div className="requirements">
              {(
                [
                  "tools",
                  "access",
                  "credentials",
                  "resources",
                  "verify",
                ] as const
              ).map((field) => (
                <div key={field}>
                  <h3>{field === "verify" ? "Verification" : field}</h3>
                  {capability[field].length ? (
                    <ul>
                      {capability[field].map((value) => (
                        <li key={value}>{value}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional requirements listed.</p>
                  )}
                </div>
              ))}
              <button
                className="button"
                onClick={() =>
                  request(
                    `${context} Help me complete the ${capability.id} setup requirements and verify its actual behavior.`,
                  )
                }
              >
                Resolve with Anhedral <Icon name="arrow" />
              </button>
            </div>
          </details>
        ))}
        {!capabilities.length && (
          <Empty title="No stack selection recorded">
            This project has no supported Anhedral standard manifest. Inspect
            the existing app before changing its architecture.
          </Empty>
        )}
      </Panel>
    </>
  );
}
