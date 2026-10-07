import { BuildProgress } from "./build-progress.js";
import logo from "../../../assets/images/svg/logo-white-subtract.svg";
import wordmark from "../../../assets/images/svg/anhedral-wordmark.svg";
import { createRoot } from "react-dom/client";
import { Plus, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select.js";
import { Spinner } from "./components/ui/spinner.js";
import { Empty } from "./components.js";
import { ProjectDialog } from "./project-dialog.js";
import { ArchitectureView } from "./architecture.js";
import { useControlPanel } from "./use-control-panel.js";
import "./styles.css";

function Dashboard() {
  const controller = useControlPanel();
  const {
    data,
    project,
    environment,
    busy,
    action,
    notice,
    setNotice,
    adding,
    setAdding,
    request,
    context,
  } = controller;
  return (
    <div className="architecture-app">
      <header className="architecture-header">
        <div className="architecture-brand" aria-label="Anhedral">
          <span
            className="brand-mark"
            style={{
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(logo)}")`,
            }}
          />
          <span
            className="brand-wordmark"
            style={{
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(wordmark)}")`,
            }}
          />
        </div>
        <NativeSelect
          aria-label="Project"
          value={project?.id || ""}
          disabled={busy || !data?.projects.length}
          onChange={(event) =>
            action("anhedral_open", { projectId: event.target.value })
          }
        >
          {!project && (
            <NativeSelectOption value="">Choose a project</NativeSelectOption>
          )}
          {data?.projects.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Start a project"
          onClick={() => setAdding(true)}
        >
          <Plus />
        </Button>
        <div className="architecture-header-end">
          {project && (
            <NativeSelect
              aria-label="Environment"
              value={environment}
              disabled={busy}
              onChange={(event) =>
                action("anhedral_open", {
                  projectId: project.id,
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
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy || !project}
            aria-label="Refresh status"
            onClick={() =>
              action("anhedral_open", {
                projectId: project?.id,
                environment,
                refresh: true,
              })
            }
          >
            {busy ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </header>
      <main className="architecture-main" aria-busy={busy}>
        {notice && (
          <Alert role="status" className="architecture-notice">
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
        {!data ? (
          <Empty title="Connecting…">Loading your architecture</Empty>
        ) : !project ? (
          <Empty title="What are you building?">
            Describe your app to Codex. Watch it take shape here.
            <br />
            <Button onClick={() => setAdding(true)}>
              Start a project <Plus />
            </Button>
          </Empty>
        ) : (
          <>
            <div className="architecture-heading">
              <div>
                <h1>Your app, connected.</h1>
                <p>Architecture as it takes shape.</p>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  request(
                    `${context} Continue building the app from its actual state. Manage setup and implementation using the stack standard, and keep its architecture diagram and shared progress current with anhedral_update_architecture and anhedral_report_project_progress. Recheck stale discovery, source and provider evidence before resuming, reuse existing resource references, and include preview/live URLs after actual delivery. Inspect existing code and preserve work. Respect current approvals; do not ship without authorization.`,
                  )
                }
              >
                Continue with Codex
              </Button>
            </div>
            <BuildProgress {...controller} />
            <ArchitectureView {...controller} />
          </>
        )}
      </main>
      {adding && <ProjectDialog {...controller} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Dashboard />);
