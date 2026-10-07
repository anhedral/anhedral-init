import type { Snapshot } from "../server/status.js";

/** Protect user selection from older reads, while allowing Codex to switch scope. */
export class SnapshotGate {
  private generation = 0;
  private pending = false;
  private current?: Snapshot;
  begin() {
    this.pending = true;
    return ++this.generation;
  }
  isCurrent(generation: number) {
    return generation === this.generation;
  }
  finish(generation: number) {
    if (generation === this.generation) this.pending = false;
  }
  accept(data: Snapshot, origin: "initial" | "notification" | number) {
    if (typeof origin === "number") {
      if (origin !== this.generation) return false;
    } else if (origin === "initial") {
      if (this.generation !== 0) return false;
    } else if (this.pending) return false;
    const current = this.current;
    // Completion time alone cannot order slow provider reads across user selections.
    // Older hosts omit startedAt; their completion time remains a compatibility fallback.
    if (
      current &&
      (Date.parse(data.startedAt ?? data.checkedAt) <
        Date.parse(current.startedAt ?? current.checkedAt) ||
        Date.parse(data.checkedAt) < Date.parse(current.checkedAt))
    ) return false;
    if (
      current?.project?.id === data.project?.id &&
      current?.environment === data.environment
    ) {
      if (
        (data.progress?.revision ?? 0) < (current.progress?.revision ?? 0) ||
        (data.assembly?.revision ?? 0) < (current.assembly?.revision ?? 0)
      )
        return false;
    }
    if (origin === "notification") this.generation++;
    this.current = data;
    return true;
  }
}
