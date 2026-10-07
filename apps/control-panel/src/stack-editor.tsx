import { Button } from "./components/ui/button.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Label } from "./components/ui/label.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select.js";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "./disclosure.js";
import { useState, useId } from "react";
import { CATALOG, validatePlan } from "../shared/assembly.js";
import type { Controller } from "./use-control-panel.js";

export function StackChoices({
  selected,
  setSelected,
}: {
  selected: string[];
  setSelected: (value: string[]) => void;
}) {
  const prefix = useId();
  return (
    <div className="stack-choices">
      {[...new Set(CATALOG.map((item) => item.group))].map((group) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {CATALOG.filter((item) => item.group === group).map((item) => (
            <Label
              key={item.id}
              htmlFor={`${prefix}-${item.id}`}
              className={selected.includes(item.id) ? "selected" : ""}
            >
              <Checkbox
                id={`${prefix}-${item.id}`}
                checked={selected.includes(item.id)}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              <span>
                <strong>
                  {item.id === "next"
                    ? "Next.js"
                    : item.id === "neon"
                      ? "Neon + Hyperdrive"
                      : item.id}
                </strong>
                <small>{item.purpose}</small>
              </span>
            </Label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
export function StackEditor({
  assembly,
  environment,
  project,
  action,
  busy,
}: Controller) {
  const [selected, setSelected] = useState(assembly?.selected || []);
  const [hosting, setHosting] = useState(assembly?.hosting || "cloudflare");
  const [error, setError] = useState("");
  async function save() {
    try {
      validatePlan(selected, hosting);
      setError("");
      await action("anhedral_plan_stack", {
        projectId: project?.id,
        environment,
        revision: assembly?.revision || 0,
        selected,
        hosting,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Review the stack selection.",
      );
    }
  }
  return (
    <Disclosure className="stack-editor">
      <DisclosureTrigger>
        <strong>Choose stack pieces</strong>
        <span>Only add what the application needs</span>
      </DisclosureTrigger>
      <DisclosureContent>
        <div className="stack-editor-body">
          <StackChoices selected={selected} setSelected={setSelected} />
          <Label className="hosting-choice">
            Web hosting
            <NativeSelect
              value={hosting}
              onChange={(event) =>
                setHosting(event.target.value as typeof hosting)
              }
            >
              <NativeSelectOption value="cloudflare">
                Cloudflare Workers + OpenNext
              </NativeSelectOption>
              <NativeSelectOption value="vercel">
                Vercel · architecture approval required
              </NativeSelectOption>
            </NativeSelect>
          </Label>
          <p>
            Changing the stack resets checklist evidence for this environment.
            Domain, mail and Containers require agent integration beyond the CLI
            starter.
          </p>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} onClick={save}>
            Save stack plan
          </Button>
        </div>
      </DisclosureContent>
    </Disclosure>
  );
}
