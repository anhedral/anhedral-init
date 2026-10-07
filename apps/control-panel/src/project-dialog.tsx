import { useState, type FormEvent } from "react";
import type { Controller } from "./use-control-panel.js";
import { StackChoices } from "./stack-editor.js";
import { validatePlan } from "../shared/assembly.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Textarea } from "./components/ui/textarea.js";
import { Label } from "./components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog.js";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs.js";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "./disclosure.js";

export function ProjectDialog({
  setAdding,
  addProject,
  action,
  busy,
  notice,
}: Controller) {
  const [mode, setMode] = useState("new");
  const [selected, setSelected] = useState(["next"]);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      validatePlan(selected, "cloudflare");
      setError("");
      const form = new FormData(event.currentTarget);
      if (
        await action("anhedral_create_project", {
          name: form.get("name"),
          folder: form.get("folder"),
          brief: form.get("brief"),
          selected,
          hosting: "cloudflare",
        })
      )
        setAdding(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Review the project plan.",
      );
    }
  }
  return (
    <Dialog open onOpenChange={setAdding}>
      <DialogContent className="project-wizard max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-xl p-6">
        <DialogHeader>
          <DialogTitle>Start a project</DialogTitle>
          <DialogDescription>
            {mode === "new"
              ? "Describe the app and select its starting pieces. Anhedral guides setup before creating code."
              : "Connect a local folder. Anhedral inspects the project and preserves existing code."}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(String(value));
            setError("");
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="new">Create new</TabsTrigger>
            <TabsTrigger value="existing">Build on existing</TabsTrigger>
          </TabsList>
        </Tabs>
        {(notice || error) && (
          <Alert variant="destructive">
            <AlertDescription>{error || notice}</AlertDescription>
          </Alert>
        )}
        <form
          className="project-form"
          onSubmit={mode === "new" ? create : addProject}
        >
          {mode === "new" && (
            <>
              <div className="form-field">
                <Label htmlFor="new-project-name">Project name</Label>
                <Input
                  id="new-project-name"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="My application"
                />
              </div>
              <div className="form-field">
                <Label htmlFor="project-brief">What are you building?</Label>
                <Textarea
                  id="project-brief"
                  name="brief"
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder="Users, workflows and what the app needs to do"
                />
              </div>
            </>
          )}
          <div className="form-field">
            <Label htmlFor="project-folder">
              {mode === "new"
                ? "New project folder"
                : "Existing project folder"}
            </Label>
            <Input
              id="project-folder"
              name="folder"
              required
              placeholder="/absolute/path/to/project"
            />
          </div>
          {mode === "new" && (
            <Disclosure>
              <DisclosureTrigger>
                <strong>Starting stack</strong>
                <span>{selected.length} selected · customize</span>
              </DisclosureTrigger>
              <DisclosureContent>
                <StackChoices selected={selected} setSelected={setSelected} />
              </DisclosureContent>
            </Disclosure>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : mode === "new"
                ? "Create project plan"
                : "Connect project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
