import type { Controller } from "./use-control-panel.js";
import { Icon } from "./components.js";
export function Toolbar({
  data,
  tab,
  busy,
  action,
  project,
  environment,
}: Controller) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        Anhedral <span>/</span> {tab}
      </div>
      <div className="top-actions">
        <label className="sr-only" htmlFor="environment">
          Environment
        </label>
        <select
          id="environment"
          disabled={busy || !project}
          value={environment}
          onChange={(event) =>
            action("anhedral_open", {
              projectId: project?.id,
              environment: event.target.value,
            })
          }
        >
          {[
            ...new Set([
              "default",
              "development",
              "preview",
              "production",
              ...(data && "environments" in data
                ? data.environments || []
                : []),
            ]),
          ].map((name) => (
            <option key={name} value={name}>
              {name === "default" ? "Default environment" : name}
            </option>
          ))}
        </select>
        <button
          className="button"
          disabled={busy || !project}
          onClick={() =>
            action("anhedral_open", {
              projectId: project?.id,
              environment,
              refresh: true,
            })
          }
        >
          <span className={busy ? "spinning" : ""}>
            <Icon name="refresh" />
          </span>
          {busy ? "Checking…" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
