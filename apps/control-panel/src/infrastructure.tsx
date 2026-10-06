import type { Snapshot, Project } from "../server/status.js";
import { Icon, Badge, Empty } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  resources: FullSnapshot["resources"];
  verified: number;
  query: string;
  setQuery: (value: string) => void;
  navigateProvider: (value: string) => void;
  request: (text: string) => Promise<void>;
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
          {resources.length} resources · {verified} verified
        </span>
        <input
          aria-label="Search infrastructure"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search resources…"
        />
      </div>
      <div className="resource-grid">
        {matches.map((resource) => (
          <section className="resource-card" key={resource.id}>
            <div className="resource-card-top">
              <span className="service-icon">
                <Icon name="infrastructure" />
              </span>
              <Badge status={resource.status} />
            </div>
            <small>
              {resource.provider} / {resource.kind}
            </small>
            <h2>{resource.name}</h2>
            <p>{resource.detail}</p>
            <div className="card-actions">
              <button
                className="text-button"
                onClick={() => navigateProvider(resource.dashboard)}
              >
                Dashboard <Icon name="arrow" />
              </button>
              <button
                className="text-button"
                onClick={() =>
                  request(
                    `${context} Investigate and verify the ${resource.kind} resource ${resource.name}. Confirm the intended account before provider actions.`,
                  )
                }
              >
                Investigate →
              </button>
            </div>
          </section>
        ))}
      </div>
      {resources.length > 0 && matches.length === 0 && (
        <Empty title="No matching resources">
          Try another resource name, service, or provider.
        </Empty>
      )}
      {!resources.length && (
        <Empty title="No resources mapped for this environment">
          Add environment-specific Wrangler configuration. Default resources are
          not assumed to exist in another environment.
        </Empty>
      )}
    </>
  );
}
