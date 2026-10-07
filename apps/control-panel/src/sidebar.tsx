import type { Controller } from "./use-control-panel.js";
import { Icon } from "./components.js";
import { Button } from "./components/ui/button.js";
import { Label } from "./components/ui/label.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select.js";
import {
  Sidebar as ShadcnSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "./components/ui/sidebar.js";
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
    <ShadcnSidebar collapsible="none" className="sidebar">
      <SidebarHeader className="p-0">
        <div className="brand" aria-label="Anhedral">
          <span
            className="brand-mark"
            aria-hidden="true"
            style={{
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(logo)}")`,
            }}
          />
          <span className="brand-divider" aria-hidden="true" />
          <span
            className="brand-wordmark"
            aria-hidden="true"
            style={{
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(wordmark)}")`,
            }}
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-4">
        <SidebarGroup className="px-0">
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <Label className="sr-only" htmlFor="project">
            Project
          </Label>
          <NativeSelect
            id="project"
            className="w-full"
            value={project?.id || ""}
            disabled={busy || !data?.projects.length}
            onChange={(event) =>
              action("anhedral_open", {
                projectId: event.target.value,
                environment: "default",
              })
            }
          >
            {!data?.projects.length && (
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
            className="mt-2 justify-start"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" />
            Start project
          </Button>
        </SidebarGroup>
        <nav aria-label="Control panel">
          <SidebarMenu>
            {[
              "Infrastructure",
              "Checklist",
              "Checks",
              "Delivery",
              "Settings",
            ].map((item) => (
              <SidebarMenuItem key={item}>
                <SidebarMenuButton
                  isActive={tab === item}
                  aria-current={tab === item ? "page" : undefined}
                  onClick={() => setTab(item)}
                >
                  <Icon name={item.toLowerCase()} />
                  <span>{item}</span>
                </SidebarMenuButton>
                {item === "Checks" && failed.length > 0 && (
                  <SidebarMenuBadge>{failed.length}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="sidebar-footer p-0">
        <div>
          <span className="live-dot" /> Local runtime
        </div>
        <span>Credentials stay server-side</span>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
