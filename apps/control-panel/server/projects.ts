import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";

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
          })
          .strict(),
      )
      .max(50),
    settings: z.record(
      z.string().regex(/^[a-f0-9]{16}$/),
      z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), environmentSchema),
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
  if (!existsSync(registryPath())) return { projects: [], settings: {} };
  if (statSync(registryPath()).size > 1024 * 1024)
    throw new Error("Project registry is too large.");
  return registrySchema.parse(JSON.parse(readFileSync(registryPath(), "utf8")));
}

function saveRegistry(data: Registry): void {
  mkdirSync(stateDirectory(), { recursive: true, mode: 0o700 });
  const temporary = `${registryPath()}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(temporary, registryPath());
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

export function registerProject(folder: string): Project {
  const project = describeProject(folder);
  const registry = readRegistry();
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
        ...readRegistry().projects,
        ...roots.slice(0, 50).map(describeProject),
      ].map((project) => [project.id, project]),
    ).values(),
  ];
}

export function projectFor(id: string): Project {
  const project = projects().find((project) => project.id === id);
  if (!project) throw new Error("Project is not registered.");
  if (realpathSync(project.root) !== project.root)
    throw new Error("Project location changed; register it again.");
  return project;
}

export function updateSettings(
  id: string,
  environment: string,
  settings: Environment,
): void {
  projectFor(id);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(environment))
    throw new Error("Invalid environment name.");
  const registry = readRegistry();
  registry.settings[id] ||= {};
  registry.settings[id][environment] = environmentSchema.parse(settings);
  saveRegistry(registry);
}
