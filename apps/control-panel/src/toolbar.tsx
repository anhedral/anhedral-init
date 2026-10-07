import { Button } from "./components/ui/button.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select.js";
import { Label } from "./components/ui/label.js";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb.js";
import { Spinner } from "./components/ui/spinner.js";
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
      <Breadcrumb className="breadcrumbs">
        <BreadcrumbList>
          <BreadcrumbItem>Anhedral</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{tab}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="top-actions">
        <Label className="sr-only" htmlFor="environment">
          Environment
        </Label>
        <NativeSelect
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
            <NativeSelectOption key={name} value={name}>
              {name === "default" ? "Default environment" : name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={busy || !project}
          onClick={() =>
            action("anhedral_open", {
              projectId: project?.id,
              environment,
              refresh: true,
            })
          }
        >
          {busy ? <Spinner /> : <Icon name="refresh" />}
          {busy ? "Checking…" : "Refresh"}
        </Button>
      </div>
    </header>
  );
}
