import type { Controller } from "./use-control-panel.js";
import { Icon } from "./components.js";
import logo from "../../../assets/anhedral.svg";
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
      <div className="brand">
        <img src={`data:image/svg+xml,${encodeURIComponent(logo)}`} alt="" />
        <div>
          Anhedral<span>Developer control panel</span>
        </div>
      </div>
      <div className="workspace-label">WORKSPACE</div>
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
        Add project
      </button>
      <nav aria-label="Control panel">
        {[
          "Overview",
          "Infrastructure",
          "Readiness",
          "Delivery",
          "Settings",
        ].map((item) => (
          <button
            aria-current={tab === item ? "page" : undefined}
            className={tab === item ? "active" : ""}
            key={item}
            onClick={() => setTab(item)}
          >
            <Icon name={item.toLowerCase()} />
            {item}
            {item === "Readiness" && failed.length > 0 && (
              <span className="nav-count">{failed.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="live-dot" />
        Local runtime<span>Credentials stay server-side</span>
      </div>
    </aside>
  );
}
