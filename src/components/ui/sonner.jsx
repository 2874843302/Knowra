import { Toaster as Sonner } from "sonner";

function Toaster(props) {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      className="toaster group"
      style={{
        "--normal-bg": "var(--surface-default)",
        "--normal-text": "var(--text-primary)",
        "--normal-border": "var(--border-default)",
        "--success-bg": "var(--feedback-success-bg)",
        "--success-text": "var(--feedback-success)",
        "--success-border": "var(--feedback-success-border)",
        "--error-bg": "var(--feedback-danger-bg)",
        "--error-text": "var(--feedback-danger)",
        "--error-border": "var(--feedback-danger-border)",
        "--warning-bg": "var(--feedback-warning-bg)",
        "--warning-text": "var(--feedback-warning)",
        "--warning-border": "var(--feedback-warning-border)",
        "--info-bg": "var(--feedback-info-bg)",
        "--info-text": "var(--feedback-info)",
        "--info-border": "var(--feedback-info-border)",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:text-[13px]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
