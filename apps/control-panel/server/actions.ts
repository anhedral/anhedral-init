import { workerResources } from "./inventory.js";
import { capabilityProvider, expectedScope } from "./progress-scope.js";
import { reportProjectProgress } from "../../../src/progress.js";
import { progressReportSchema, parseProgressReport } from "./progress-input.js";
import { projectFor, readRegistry, registryMutation } from "./projects.js";
import { architectureSchema } from "../shared/architecture.js";
import { updateArchitecture } from "./projects.js";
import { z } from "zod";
import {
  planInput,
  progressInput,
  pieceInput,
  environmentId,
} from "../shared/assembly.js";
import { draftInput } from "./projects.js";
import {
  createDraft,
  savePlan,
  recordProgress,
  recordPiece,
  snapshot,
} from "./status.js";
const scope = {
  projectId: z.string().regex(/^[a-f0-9]{16}$/),
  environment: environmentId.default("default"),
  revision: z.number().int().nonnegative(),
};
export const lifecycleActions = {
  anhedral_report_project_progress: {
    title: "Report app-building progress",
    description:
      "Persist compact non-secret milestone evidence, blockers, next action and preview/live links in the initialized project's shared progress file. Use progress.revision (0 if absent), distinct from the architecture revision. Report discovery separately for plugin installation, callable session tools, local tooling, intended account/scope and tested integration; OAuth and CLI routes are separate. Evidence is agent-reported and time-bound, never independent provider verification. Does not execute commands, provision resources or authorize release. Drafts remain plans until initialized and registered.",
    schema: z
      .object({ projectId: scope.projectId, report: progressReportSchema })
      .strict(),
    run: async (input: unknown) => {
      const { projectId, report: rawReport } = z
        .object({ projectId: scope.projectId, report: progressReportSchema })
        .strict()
        .parse(input);
      const report = parseProgressReport(rawReport);
      const project = projectFor(projectId);
      if (project.planned)
        throw new Error(
          "Initialize and register the planned folder before recording shared project evidence.",
        );
      const current = await snapshot(projectId, report.environment);
      registryMutation(() => {
        const registry = readRegistry();
        const assembly = registry.assemblies[projectId]?.[report.environment];
        const selected = assembly?.selected || current.assembly?.selected || [];
        const settings = registry.settings[projectId]?.[report.environment];
        const declaredAccounts = [...new Set(workerResources(project.root, report.environment).flatMap(resource => resource.account ? [resource.account] : []))];
        for (const observation of report.observations || []) {
          if (observation.source !== "agent")
            throw new Error(
              "This tool accepts agent reports only; independent checks cannot be asserted by the caller.",
            );
          if (!selected.includes(observation.capability))
            throw new Error(
              "Progress must refer to a selected capability in this environment.",
            );
          const provider = capabilityProvider(observation.capability, assembly?.hosting || current.assembly?.hosting || "cloudflare");
          const expected = expectedScope(settings, provider) || (provider === "cloudflare" && declaredAccounts.length === 1 ? declaredAccounts[0] : undefined);
          if (provider === "cloudflare" && observation.outcome === "passed" && ["provisioned", "connected", "deployed"].includes(observation.milestone) && declaredAccounts.some(account => expected ? account !== expected : declaredAccounts.length > 1))
            throw new Error("Resolve ambiguous or conflicting Cloudflare account configuration before reporting provider success.");
          if (
            expected &&
            observation.outcome === "passed" &&
            ["provisioned", "connected", "deployed"].includes(
              observation.milestone,
            ) &&
            !observation.accountRef
          )
            throw new Error(
              "Passed provider progress requires the observed account or project scope.",
            );
          if (
            expected &&
            observation.accountRef &&
            observation.accountRef !== expected
          )
            throw new Error(
              "Progress account does not match this environment's configured provider scope.",
            );
        }
        for (const discovery of report.discovery || []) {
          if (discovery.source !== "agent")
            throw new Error("This tool accepts agent discovery reports only.");
          const expected = expectedScope(settings, discovery.provider);
          if (
            ["cloudflare", "neon"].includes(discovery.provider.toLowerCase()) &&
            discovery.check === "authorized" &&
            discovery.outcome === "passed" &&
            !discovery.accountRef
          )
            throw new Error(
              "Authorized provider discovery requires the observed account or project scope.",
            );
          if (
            expected &&
            discovery.accountRef &&
            discovery.accountRef !== expected
          )
            throw new Error(
              "Discovery account does not match this environment's configured provider scope.",
            );
        }
        reportProjectProgress(project.root, report);
      });
      return snapshot(projectId, report.environment);
    },
  },
  anhedral_update_architecture: {
    title: "Update the app architecture",
    description:
      "Replace this project/environment's visual architecture using its current revision. Map real app components and directed connections as work proceeds. Optionally associate a node with a resourceId from the current snapshot for separate provider status. Distinguish planned, building, configured, verified and blocked states; configured/verified require non-secret evidence references. These are agent reports, not independent provider checks. Never store secrets or invent connections. Does not grant provisioning or release authority.",
    schema: z.object({ ...scope, architecture: architectureSchema }).strict(),
    run: async (input: unknown) => {
      const { projectId, environment, revision, architecture } = z
        .object({ ...scope, architecture: architectureSchema })
        .strict()
        .parse(input);
      updateArchitecture(projectId, environment, revision, architecture);
      return snapshot(projectId, environment);
    },
  },
  anhedral_create_project: {
    title: "Plan a new Anhedral project",
    description:
      "Save a new project brief, unused absolute target folder and selected stack in local state. Does not create code, accounts, infrastructure or grant spending/release authority. Register the initialized folder with this draftId after implementation.",
    schema: z.object(draftInput).strict(),
    run: async (input: unknown) =>
      snapshot(createDraft(z.object(draftInput).strict().parse(input)).id),
  },
  anhedral_plan_stack: {
    title: "Update the selected stack",
    description:
      "Save a validated, project/environment-specific stack plan using its current revision. Changed scope resets lifecycle evidence. Optional services are not activated; does not provision or modify code.",
    schema: z.object({ ...scope, ...planInput }).strict(),
    run: async (input: unknown) => {
      const { projectId, environment, revision, ...plan } = z
        .object({ ...scope, ...planInput })
        .strict()
        .parse(input);
      savePlan(projectId, environment, revision, plan);
      return snapshot(projectId, environment);
    },
  },

  anhedral_record_piece: {
    title: "Record selected stack-piece progress",
    description:
      "Record a selected piece's actual configured, local, preview or release state and non-secret evidence. Scope is the project and environment with its latest revision. Requires evidence for progress; released requires completed release verification. Reports do not independently verify providers. Never store credentials.",
    schema: z.object({ ...scope, ...pieceInput }).strict(),
    run: async (input: unknown) => {
      const { projectId, environment, revision, ...progress } = z
        .object({ ...scope, ...pieceInput })
        .strict()
        .parse(input);
      recordPiece(projectId, environment, revision, progress);
      return snapshot(projectId, environment);
    },
  },
  anhedral_record_progress: {
    title: "Record lifecycle evidence",
    description:
      "Update the current project's checklist after actual work or a blocker. Use the current revision, non-secret summary and evidence references. Complete the step’s prerequisites first; done requires evidence. These are agent reports, not independent provider or product verification. Reopening a step invalidates downstream evidence. Never store credentials or assume production/spending authorization.",
    schema: z.object({ ...scope, ...progressInput }).strict(),
    run: async (input: unknown) => {
      const { projectId, environment, revision, ...progress } = z
        .object({ ...scope, ...progressInput })
        .strict()
        .parse(input);
      recordProgress(projectId, environment, revision, progress);
      return snapshot(projectId, environment);
    },
  },
};
