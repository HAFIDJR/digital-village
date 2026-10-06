"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { errorMessage, useLogoutMutation } from "@/store/api";
import { cn } from "@/lib/utils";

/**
 * Shared logout control. The server closes any open shift, revokes the
 * session row and clears the cookie — then we hard-navigate so no stale
 * officer/warga state survives in the Redux store.
 */
export function LogoutButton({
  label,
  variant = "ghost",
  size = "sm",
  className,
  onDone,
}: {
  label: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "ink";
  size?: "xs" | "sm" | "default" | "lg" | "icon-sm";
  className?: string;
  onDone?: () => void;
}) {
  const [logout, logoutState] = useLogoutMutation();
  const [error, setError] = React.useState<string | null>(null);

  const handle = async () => {
    setError(null);
    try {
      const result = await logout().unwrap();
      onDone?.();
      window.location.assign(result.redirectTo);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={handle}
      disabled={logoutState.isLoading}
      aria-label={label}
    >
      {logoutState.isLoading ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <LogOut aria-hidden />
      )}
      {size.startsWith("icon") ? null : label}
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </Button>
  );
}
