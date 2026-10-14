"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export type RowAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "danger" | undefined;
  title?: string;
};

export interface RowActionsProps {
  actions: RowAction[];
  label: string;
}

export function RowActions({ actions, label }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full p-1" aria-label={label}>
          <MoreHorizontal aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>

        {actions.map((action) => {
          const { id, label: actionLabel, icon, onSelect, disabled, tone } =
            action;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={onSelect}
              disabled={disabled}
              tone={tone === "danger" ? "danger" : undefined}
            >
              <div className="flex items-center gap-2">
                {icon ? (
                  <React.Fragment>
                    {React.createElement(icon, {
                      className: "size-3.5",
                      "aria-hidden": true,
                    })}
                  </React.Fragment>
                ) : null}
                <span className="text-xs text-fg-muted">{actionLabel}</span>
              </div>
            </DropdownMenuItem>
          );
        })}

        {actions.some((a) => a.tone === "danger") && (
          <DropdownMenuSeparator />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
