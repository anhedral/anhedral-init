import type { Controller } from "./use-control-panel.js";
import { Icon } from "./components.js";
import { StackEditor } from "./stack-editor.js";

export function NextAction({
  nextStep,
  continueStep,
  busy,
  steps,
}: Controller) {
  const completed = steps.filter((step) => step.status === "done").length;
  return (
    <section className="next-action" aria-label="Next action">
      <div>
        <span className="eyebrow">
          {completed} / {steps.length} steps recorded complete
        </span>
        <h2>{nextStep ? nextStep.title : "Release evidence recorded"}</h2>
        <p>
          {nextStep?.summary ||
            nextStep?.detail ||
            "Review the evidence and continue monitoring the deployed application."}
        </p>
      </div>
      {nextStep && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => continueStep()}
        >
          {nextStep.status === "blocked"
            ? "Resolve with Anhedral"
            : nextStep.status === "active"
              ? "Continue with Anhedral"
              : "Start with Anhedral"}
          <Icon name="arrow" />
        </button>
      )}
    </section>
  );
}
export function Checklist(controller: Controller) {
  const { steps, nextStep, continueStep, busy } = controller;
  return (
    <section className="lifecycle" aria-label="Project checklist">
      {steps.map((step, index) => (
        <details
          key={step.id}
          open={step.id === nextStep?.id}
          className={`lifecycle-step ${step.status}`}
        >
          <summary>
            <span className="step-number">
              {step.status === "done"
                ? "✓"
                : String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <strong>{step.title}</strong>
              <span>{step.summary || step.detail}</span>
            </div>
            <span className="step-status">
              {step.status === "pending"
                ? "To do"
                : step.status === "done"
                  ? "Recorded complete"
                  : step.status === "blocked"
                    ? "Blocked"
                    : "In progress"}
            </span>
          </summary>
          <div className="step-body">
            <ul>
              {step.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {!!step.evidence?.length && (
              <div className="step-evidence">
                <strong>Agent-recorded evidence</strong>
                {step.evidence.map((item) => (
                  <p key={item}>{item}</p>
                ))}
                {step.updatedAt && (
                  <small>
                    Updated {new Date(step.updatedAt).toLocaleString()}
                  </small>
                )}
              </div>
            )}
            <button
              className="button"
              disabled={busy}
              onClick={() => continueStep(step.id)}
            >
              {step.status === "done"
                ? "Review evidence"
                : step.available
                  ? "Work on this step"
                  : "Review prerequisites"}
              <Icon name="arrow" />
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}
export function SelectedStack(controller: Controller) {
  const { assembly, data, project } = controller;
  const selected =
    data?.catalog.filter((item) => assembly?.selected.includes(item.id)) || [];
  return (
    <details className="selected-stack">
      <summary className="stack-summary">
        <strong>Selected stack</strong>
        <span>{selected.length} pieces · view or change</span>
      </summary>
      <div className="stack-content">
        <div className="section-toolbar">
          <h2>Application stack</h2>
          <span>
            {selected.length} selected pieces ·{" "}
            {project?.planned ? "New project" : "Existing project"}
          </span>
        </div>
        {selected.length ? (
          <div className="stack-pieces">
            <div className="stack-piece foundation">
              <small>Foundation</small>
              <strong>shadcn · pnpm · Turborepo</strong>
              <span>
                {assembly?.hosting === "cloudflare"
                  ? "Cloudflare-first hosting"
                  : "Vercel hosting exception"}
              </span>
            </div>
            {selected.map((item) => (
              <div key={item.id} className="stack-piece">
                <small>{item.group}</small>
                <strong>
                  {item.id === "neon"
                    ? "Neon + Hyperdrive"
                    : item.id === "next"
                      ? "Next.js"
                      : item.id}
                </strong>
                <span>{item.purpose}</span>
                <span className="piece-state">
                  {assembly?.pieces[item.id]?.status || "planned"} · agent
                  report
                </span>
                {assembly?.pieces[item.id]?.summary && (
                  <small>{assembly.pieces[item.id]?.summary}</small>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">
            Let Anhedral inspect the application and propose the pieces it
            needs, or choose them below.
          </p>
        )}
        <StackEditor
          key={`${project?.id}-${controller.environment}-${assembly?.revision}`}
          {...controller}
        />
      </div>
    </details>
  );
}
