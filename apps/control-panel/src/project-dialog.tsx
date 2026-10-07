import { useState, type FormEvent } from "react";
import type { Controller } from "./use-control-panel.js";
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

export function ProjectDialog({
  setAdding,
  addProject,
  request,
  busy,
  notice,
}: Controller) {
  const [mode, setMode] = useState("new");
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError("");
      const form = new FormData(event.currentTarget);
      if (
        await request(
          `Use Anhedral to build this app: ${form.get("brief")}. Infer the app name and only the stack it needs. Establish an unused target folder within the user's selected workspace; if the workspace is unavailable, ask for its location. Create the plan with anhedral_create_project and map it with anhedral_update_architecture before generating code. Discover callable tools and verify the intended provider accounts separately from installed plugins or local credentials. Use the Anhedral npm package to dry-run and initialize only the new empty target. Reuse or provision selected resources through available provider tools, implement and test the product, and keep anhedral_report_project_progress and the architecture current with non-secret evidence and preview links. Respect existing approvals. Do not publish or deploy production without authorization.`,
        )
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
              ? "Describe your app. Codex assembles the stack."
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
                <Label htmlFor="project-brief">What are you building?</Label>
                <Textarea
                  id="project-brief"
                  name="brief"
                  required
                  maxLength={2000}
                  rows={5}
                  placeholder="I want an app where people can…"
                />
              </div>
            </>
          )}
          {mode === "existing" && (
            <div className="form-field">
              <Label htmlFor="project-folder">Existing project folder</Label>
              <Input
                id="project-folder"
                name="folder"
                required
                placeholder="/absolute/path/to/project"
              />
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Sending…"
              : mode === "new"
                ? "Build with Codex"
                : "Connect project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
