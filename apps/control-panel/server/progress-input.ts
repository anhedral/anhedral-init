import { z } from "zod";
import { environmentId } from "../shared/assembly.js";
import { validateProgressReport } from "../../../src/progress.js";

const text = z.string().min(1).max(600);
const evidence = {
  outcome: z.enum(["passed", "failed", "blocked"]),
  source: z.literal("agent"),
  observedAt: z.string().max(30),
  evidence: text,
  accountRef: z.string().min(1).max(160).optional(),
};
// Transport schema describes the tool; the npm contract remains the authority.
export const progressReportSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    environment: environmentId,
    observations: z
      .array(
        z
          .object({
            ...evidence,
            capability: z.string().min(1).max(80),
            milestone: z.enum([
              "generated",
              "provisioned",
              "connected",
              "tested",
              "deployed",
            ]),
            configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            resourceRef: z.string().min(1).max(160).optional(),
            revisionRef: z.string().min(1).max(160).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    discovery: z
      .array(
        z
          .object({
            ...evidence,
            provider: z.string().min(1).max(80),
            route: z.enum(["plugin", "api", "cli", "browser"]),
            check: z.enum([
              "installed",
              "callable",
              "local-working",
              "authorized",
              "integration-tested",
            ]),
            expiresAt: z.string().max(30),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    blockers: z.array(text).max(20).optional(),
    nextAction: text.nullable().optional(),
    previewUrl: z.string().max(2048).nullable().optional(),
    liveUrl: z.string().max(2048).nullable().optional(),
  })
  .strict();
export const parseProgressReport = (input: unknown) =>
  validateProgressReport(progressReportSchema.parse(input));
