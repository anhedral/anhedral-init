import { SidebarProvider } from "./components/ui/sidebar.js";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "./disclosure.js";
import { ProjectDialog } from "./project-dialog.js";
import { Sidebar } from "./sidebar.js";
import { Toolbar } from "./toolbar.js";
import { PageHeading } from "./pageheading.js";
import { Infrastructure } from "./infrastructure.js";
import { Readiness } from "./readiness.js";
import { Delivery } from "./delivery.js";
import { Settings } from "./settings.js";
import { Empty } from "./components.js";
import { NextAction, Checklist, SelectedStack } from "./lifecycle.js";
import { useControlPanel } from "./use-control-panel.js";
import { createRoot } from "react-dom/client";
import "./styles.css";

function Dashboard() {
  const controller = useControlPanel();
  const {
    data,
    project,
    tab,
    busy,
    notice,
    setNotice,
    setAdding,
    adding,
    readiness,
    capabilities,
    request,
    context,
    delivery,
    navigateProvider,
    environment,
    settings,
    saveSettings,
  } = controller;
  return (
    <SidebarProvider className="app">
      <Sidebar {...controller} />
      <div className="workspace">
        <Toolbar {...controller} />
        <main aria-busy={busy}>
          {notice && (
            <Alert className="notice" role="status">
              <AlertDescription>{notice}</AlertDescription>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </Button>
            </Alert>
          )}
          <PageHeading {...controller} />
          {!data && (
            <Empty title="Connecting to Anhedral">
              Loading your project workspace…
            </Empty>
          )}
          {data && !project && (
            <Empty title="What are you building?">
              Create an application or connect existing code. Choose the needed
              stack, then work through setup and delivery with Anhedral.
              <br />
              <Button onClick={() => setAdding(true)}>Start a project</Button>
            </Empty>
          )}
          {project && (
            <>
              {(tab === "Infrastructure" || tab === "Checklist") && (
                <NextAction {...controller} />
              )}
              {tab === "Infrastructure" && (
                <>
                  <SelectedStack {...controller} />
                  <section className="infrastructure-section">
                    <h2>Infrastructure status</h2>
                    <p className="muted-copy">
                      Configuration and live provider checks. Refresh to verify
                      resource availability; checklist evidence records product
                      verification separately.
                    </p>
                    <Infrastructure {...controller} />
                    <Disclosure className="provider-access">
                      <DisclosureTrigger>
                        <strong>Developer access</strong>
                        <span>
                          Selected provider credentials in this runtime
                        </span>
                      </DisclosureTrigger>
                      <DisclosureContent>
                        <div>
                          {controller.connections.map((connection) => (
                            <div
                              className="connection-row"
                              key={connection.name}
                            >
                              <strong>{connection.name}</strong>
                              <span>
                                {connection.available
                                  ? "Credential available · scope not verified"
                                  : "Not configured in this runtime"}
                              </span>
                            </div>
                          ))}
                          <p className="muted-copy">
                            Provider plugins may have separate authorization.
                            Credential presence does not prove account access.
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => controller.continueStep("accounts")}
                          >
                            Set up access with Anhedral
                          </Button>
                        </div>
                      </DisclosureContent>
                    </Disclosure>
                  </section>
                  <div className="workflow-link">
                    <span>From accounts to a verified release</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => controller.setTab("Checklist")}
                    >
                      View the full checklist →
                    </Button>
                  </div>
                </>
              )}
              {tab === "Checklist" && <Checklist {...controller} />}
              {tab === "Checks" &&
                (readiness ? (
                  <Readiness
                    readiness={readiness}
                    capabilities={capabilities}
                    request={request}
                    context={context}
                  />
                ) : (
                  <Empty title="Code has not been initialized">
                    Work through the checklist to create the project before
                    running code checks.
                  </Empty>
                ))}
              {tab === "Delivery" && delivery && (
                <Delivery
                  delivery={delivery}
                  navigateProvider={navigateProvider}
                  request={request}
                  context={context}
                />
              )}
              {tab === "Settings" && settings && (
                <Settings
                  project={project}
                  environment={environment}
                  data={data}
                  saveSettings={saveSettings}
                  settings={settings}
                  busy={busy}
                  request={request}
                  context={context}
                />
              )}
              <footer className="workspace-footer">
                <span>
                  Updated{" "}
                  {data && new Date(data.checkedAt).toLocaleTimeString()} ·{" "}
                  {environment}
                </span>
                <span>Client-owned · Credentials stay server-side</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {adding && <ProjectDialog {...controller} />}
    </SidebarProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Dashboard />);
