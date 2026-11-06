import { Children, isValidElement, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = "__renda_empty_option__";

function optionsFrom(children: ReactNode): { value: string; label: ReactNode; disabled: boolean }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type !== "option") return optionsFrom(child.props.children);
    return [{ value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: child.props.disabled ?? false }];
  });
}

/** Presentation adapter: retain existing field values and change handlers. */
export function SelectField({ children, value, defaultValue, onChange, className, id, disabled, name, required, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsFrom(children);
  const selected = String(value ?? defaultValue ?? options[0]?.value ?? "");
  return (
    <Select value={selected || EMPTY} disabled={disabled ?? false} required={required ?? false} {...(name ? { name } : {})}
      onValueChange={(next) => {
        const field = { value: next === EMPTY ? "" : next, name: name ?? "", id: id ?? "" };
        onChange?.({ target: field, currentTarget: field } as ChangeEvent<HTMLSelectElement>);
      }}>
      <SelectTrigger id={id} aria-label={props["aria-label"]} aria-invalid={props["aria-invalid"]} className={className}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value || EMPTY} value={option.value || EMPTY} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}