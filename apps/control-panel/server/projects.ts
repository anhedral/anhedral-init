import {
  architectureSchema,
  type Architecture,
} from "../shared/architecture.js";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";

import {
  assemblySchema,
  environmentId,
  validatePlan,
  planInput,
  progressInput,
  pieceInput,
  nonSecretText,
  STAGES,
  PREREQUISITES,
  dependsOn,
  type Assembly,
} from "../shared/assembly.js";

import type { Project, Environment } from "./status.js";
const environmentSchema = z
  .object({
    cloudflareAccountId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    neonProjectId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    repository: z
      .string()
      .max(200)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/)
      .optional(),
  })
  .strict();
const registrySchema = z
  .object({
    projects: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9]{16}$/),
            name: z.string().max(100),
            root: z.string().max(4096),
            planned: z.boolean().optional(),
            brief: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .max(50),
    assemblies: z
      .record(
        z.string().regex(/^[a-f0-9]{16}$/),
        z.record(environmentId, assemblySchema),
      )
      .default({}),
    settings: z.record(
      z.string().regex(/^[a-f0-9]{16}$/),
      z.record(environmentId, environmentSchema),
    ),
  })
  .strict();
type Registry = z.infer<typeof registrySchema>;
const stateDirectory = () =>
  process.env.ANHEDRAL_STATE_DIR || path.join(homedir(), ".anhedral");
const registryPath = () => path.join(stateDirectory(), "projects.json");
export const bindings = (value: unknown): Record<string, any>[] =>
  Array.isArray(value)
    ? value
        .slice(0, 100)
        .filter(
          (item) => item && typeof item === "object" && !Array.isArray(item),
        )
    : [];

export function readRegistry(): Registry {
  if (!existsSync(registryPath()))
    return { projects: [], settings: {}, assemblies: {} };
  if (statSync(registryPath()).size > 1024 * 1024)
    throw new Error("Project registry is too large.");
  return registrySchema.parse(JSON.parse(readFileSync(registryPath(), "utf8")));
}

function saveRegistry(data: Registry): void {
  const serialized = JSON.stringify(registrySchema.parse(data), null, 2) + "\n";
  if (Buffer.byteLength(serialized) > 1024 * 1024)
    throw new Error("Project registry is too large.");
  mkdirSync(stateDirectory(), { recursive: true, mode: 0o700 });
  const temporary = `${registryPath()}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, serialized, { mode: 0o600, flag: "wx" });
    renameSync(temporary, registryPath());
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readProjectFile(
  root: string,
  relative: string,
): Record<string, any> | undefined {
  const filename = path.join(root, relative);
  if (!existsSync(filename)) return;
  const resolved = realpathSync(filename);
  if (
    !resolved.startsWith(root + path.sep) ||
    statSync(resolved).size > 1024 * 1024
  )
    throw new Error(
      "Project configuration is outside its allowed boundary or too large.",
    );
  const errors: ParseError[] = [];
  const value = parse(readFileSync(resolved, "utf8"), errors);
  if (
    errors.length ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new Error("Invalid project configuration.");
  return value;
}

function describeProject(folder: string): Project {
  const root = realpathSync(folder);
  const manifest = readProjectFile(root, "package.json");
  if (!manifest)
    throw new Error("Choose a project folder containing package.json.");
  const project = {
    id: createHash("sha256").update(root).digest("hex").slice(0, 16),
    name: String(manifest.name || path.basename(root)).slice(0, 100),
    root,
  };
  return project;
}

function registerProjectUnlocked(folder: string, draftId?: string): Project {
  const project = describeProject(folder);
  const registry = readRegistry();
  if (draftId) {
    const draft = registry.projects.find((item) => item.id === draftId);
    if (!draft?.planned || path.resolve(draft.root) !== project.root)
      throw new Error("The initialized folder must match the planned project.");
    if (
      registry.projects.some(
        (item) => item.id !== draftId && item.root === project.root,
      )
    )
      throw new Error("This folder already belongs to another project.");
    draft.planned = false;
    saveRegistry(registry);
    return draft;
  }
  const existing = registry.projects.find((item) => item.root === project.root);
  if (existing?.planned)
    throw new Error(
      "Register the initialized folder with its draftId to preserve the plan.",
    );
  if (existing) return existing;
  if (!registry.projects.some(({ id }) => id === project.id)) {
    if (registry.projects.length >= 50)
      throw new Error("At most 50 projects can be registered.");
    registry.projects.push(project);
    saveRegistry(registry);
  }
  return project;
}

export function projects(): Project[] {
  const roots =
    process.env.ANHEDRAL_PROJECT_ROOTS?.split(path.delimiter).filter(Boolean) ||
    [];
  return [
    ...new Map(
      [
        ...roots.slice(0, 50).map(describeProject),
        ...readRegistry().projects,
      ].map((project) => [project.root, project]),
    ).values(),
  ];
}

export function projectFor(id: string): Project {
  const project = projects().find((project) => project.id === id);
  if (!project) throw new Error("Project is not registered.");
  if (!project.planned && realpathSync(project.root) !== project.root)
    throw new Error("Project location changed; register it again.");
  return project;
}

function updateSettingsUnlocked(
  id: string,
  environment: string,
  settings: Environment,
): void {
  projectFor(id);
  environmentId.parse(environment);
  const registry = readRegistry();
  registry.settings[id] ||= {};
  registry.settings[id][environment] = environmentSchema.parse(settings);
  saveRegistry(registry);
}

export const draftInput = {
  name: nonSecretText.pipe(z.string().trim().min(1).max(100)),
  folder: z.string().min(1).max(4096),
  brief: nonSecretText.pipe(z.string().trim().min(1).max(2000)),
  ...planInput,
};
function createDraftUnlocked(
  input: z.infer<z.ZodObject<typeof draftInput>>,
): Project {
  const data = z.object(draftInput).strict().parse(input);
  validatePlan(data.selected, data.hosting);
  if (!path.isAbsolute(data.folder) || existsSync(data.folder))
    throw new Error(
      "Choose an absolute path for a new folder. Add existing projects instead.",
    );
  const registry = readRegistry();
  let ancestor = path.resolve(data.folder);
  const segments: string[] = [];
  while (!existsSync(ancestor)) {
    segments.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  if (!statSync(ancestor).isDirectory())
    throw new Error("The target parent must be a directory.");
  const root = path.join(realpathSync(ancestor), ...segments);
  if (
    registry.projects.length >= 50 ||
    registry.projects.some((item) => item.root === root)
  )
    throw new Error("Project limit reached or folder already planned.");
  const project = {
    id: randomUUID().replaceAll("-", "").slice(0, 16),
    name: data.name,
    root,
    brief: data.brief,
    planned: true,
  };
  registry.projects.push(project);
  registry.assemblies[project.id] = {
    default: {
      selected: data.selected,
      hosting: data.hosting,
      revision: 1,
      pieces: {},
      progress: {},
    },
  };
  saveRegistry(registry);
  return project;
}
function savePlanUnlocked(
  id: string,
  environment: string,
  revision: number,
  input: Pick<Assembly, "selected" | "hosting">,
): void {
  projectFor(id);
  environmentId.parse(environment);
  const plan = z.object(planInput).strict().parse(input);
  validatePlan(plan.selected, plan.hosting);
  const registry = readRegistry();
  const current = registry.assemblies[id]?.[environment];
  if ((current?.revision || 0) !== revision)
    throw new Error("The plan changed. Refresh before saving.");
  registry.assemblies[id] ||= {};
  // Changed scope invalidates prior lifecycle evidence. An identical plan keeps it.
  const same =
    current &&
    current.hosting === plan.hosting &&
    [...current.selected].sort().join() === [...plan.selected].sort().join();
  registry.assemblies[id][environment] = {
    ...plan,
    revision: revision + 1,
    architecture: same ? current.architecture : undefined,
    progress: same ? current.progress : {},
    pieces: same ? current.pieces : {},
  };
  saveRegistry(registrySchema.parse(registry));
}
function recordProgressUnlocked(
  id: string,
  environment: string,
  revision: number,
  input: z.infer<z.ZodObject<typeof progressInput>>,
): void {
  projectFor(id);
  environmentId.parse(environment);
  const data = z.object(progressInput).strict().parse(input);
  const registry = readRegistry();
  const current = registry.assemblies[id]?.[environment];
  if (!current || current.revision !== revision)
    throw new Error(
      "The plan changed. Open the project and use its current revision.",
    );
  if (data.status === "done" && !data.evidence.length)
    throw new Error("Completed steps require non-secret evidence references.");
  if (data.status === "done" || data.status === "active") {
    if (
      PREREQUISITES[data.stage].some(
        (id) => current.progress[id]?.status !== "done",
      )
    )
      throw new Error(
        "Resolve earlier checklist prerequisites before advancing. Record verified existing work instead of repeating it.",
      );
  }
  if (
    data.stage === "verify" &&
    data.status === "done" &&
    Object.values(current.pieces).some((piece) => piece.status === "blocked")
  )
    throw new Error(
      "Resolve blocked stack pieces before completing release verification.",
    );
  // Independent local development can proceed while provider access is blocked.
  if (data.status !== "done") {
    for (const stage of STAGES)
      if (dependsOn(stage.id, data.stage)) delete current.progress[stage.id];
    for (const piece of Object.values(current.pieces))
      if (piece.status === "released") piece.status = "blocked";
  }
  const { stage, ...progress } = data;
  current.progress[stage] = {
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  current.revision++;
  saveRegistry(registrySchema.parse(registry));
}

function recordPieceUnlocked(
  id: string,
  environment: string,
  revision: number,
  input: z.infer<z.ZodObject<typeof pieceInput>>,
): void {
  projectFor(id);
  environmentId.parse(environment);
  const data = z.object(pieceInput).strict().parse(input);
  const registry = readRegistry();
  const current = registry.assemblies[id]?.[environment];
  if (!current || current.revision !== revision)
    throw new Error("The plan changed. Use its current revision.");
  if (!current.selected.includes(data.piece))
    throw new Error("This piece is not selected for this environment.");
  if (!["planned", "blocked"].includes(data.status) && !data.evidence.length)
    throw new Error("Stack progress requires non-secret evidence references.");
  if (data.status === "released" && current.progress.verify?.status !== "done")
    throw new Error(
      "Record release verification before marking a piece released.",
    );
  const { piece, ...progress } = data;
  current.pieces[piece] = { ...progress, updatedAt: new Date().toISOString() };
  if (data.status === "blocked")
    current.progress.verify = {
      status: "blocked",
      summary: `${piece}: ${data.summary}`,
      evidence: data.evidence,
      updatedAt: new Date().toISOString(),
    };
  current.revision++;
  saveRegistry(registry);
}

function updateArchitectureUnlocked(
  id: string,
  environment: string,
  revision: number,
  input: Architecture,
): void {
  projectFor(id);
  environmentId.parse(environment);
  const graph = architectureSchema.parse(input);
  const registry = readRegistry();
  const current = registry.assemblies[id]?.[environment];
  if (!current || current.revision !== revision)
    throw new Error(
      "The plan changed. Open the project and use its current revision.",
    );
  if (
    graph.nodes.some(
      (node) => node.capability && !current.selected.includes(node.capability),
    )
  )
    throw new Error(
      "Architecture capabilities must belong to the selected stack.",
    );
  current.architecture = graph;
  current.revision++;
  saveRegistry(registry);
}

// A process-wide filesystem lock protects every registry read/modify/write pair.
// Never steal a lock: after an interrupted writer, inspect and remove it explicitly.
export function registryMutation<T>(run: () => T): T {
  mkdirSync(stateDirectory(), { recursive: true, mode: 0o700 });
  const lock = `${registryPath()}.lock`;
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Another registry update is in progress. Refresh and retry; inspect a persistent lock before recovering it.",
      );
    throw error;
  }
  try {
    writeFileSync(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
      { mode: 0o600, flag: "wx" },
    );
    return run();
  } finally {
    rmSync(lock, { recursive: true });
  }
}
export const registerProject = (
  ...args: Parameters<typeof registerProjectUnlocked>
) => registryMutation(() => registerProjectUnlocked(...args));
export const updateSettings = (
  ...args: Parameters<typeof updateSettingsUnlocked>
) => registryMutation(() => updateSettingsUnlocked(...args));
export const createDraft = (...args: Parameters<typeof createDraftUnlocked>) =>
  registryMutation(() => createDraftUnlocked(...args));
export const savePlan = (...args: Parameters<typeof savePlanUnlocked>) =>
  registryMutation(() => savePlanUnlocked(...args));
export const recordProgress = (
  ...args: Parameters<typeof recordProgressUnlocked>
) => registryMutation(() => recordProgressUnlocked(...args));
export const recordPiece = (...args: Parameters<typeof recordPieceUnlocked>) =>
  registryMutation(() => recordPieceUnlocked(...args));
export const updateArchitecture = (
  ...args: Parameters<typeof updateArchitectureUnlocked>
) => registryMutation(() => updateArchitectureUnlocked(...args));
