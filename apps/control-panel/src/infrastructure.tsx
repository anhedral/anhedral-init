import type { Snapshot, Project } from "../server/status.js";
import { Icon, Badge, Empty } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  resources: FullSnapshot["resources"];
  verified: number;
  query: string;
  setQuery: (value: string) => void;
  navigateProvider: (value: string) => void;
  request: (text: string) => Promise<boolean>;
  context: string;
};
export function Infrastructure({
  resources,
  verified,
  query,
  setQuery,
  navigateProvider,
  request,
  context,
}: Props) {
  const normalized = query.trim().toLowerCase();
  const matches = resources.filter((resource) =>
    `${resource.name} ${resource.kind} ${resource.provider}`
      .toLowerCase()
      .includes(normalized),
  );
  return (
    <>
      <div className="section-toolbar">
        <span>
          {resources.length} mapped · {verified} provider-verified ·{" "}
          {
            resources.filter(
              (resource) =>
                resource.status === "error" || resource.status === "missing",
            ).length
          }{" "}
          need attention
        </span>
        <input
          aria-label="Search infrastructure"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search resources…"
        />
      </div>
      {!!matches.length && (
        <div className="resource-list">
          {matches.map((resource) => (
            <details key={resource.id} className="resource-row">
              <summary>
                <Icon name="infrastructure" />
                <div>
                  <strong>{resource.name}</strong>
                  <span>
                    {resource.provider} / {resource.kind}
                  </span>
                </div>
                <Badge status={resource.status} />
              </summary>
              <div className="resource-detail">
                <p>{resource.detail}</p>
                <div className="card-actions">
                  <button
                    className="text-button"
                    onClick={() => navigateProvider(resource.dashboard)}
                  >
                    Provider dashboard <Icon name="arrow" />
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      request(
                        `${context} Investigate and verify the ${resource.kind} resource ${resource.name}. Confirm the intended account before provider actions and update the lifecycle evidence.`,
                      )
                    }
                  >
                    Investigate with Anhedral →
                  </button>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
      {resources.length > 0 && !matches.length && (
        <Empty title="No matching resources">
          Try another resource name, service, or provider.
        </Empty>
      )}
      {!resources.length && (
        <Empty title="Infrastructure is not mapped yet">
          Selected resources appear here as Anhedral provisions them and updates
          project configuration. Each environment is checked separately.
        </Empty>
      )}
    </>
  );
}
