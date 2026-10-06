import type { Snapshot, Project } from "../server/status.js";
import { Icon, Badge, Panel, Empty } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  resources: FullSnapshot["resources"];
  verified: number;
  failed: FullSnapshot["readiness"]["checks"];
  readiness: FullSnapshot["readiness"];
  connections: FullSnapshot["connections"];
  setTab: (value: string) => void;
};
export function Overview({
  resources,
  verified,
  failed,
  readiness,
  connections,
  setTab,
}: Props) {
  return (
    <>
      <div className="stats">
        <div>
          <span>Mapped resources</span>
          <strong>{resources.length}</strong>
          <small>From this environment’s configuration</small>
        </div>
        <div>
          <span>Provider-verified</span>
          <strong>
            {verified}
            <em> / {resources.length}</em>
          </strong>
          <small>API checks confirm resource availability</small>
        </div>
        <div>
          <span>Local setup gaps</span>
          <strong>{failed.length}</strong>
          <small>
            {readiness?.localReady
              ? "Local foundation checks pass"
              : "Requirements need attention"}
          </small>
        </div>
      </div>
      <div className="status-banner">
        <span className="status-ring">
          <Icon name="readiness" />
        </span>
        <div>
          <h3>
            {verified
              ? "Infrastructure checks are available."
              : "Configuration mapped. Verification comes next."}
          </h3>
          <p>
            {verified
              ? "Review each resource and complete product-level testing before release."
              : "Refresh with provider access to verify resources. Configured bindings do not prove deployment."}
          </p>
        </div>
        <button className="text-button" onClick={() => setTab("Readiness")}>
          Review readiness →
        </button>
      </div>
      <div className="overview-grid">
        <Panel
          title="Infrastructure"
          description="Resources discovered in this project"
        >
          <div className="resource-preview">
            {resources.slice(0, 5).map((resource) => (
              <div className="compact-row" key={resource.id}>
                <span className="service-icon">
                  <Icon name="infrastructure" />
                </span>
                <div>
                  <strong>{resource.name}</strong>
                  <small>
                    {resource.provider} · {resource.kind}
                  </small>
                </div>
                <Badge status={resource.status} />
              </div>
            ))}
            {!resources.length && (
              <Empty title="No resources mapped">
                Select the right environment or add Wrangler configuration.
              </Empty>
            )}
          </div>
          <button
            className="panel-link"
            onClick={() => setTab("Infrastructure")}
          >
            View all infrastructure <span>→</span>
          </button>
        </Panel>
        <Panel
          title="Developer access"
          description="Credential availability in the local runtime"
        >
          {connections.map((connection) => (
            <div className="connection-row" key={connection.name}>
              <div className="provider-mark">{connection.name.slice(0, 1)}</div>
              <div>
                <strong>{connection.name}</strong>
                <small>
                  {connection.available
                    ? "Credential available to server"
                    : connection.name === "GitHub"
                      ? "Public repository access available"
                      : "Provider credential not configured"}
                </small>
              </div>
              <Badge
                status={
                  connection.available
                    ? "configured"
                    : connection.name === "GitHub"
                      ? "unverified"
                      : "missing"
                }
              />
            </div>
          ))}
          <button className="panel-link" onClick={() => setTab("Settings")}>
            Manage connections <span>→</span>
          </button>
        </Panel>
      </div>
      <Panel
        title="What needs attention"
        description="A clear next step for your development workflow"
      >
        {failed.slice(0, 3).map((check) => (
          <div className="attention-row" key={check.id}>
            <span className="attention-dot" />
            <div>
              <strong>{check.id.replaceAll("-", " ")}</strong>
              <p>{check.detail}</p>
            </div>
          </div>
        ))}
        <div className="attention-row">
          <span className="attention-dot" />
          <div>
            <strong>Product and release verification</strong>
            <p>
              Authentication, permissions, runtime flows, and production
              delivery need their own evidence.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
