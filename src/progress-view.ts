import type { evaluateProjectProgress } from "./progress.js";

export type EnvironmentProgress = ReturnType<
  typeof evaluateProjectProgress
>["environments"][number];
interface ProgressNode {
  label?: string;
  id: string;
  capability?: string;
  resourceId?: string;
  status: "planned" | "building" | "configured" | "verified" | "blocked";
}

export interface ProviderObservation {
  id: string;
  name: string;
  status: string;
}
export function componentResources<T extends ProviderObservation>(
  node: ProgressNode,
  resources: readonly T[],
) {
  return resources.filter((resource) =>
    node.resourceId
      ? resource.id === node.resourceId
      : resource.id === node.id ||
        (!!node.label && resource.name === node.label),
  );
}
export function providerAttention(resources: readonly ProviderObservation[]) {
  return resources.some(
    (resource) => resource.status === "missing" || resource.status === "error",
  );
}

export function componentObservations(
  progress: EnvironmentProgress | undefined,
  node: ProgressNode,
) {
  return (
    progress?.observations.filter(
      (item) =>
        (item.capability === (node.capability || node.id) &&
          (!node.resourceId ||
            !item.resourceRef ||
            item.resourceRef === node.resourceId)) ||
        (!!node.resourceId && item.resourceRef === node.resourceId),
    ) || []
  );
}
export function latestObservations(
  observations: EnvironmentProgress["observations"],
) {
  const latest = new Map<string, EnvironmentProgress["observations"][number]>();
  for (const observation of observations) {
    const key = JSON.stringify([
      observation.capability,
      observation.milestone,
      observation.source,
      observation.accountRef,
      observation.resourceRef,
    ]);
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(observation.observedAt) >= Date.parse(previous.observedAt)
    )
      latest.set(key, observation);
  }
  return [...latest.values()];
}
export function componentState(
  progress: EnvironmentProgress | undefined,
  node: ProgressNode,
  resources: readonly ProviderObservation[] = [],
) {
  if (providerAttention(componentResources(node, resources))) return "blocked";
  const observations = latestObservations(
    componentObservations(progress, node),
  );
  const current = observations.filter((item) => !item.stale);
  if (current.some((item) => item.outcome !== "passed")) return "blocked";
  if (current.some((item) => item.milestone === "tested")) return "verified";
  if (
    current.some((item) =>
      ["provisioned", "connected"].includes(item.milestone),
    )
  )
    return "configured";
  if (current.some((item) => item.milestone === "generated")) return "building";
  if (observations.length) return "planned";
  return node.status;
}

/** A failed optional route does not block a working alternative for the same scope. */
export function discoveryAttention(
  discovery: EnvironmentProgress["discovery"],
) {
  const level = {
    installed: 0,
    callable: 1,
    "local-working": 1,
    authorized: 2,
    "integration-tested": 3,
  };
  const current = discovery.filter((item) => !item.stale);
  return current.filter(
    (item) =>
      item.outcome !== "passed" &&
      !current.some(
        (other) =>
          other.outcome === "passed" &&
          other.provider === item.provider &&
          other.route !== item.route &&
          (!item.accountRef || other.accountRef === item.accountRef) &&
          (item.source !== "independent" || other.source === "independent") &&
          level[other.check] >= level[item.check] &&
          level[other.check] >= 2,
      ),
  );
}
