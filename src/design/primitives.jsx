import React from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { Button as UiButton } from "../components/ui/button";
import { Input as UiInput } from "../components/ui/input";
import { Textarea as UiTextarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge as UiBadge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Skeleton as UiSkeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";

const buttonVariantMap = {
  primary: "default",
  default: "default",
  secondary: "outline",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive",
  destructive: "destructive",
  link: "link",
};

const buttonSizes = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}) {
  return (
    <UiButton
      type={type}
      variant={buttonVariantMap[variant] || variant}
      size={buttonSizes[size] || size}
      className={cn(block && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          className="size-4 animate-spin"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon className="size-4" strokeWidth={1.8} />
      ) : null}
      {children}
      {IconRight ? (
        <IconRight className="size-4 button-trailing-icon" strokeWidth={1.8} />
      ) : null}
    </UiButton>
  );
}

export function ButtonLink({
  to,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  className = "",
  children,
  ...props
}) {
  return (
    <UiButton
      asChild
      variant={buttonVariantMap[variant] || variant}
      size={buttonSizes[size] || size}
      className={className}
    >
      <Link to={to} {...props}>
        {Icon ? <Icon className="size-4" strokeWidth={1.8} /> : null}
        {children}
        {IconRight ? (
          <IconRight
            className="size-4 button-trailing-icon"
            strokeWidth={1.8}
          />
        ) : null}
      </Link>
    </UiButton>
  );
}

export function IconButton({
  icon: Icon,
  label,
  size = "md",
  tone = "default",
  tooltip = true,
  className = "",
  type = "button",
  ...props
}) {
  const control = (
    <UiButton
      type={type}
      variant="ghost"
      size={size === "sm" ? "icon-sm" : "icon"}
      className={cn(
        "ui-icon-btn text-muted-foreground [&.saved]:text-primary [&.active]:bg-accent [&.active]:text-primary [&.selected]:bg-accent [&.selected]:text-primary",
        tone === "danger" && "hover:bg-danger-muted hover:text-danger",
        className,
      )}
      aria-label={label}
      title={tooltip ? undefined : label}
      {...props}
    >
      <Icon size={size === "sm" ? 15 : 17} strokeWidth={1.7} />
    </UiButton>
  );
  if (!tooltip) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="password-input">
      <UiInput
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <IconButton
        icon={visible ? EyeOff : Eye}
        label={visible ? "隐藏密钥" : "显示密钥"}
        aria-pressed={visible}
        size="sm"
        className="password-toggle"
        onClick={() => setVisible((value) => !value)}
      />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, meta }) {
  return (
    <header className="ui-page-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="ui-page-heading min-w-0">
        {eyebrow ? (
          <div className="ui-eyebrow mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="ui-page-title text-[22px] font-semibold leading-tight tracking-normal text-foreground">
          {title}
          {meta}
        </h1>
        {description ? (
          <p className="ui-page-description mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="ui-page-actions flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function Toolbar({ children, className = "" }) {
  return (
    <div
      className={cn(
        "ui-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className = "",
  children,
}) {
  return (
    <div className={cn("ui-field mb-4 grid gap-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="ui-field-error text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ui-field-hint text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <UiInput className={className} {...props} />;
}

export function Textarea({ className = "", ...props }) {
  return <UiTextarea className={className} {...props} />;
}

const calloutVariants = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "default",
};

const badgeVariants = {
  success: "success",
  info: "info",
  warning: "warning",
  danger: "destructive",
  neutral: "secondary",
};

export function Callout({
  tone = "info",
  icon: Icon,
  title,
  children,
  action,
}) {
  return (
    <Alert
      variant={calloutVariants[tone] || "default"}
      className="ui-callout items-start"
    >
      {Icon ? <Icon className="size-4" strokeWidth={1.7} /> : null}
      <div className="col-start-2 flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {title ? (
            <AlertTitle className="ui-callout-title">{title}</AlertTitle>
          ) : null}
          {children ? (
            <AlertDescription className="mt-0.5">{children}</AlertDescription>
          ) : null}
        </div>
        {action}
      </div>
    </Alert>
  );
}

export function Status({ tone = "neutral", children }) {
  return (
    <UiBadge
      variant={badgeVariants[tone] || "secondary"}
      className="ui-status gap-1.5 rounded-full"
    >
      <span
        className="size-1.5 rounded-full bg-current opacity-80"
        aria-hidden="true"
      />
      {children}
    </UiBadge>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="ui-empty flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon ? (
        <span className="ui-empty-icon mb-1 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon size={22} strokeWidth={1.5} />
        </span>
      ) : null}
      <h3 className="ui-empty-title text-sm font-semibold text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="ui-empty-description max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  rowKey = "id",
  empty = null,
  className = "",
  getRowKey,
}) {
  if (!rows.length) return empty;
  const keyOf = getRowKey || ((row) => row[rowKey]);
  return (
    <div className={cn("ui-table-wrap w-full overflow-x-auto", className)}>
      <Table className="ui-table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.align === "right" && "text-right",
                  column.align === "numeric" && "tabular-nums",
                  column.className,
                )}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={keyOf(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.align === "numeric" &&
                      "tabular-nums whitespace-nowrap",
                    column.className,
                  )}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Kpi({ icon: Icon, label, value, suffix, meta }) {
  return (
    <Card className="ui-kpi gap-1 px-4 py-3.5 shadow-xs">
      <span className="ui-kpi-label flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon ? <Icon size={14} strokeWidth={1.7} /> : null}
        {label}
      </span>
      <strong className="ui-kpi-value text-[24px] font-semibold leading-tight tracking-normal text-foreground tabular-nums">
        {value}
        {suffix ? (
          <small className="ml-1 text-xs font-normal tracking-normal text-muted-foreground">
            {suffix}
          </small>
        ) : null}
      </strong>
      {meta ? (
        <span className="ui-kpi-meta text-[11px] text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </Card>
  );
}

export function Skeleton({ width = "100%", height = 14, className = "" }) {
  return (
    <UiSkeleton
      className={cn("inline-block", className)}
      style={{ width, height }}
    />
  );
}
