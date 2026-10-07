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
