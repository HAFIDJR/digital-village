"use client";

import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BaseRowAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
};

export type RowAction =
  | BaseRowAction
  | (BaseRowAction & { tone: "danger" });

export type RowSubmenu = {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  items: {
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  }[];
};

function isSubmenu(action: RowAction | RowSubmenu): action is RowSubmenu {
  return "items" in action;
}

export function RowActions({
  actions,
  label,
  subject,
}: {
  actions: (RowAction | RowSubmenu)[];
  label: string;
  subject?: string;
}) {
  if (actions.length === 0) return null;

  const destructive = actions.filter(
    (action) => !isSubmenu(action) && "tone" in action && action.tone === "danger",
  );
  const regular = actions.filter(
    (action) => isSubmenu(action) || !("tone" in action && action.tone === "danger"),
  );

  const renderItem = (action: RowAction | RowSubmenu) => {
    if (isSubmenu(action)) {
      return (
        <DropdownMenuSub key={action.id}>
          <DropdownMenuSubTrigger disabled={action.disabled}>
            <action.icon aria-hidden />
            {action.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {action.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={item.onSelect}
                disabled={item.disabled}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }
    return (
      <DropdownMenuItem
        key={action.id}
        onSelect={action.onSelect}
        disabled={action.disabled}
        title={action.title}
        tone={"tone" in action ? action.tone : "default"}
      >
        <action.icon aria-hidden />
        {action.label}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {subject ? (
          <>
            <DropdownMenuLabel className="max-w-52 truncate">{subject}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {regular.map(renderItem)}
        {destructive.length > 0 ? (
          <>
            {regular.length > 0 ? <DropdownMenuSeparator /> : null}
            {destructive.map(renderItem)}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}