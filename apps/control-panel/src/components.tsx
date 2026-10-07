import type { ReactNode } from "react";
import type { Status } from "../server/status.js";
const labels: Record<Status, string> = {
  verified: "Verified",
  configured: "Configured",
  missing: "Needs setup",
  unverified: "Not checked",
  error: "Needs attention",
};
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    checklist: "M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01",
    checks: "M9 12l2 2 4-4M12 3l9 4v6c0 5-9 9-9 9s-9-4-9-9V7z",
    overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    infrastructure: "M4 3h16v7H4zM4 14h16v7H4zM7 6h.01M7 17h.01",
    readiness: "M9 12l2 2 4-4M12 3l9 4v6c0 5-9 9-9 9s-9-4-9-9V7z",
    delivery: "M5 12h14M13 6l6 6-6 6",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
    refresh:
      "M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16a7 7 0 0 1-12 3l-3-3",
    plus: "M12 5v14M5 12h14",
    arrow: "M7 17L17 7M7 7h10v10",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.overview} />
    </svg>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="infrastructure" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
