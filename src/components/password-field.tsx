"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
// Shared eye-toggle password input — used on login/setup, admin user
// create/edit and the self-service change-password form, so the show/hide
// behavior and markup stay identical everywhere a password is typed.
export function PasswordField(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { className, ...rest } = props;
  const [visible, setVisible] = React.useState(false);
  return <div className="relative">
    <input {...rest} type={visible ? "text" : "password"} className={`w-full rounded-md border bg-background px-3 py-2 pr-10 text-base ${className ?? ""}`} />
    <button type="button" tabIndex={-1} onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground">
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  </div>;
}
