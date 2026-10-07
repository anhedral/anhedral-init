import {
  LayoutGrid,
  Server,
  ListChecks,
  ShieldCheck,
  ArrowRight,
  Settings as SettingsIcon,
  RefreshCw,
  Plus,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Badge as ShadcnBadge } from "./components/ui/badge.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card.js";
import {
  Empty as ShadcnEmpty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty.js";
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
    <ShadcnBadge variant="outline" className={`badge ${status}`}>
      <i />
      {labels[status]}
    </ShadcnBadge>
  );
}
export function Icon({ name }: { name: string }) {
  const icons: Record<string, LucideIcon> = {
    overview: LayoutGrid,
    infrastructure: Server,
    checklist: ListChecks,
    checks: ShieldCheck,
    readiness: ShieldCheck,
    delivery: ArrowRight,
    settings: SettingsIcon,
    refresh: RefreshCw,
    plus: Plus,
    arrow: ArrowUpRight,
  };
  const Component = icons[name] || LayoutGrid;
  return <Component size={16} strokeWidth={1.5} aria-hidden="true" />;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <ShadcnEmpty className="empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon name="infrastructure" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </ShadcnEmpty>
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
    <Card className="panel gap-0 py-0">
      <CardHeader className="panel-heading">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
