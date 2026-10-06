import { ProjectDialog } from "./project-dialog.js";
import { Sidebar } from "./sidebar.js";
import { Toolbar } from "./toolbar.js";
import { PageHeading } from "./pageheading.js";
import { Overview } from "./overview.js";
import { Infrastructure } from "./infrastructure.js";
import { Readiness } from "./readiness.js";
import { Delivery } from "./delivery.js";
import { Settings } from "./settings.js";
import { Icon, Empty } from "./components.js";
import { useControlPanel } from "./use-control-panel.js";
import { createRoot } from "react-dom/client";

import "./styles.css";

function Dashboard() {
  const controller = useControlPanel();
  const {
    data,
    tab,
    busy,
    notice,
    query,
    adding,
    setTab,
    setNotice,
    setQuery,
    setAdding,
    request,
    project,
    environment,
    resources,
    capabilities,
    readiness,
    settings,
    connections,
    delivery,
    failed,
    verified,
    context,
    navigateProvider,
    saveSettings,
  } = controller;
  return (
    <div className="app">
      <Sidebar {...controller} />
      <div className="workspace">
        <Toolbar {...controller} />
        <main aria-busy={busy}>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <PageHeading {...controller} />
          {!data && (
            <Empty title="Connecting to Anhedral">
              Loading your project workspace…
            </Empty>
          )}
          {data && !project && (
            <Empty title="Connect your first project">
              Add an existing project folder to map its stack, infrastructure,
              and setup requirements.
              <br />
              <button
                className="button primary"
                onClick={() => setAdding(true)}
              >
                Add a project <Icon name="plus" />
              </button>
            </Empty>
          )}
          {project && (
            <>
              {tab === "Overview" && (
                <Overview
                  resources={resources}
                  verified={verified}
                  failed={failed}
                  readiness={readiness!}
                  connections={connections}
                  setTab={setTab}
                />
              )}
              {tab === "Infrastructure" && (
                <Infrastructure
                  resources={resources}
                  verified={verified}
                  query={query}
                  setQuery={setQuery}
                  navigateProvider={navigateProvider}
                  request={request}
                  context={context}
                />
              )}
              {tab === "Readiness" && (
                <Readiness
                  readiness={readiness!}
                  capabilities={capabilities}
                  request={request}
                  context={context}
                />
              )}
              {tab === "Delivery" && (
                <Delivery
                  delivery={delivery!}
                  navigateProvider={navigateProvider}
                  request={request}
                  context={context}
                />
              )}
              {tab === "Settings" && (
                <Settings
                  project={project}
                  environment={environment}
                  data={data}
                  saveSettings={saveSettings}
                  settings={settings!}
                  busy={busy}
                  request={request}
                  context={context}
                />
              )}
              <footer className="workspace-footer">
                <span>
                  Checked{" "}
                  {data && new Date(data.checkedAt).toLocaleTimeString()} ·{" "}
                  {environment} environment
                </span>
                <span>Availability is separate from product readiness</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {adding && <ProjectDialog {...controller} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Dashboard />);
