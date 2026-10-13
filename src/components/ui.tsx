import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMounted, useSlidingPill } from "../lib/motion";
import { categoryById } from "../lib/constants";
import type { CategoryId, Status } from "../lib/types";
import { useTracker } from "../state";

// While any dialog is open the app behind it is inert: no keyboard focus, no
// screen-reader access. Counted, so nested dialogs work.
let openDialogs = 0;
export function useInertBackground(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.getElementById("root");
    openDialogs += 1;
    root?.setAttribute("inert", "");
    return () => {
      openDialogs = Math.max(0, openDialogs - 1);
      if (!openDialogs) root?.removeAttribute("inert");
    };
  }, [active]);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger" | "soft";

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer";
  const sizes = size === "sm" ? "h-8 px-3 text-body-sm" : "h-10 px-4 text-body";
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-white dark:text-paper hover:brightness-110 shadow-[0_6px_16px_-8px_var(--accent)]",
    ghost: "text-muted hover:text-ink hover:bg-ink/5",
    outline: "border border-line bg-panel text-ink hover:border-line-strong hover:bg-panel-2",
    danger: "bg-danger text-white hover:brightness-110",
    soft: "bg-accent-soft text-accent hover:brightness-95 dark:hover:brightness-125",
  };
  return (
    <button className={cx(base, sizes, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-ink/5 hover:text-ink cursor-pointer",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  useInertBackground(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fade fixed inset-0 z-[9800] flex items-end justify-center bg-[#14120e]/50 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx(
          "pop sheet flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-panel shadow-[var(--shadow-lg)] sm:rounded-3xl",
          width,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-start gap-3 px-6 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-serif text-display-sm font-semibold tracking-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 text-body-sm text-muted">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-panel-2 px-6 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Small popover menu anchored to its trigger; closes on outside click. */
export function Menu({
  trigger,
  children,
  align = "right",
  width = "w-60",
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cx(
            "menu-in absolute z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-lg)]",
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-body-sm transition disabled:cursor-default disabled:opacity-40",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-ink/5",
      )}
    >
      {icon && <span className={cx("shrink-0", danger ? "" : "text-muted")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="block text-caption text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="eyebrow px-3 pt-2 pb-1">{children}</div>;
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-line" />;
}

export function CategoryDot({ id, size = 8 }: { id: CategoryId; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `var(--cat-${id})` }} />;
}

// Tag text is the category colour pulled 35% toward the ink colour so the
// small label stays at WCAG AA contrast on its tint (checked in palettes.test).
export const TAG_TEXT_MIX = 65;
export const TAG_BG_MIX = 12;

export function CategoryTag({ id }: { id: CategoryId }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-micro font-semibold tracking-wide"
      style={{
        color: `color-mix(in srgb, var(--cat-${id}) ${TAG_TEXT_MIX}%, var(--ink))`,
        background: `color-mix(in srgb, var(--cat-${id}) ${TAG_BG_MIX}%, var(--panel))`,
      }}
    >
      {categoryById(id).short}
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  completed: "bg-accent-soft text-accent",
  "in-progress": "bg-warn-soft text-warn",
  planned: "bg-ink/5 text-muted",
};

export function StatusPill({ status, onClick }: { status: Status; onClick?: () => void }) {
  const label = status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Planned";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={onClick ? "Click to change status" : undefined}
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium",
        STATUS_STYLE[status],
        onClick && "cursor-pointer transition hover:brightness-95 dark:hover:brightness-125",
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          status === "completed" ? "bg-accent" : status === "in-progress" ? "bg-warn" : "border border-current",
        )}
      />
      {label}
    </Tag>
  );
}

export function Badge({ children, tone = "muted", title }: { children: ReactNode; tone?: "muted" | "accent" | "warn" | "danger"; title?: string }) {
  const tones = {
    muted: "bg-ink/5 text-ink/75",
    accent: "bg-accent-soft text-accent",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-micro font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h3 className="font-serif text-title font-semibold tracking-tight">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export function Bar({ segments, height = 8 }: { segments: { value: number; color: string; striped?: boolean }[]; height?: number }) {
  // Grows in from empty the first time it shows.
  const ready = useMounted();
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-ink/[0.06]" style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          className="h-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: ready ? `${Math.max(0, Math.min(100, s.value))}%` : "0%",
            background: s.striped
              ? `repeating-linear-gradient(135deg, ${s.color} 0 4px, color-mix(in oklab, ${s.color} 45%, transparent) 4px 8px)`
              : s.color,
          }}
        />
      ))}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useTracker();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[9900] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2.5 text-body-sm shadow-[var(--shadow-lg)]",
            t.tone === "warn" ? "bg-warn text-white" : "bg-ink text-paper",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{t.message}</span>
          {t.action && (
            <button
              className="cursor-pointer rounded-lg px-2 py-1 font-semibold text-[color:var(--accent-soft)] hover:bg-white/10"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ConfirmDialog() {
  const { confirmRequest: r } = useTracker();
  return (
    <Modal
      open={!!r}
      onClose={() => r?.resolve(false)}
      title={r?.title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => r?.resolve(false)}>
            Cancel
          </Button>
          <Button variant={r?.danger ? "danger" : "primary"} onClick={() => r?.resolve(true)} autoFocus>
            {r?.confirmLabel || "Confirm"}
          </Button>
        </>
      }
    >
      <div className="text-body leading-relaxed text-muted">{r?.body}</div>
    </Modal>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <div className="font-serif text-title font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-sm text-body-sm text-muted">{children}</div>}
    </div>
  );
}

/**
 * The highlight behind the selected item of a group (marked data-active="true"),
 * sliding to the next one when the selection changes. Put it first inside a
 * `relative` group whose items are `relative` too, so they paint above it.
 */
export function SlidingPill({ group, active, selector, className }: { group: RefObject<HTMLElement | null>; active: unknown; selector?: string; className: string }) {
  const { box, animate } = useSlidingPill(group, active, selector);
  if (!box) return null;
  return <span aria-hidden="true" className={cx("pill", animate && "pill-animate", className)} style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }} />;
}
