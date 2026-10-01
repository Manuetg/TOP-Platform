import type { LucideIcon } from "lucide-react";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import "./TopBreadcrumb.css";

export interface TopBreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  current?: boolean;
}

interface TopBreadcrumbProps {
  items: readonly TopBreadcrumbItem[];
  ariaLabel?: string;
}

export function TopBreadcrumb({
  items,
  ariaLabel = "Migas de pan",
}: TopBreadcrumbProps) {
  return (
    <nav className="top-breadcrumb" aria-label={ariaLabel}>
      <ol className="top-breadcrumb__list">
        {items.map((item, index) => {
          const Icon = item.icon ?? (index === 0 ? LayoutDashboard : undefined);
          const isCurrent = item.current ?? !item.href;

          return (
            <li key={`${item.label}-${index}`}>
              {isCurrent ? (
                <span
                  className="top-breadcrumb__current"
                  aria-current="page"
                >
                  {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                  <span>{item.label}</span>
                </span>
              ) : (
                <Link className="top-breadcrumb__link" to={item.href!}>
                  {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                  <span>{item.label}</span>
                </Link>
              )}

              {index < items.length - 1 ? (
                <span className="top-breadcrumb__separator" aria-hidden="true">
                  <ChevronRight size={14} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
