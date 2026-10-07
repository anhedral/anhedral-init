import { useEffect, useState, type ComponentProps } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion.js";

export function Disclosure({
  open = false,
  children,
  className,
  ...props
}: Omit<
  ComponentProps<typeof Accordion>,
  "value" | "defaultValue" | "onValueChange"
> & { open?: boolean }) {
  const [expanded, setExpanded] = useState(open ? ["item"] : []);
  useEffect(() => {
    setExpanded(open ? ["item"] : []);
  }, [open]);
  return (
    <Accordion
      value={expanded}
      onValueChange={setExpanded}
      className={className}
      {...props}
    >
      <AccordionItem value="item">{children}</AccordionItem>
    </Accordion>
  );
}
export function DisclosureTrigger({
  className = "",
  ...props
}: ComponentProps<typeof AccordionTrigger>) {
  return (
    <AccordionTrigger
      className={`disclosure-trigger ${className}`}
      {...props}
    />
  );
}
export function DisclosureContent(
  props: ComponentProps<typeof AccordionContent>,
) {
  return <AccordionContent {...props} />;
}
