import { Boxes } from "lucide-react";
import {
  Empty as ShadcnEmpty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty.js";
import type { ReactNode } from "react";
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
          <Boxes size={20} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </ShadcnEmpty>
  );
}
