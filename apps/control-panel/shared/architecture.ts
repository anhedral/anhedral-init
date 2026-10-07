import { z } from "zod";
import { nonSecretText } from "./non-secret.js";

const id = nonSecretText.pipe(
  z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
);
const text = nonSecretText.pipe(z.string().trim().min(1).max(160));
const state = z.enum([
  "planned",
  "building",
  "configured",
  "verified",
  "blocked",
]);
const evidence = z
  .array(nonSecretText.pipe(z.string().trim().min(1).max(500)))
  .max(8)
  .default([]);
const report = { status: state, evidence };
export const architectureSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id,
            label: text,
            capability: id.optional(),
            kind: text,
            resourceId: nonSecretText
              .pipe(z.string().trim().min(1).max(200))
              .optional(),
            layer: z.enum(["interface", "application", "service"]),
            ...report,
          })
          .strict(),
      )
      .max(36),
    edges: z
      .array(
        z
          .object({
            from: id,
            to: id,
            label: text,
            capability: id.optional(),
            ...report,
          })
          .strict(),
      )
      .max(72),
  })
  .strict()
  .superRefine((graph, context) => {
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (ids.size !== graph.nodes.length)
      context.addIssue({
        code: "custom",
        message: "Architecture node IDs must be unique.",
      });
    const pairs = new Set<string>();
    for (const edge of graph.edges) {
      const pair = `${edge.from}:${edge.to}`;
      if (
        !ids.has(edge.from) ||
        !ids.has(edge.to) ||
        edge.from === edge.to ||
        pairs.has(pair)
      )
        context.addIssue({
          code: "custom",
          message:
            "Connections require distinct, existing nodes and unique endpoints.",
        });
      pairs.add(pair);
    }
    for (const item of [...graph.nodes, ...graph.edges])
      if (
        ["configured", "verified"].includes(item.status) &&
        !item.evidence.length
      )
        context.addIssue({
          code: "custom",
          message:
            "Configured or verified architecture requires non-secret evidence references.",
        });
  });
export type Architecture = z.infer<typeof architectureSchema>;
