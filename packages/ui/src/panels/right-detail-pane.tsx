import type { ReactNode } from "react";

import { Icon, type IconName } from "../primitives/icon";

export interface RightDetailPaneProps {
  ariaLabel: string;
  backLabel: string;
  children?: ReactNode;
  className?: string;
  isCollapsed: boolean;
  isMobile?: boolean | undefined;
  onBack?: (() => void) | undefined;
  onCollapse?: (() => void) | undefined;
  title?: string | undefined;
  titleIcon?: IconName | undefined;
}

export function RightDetailPane({
  ariaLabel,
  backLabel,
  children,
  className = "",
  isCollapsed,
  isMobile = false,
  onBack,
  onCollapse,
  title,
  titleIcon,
}: RightDetailPaneProps) {
  return (
    <aside aria-label={ariaLabel} className={`review-pane right-detail-pane${className ? ` ${className}` : ""}${isMobile ? " mobile-pane" : ""}`}>
      <header className="review-header">
        <div className="review-title">
          {isMobile && onBack ? (
            <button aria-label={backLabel} className="icon-button mobile-back-button" onClick={onBack} type="button">
              <Icon className="mobile-back-icon" name="right" />
            </button>
          ) : null}
          {title && titleIcon ? (
            <>
              <span className="nav-glyph right-detail-pane-glyph">
                <Icon name={titleIcon} />
              </span>
              <span>{title}</span>
            </>
          ) : null}
        </div>
        <div className="toolbar">
          {!isMobile && !isCollapsed && onCollapse ? (
            <button
              aria-label="收起右侧边栏"
              className="icon-button sidebar-toggle-button"
              data-direction="right"
              data-state="expanded"
              onClick={onCollapse}
              type="button"
            >
              <Icon className="sidebar-toggle-icon" name="panel-right-close" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="review-scroll">{children}</div>
    </aside>
  );
}
