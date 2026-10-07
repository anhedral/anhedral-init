import type { Controller } from "./use-control-panel.js";
import { Icon } from "./components.js";
import logo from "../../../assets/images/svg/logo-white-subtract.svg";
import wordmark from "../../../assets/images/svg/anhedral-wordmark.svg";
export function Sidebar({
  data,
  tab,
  busy,
  setTab,
  setAdding,
  action,
  project,
  failed,
}: Controller) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="Anhedral">
        <span
          className="brand-mark"
          aria-hidden="true"
          style={{
            maskImage: `url("data:image/svg+xml,${encodeURIComponent(logo)}")`,
          }}
        />
        <span className="brand-divider" aria-hidden="true" />
        <div>
          <span
            className="brand-wordmark"
            aria-hidden="true"
            style={{
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(wordmark)}")`,
            }}
          />
        </div>
      </div>
      <div className="workspace-label">Workspace</div>
      <label className="sr-only" htmlFor="project">
        Project
      </label>
      <select
        id="project"
        value={project?.id || ""}
        disabled={busy || !data?.projects.length}
        onChange={(event) =>
          action("anhedral_open", {
            projectId: event.target.value,
            environment: "default",
          })
        }
      >
        {!data?.projects.length && <option value="">Choose a project</option>}
        {data?.projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button className="add-project" onClick={() => setAdding(true)}>
        <Icon name="plus" />
        Start project
      </button>
      <nav aria-label="Control panel">
        {["Infrastructure", "Checklist", "Checks", "Delivery", "Settings"].map(
          (item) => (
            <button
              aria-current={tab === item ? "page" : undefined}
              className={tab === item ? "active" : ""}
              key={item}
              onClick={() => setTab(item)}
            >
              <Icon name={item.toLowerCase()} />
              {item}
              {item === "Checks" && failed.length > 0 && (
                <span className="nav-count">{failed.length}</span>
              )}
            </button>
          ),
        )}
      </nav>
      <div className="sidebar-footer">
        <span className="live-dot" />
        Local runtime<span>Credentials stay server-side</span>
      </div>
    </aside>
  );
}
