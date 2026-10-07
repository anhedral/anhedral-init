import { ArrowUpRight } from "lucide-react";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { openApp } from "./bridge.js";
import type { Controller } from "./use-control-panel.js";
import type { Architecture } from "../shared/architecture.js";
import {
  componentObservations,
  latestObservations,
  providerAttention,
  discoveryAttention,
  type EnvironmentProgress,
} from "../../../src/progress-view.js";
export { componentState } from "../../../src/progress-view.js";

const milestoneNames = {
  generated: "Code",
  provisioned: "Resources",
  connected: "Connections",
  tested: "Tests",
  deployed: "Deployment",
};
export function currentProgress({ data, environment }: Controller) {
  return data?.project
    ? data.progressEvaluation?.environments.find(
        (item) => item.id === environment,
      )
    : undefined;
}
export function BuildProgress(controller: Controller) {
  const progress = currentProgress(controller);
  const providerIssue = providerAttention(controller.resources);
  if (!progress)
    return providerIssue ? (
      <section className="build-progress" aria-label="Build progress">
        <div>
          <Badge variant="outline">Needs attention</Badge>
          <p>
            Provider verification needs attention. Inspect the affected
            component.
          </p>
        </div>
      </section>
    ) : null;
  const active = latestObservations(progress.observations);
  const accessIssues = discoveryAttention(progress.discovery);
  const needsAttention =
    active.some((item) => !item.stale && item.outcome !== "passed") ||
    progress.blockers.length > 0 ||
    accessIssues.length > 0 ||
    providerIssue;
  const stale =
    active.some((item) => item.stale) ||
    progress.discovery.some((item) => item.stale);
  const next =
    progress.blockers[0] ||
    (providerIssue
      ? "Provider verification needs attention. Inspect the affected component."
      : progress.nextAction) ||
    (accessIssues.length
      ? `Recheck ${accessIssues[0].provider} access (${accessIssues[0].route}).`
      : "") ||
    (stale
      ? "Recheck the app and access before continuing."
      : "Progress saved. Codex can resume from here.");
  const links = [
    ["Try preview", progress.previewUrl],
    ["Open live app", progress.liveUrl],
  ].filter((item): item is [string, string] => !!item[1]);
  return (
    <section className="build-progress" aria-label="Build progress">
      <div>
        <Badge variant="outline">
          {needsAttention
            ? "Needs attention"
            : stale
              ? "Recheck needed"
              : "In progress"}
        </Badge>
        <p>{next}</p>
      </div>
      <div className="build-links">
        {links.map(([label, url]) => (
          <Button
            key={label}
            variant="outline"
            size="sm"
            onClick={() =>
              openApp(url).catch(() =>
                controller.setNotice("Unable to open the app link."),
              )
            }
          >
            {label}
            <ArrowUpRight />
          </Button>
        ))}
      </div>
    </section>
  );
}
export function ComponentProgress({
  progress,
  node,
}: {
  progress: EnvironmentProgress | undefined;
  node: Architecture["nodes"][number];
}) {
  const observations = componentObservations(progress, node);
  if (!observations.length) return null;
  return (
    <section>
      <h3>Build progress</h3>
      <div className="milestone-list">
        {observations.map((item) => (
          <div
            className="milestone-row"
            key={JSON.stringify([
              item.capability,
              item.milestone,
              item.source,
              item.accountRef,
              item.resourceRef,
            ])}
          >
            <div>
              <strong>{milestoneNames[item.milestone]}</strong>
              <Badge variant="outline">
                {item.stale
                  ? "Recheck"
                  : item.outcome === "passed"
                    ? "Passed"
                    : item.outcome === "failed"
                      ? "Failed"
                      : "Blocked"}
              </Badge>
            </div>
            <p>{item.evidence}</p>
            <small>
              {item.source === "agent" ? "Agent report" : "Independent check"} ·{" "}
              {new Date(item.observedAt).toLocaleString()}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
