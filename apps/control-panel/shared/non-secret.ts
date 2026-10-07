import { z } from "zod";
import { isNonSecretEvidence } from "../../../src/evidence-validation.js";
export const nonSecretText = z.string().refine(
  isNonSecretEvidence,
  "Use non-secret descriptions and evidence references, not credentials.",
);
