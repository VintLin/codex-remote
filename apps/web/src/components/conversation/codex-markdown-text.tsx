"use client";

import { Children, isValidElement, type MouseEvent, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";

interface CodexMarkdownTextProps {
  links?: LinkReference[];
  onOpenDetail?: (target: DetailTarget | LinkReference) => void;
  text: string;
}

const noopOpenDetail = () => {};

export function CodexMarkdownText({
  links = [],
  onOpenDetail = noopOpenDetail,
  text,
}: CodexMarkdownTextProps) {
  const components: Components = {
    a({ children, href, ...props }) {
      const label = getNodeText(children).trim();
      const link = findLinkReference(links, href, label);
      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        if (link) {
          onOpenDetail(link);
        }
      };

      return (
        <a href={href} onClick={handleClick} rel="noreferrer" target="_blank" {...props}>
          {children}
        </a>
      );
    },
    img({ alt, src }) {
      return (
        <span className="codex-markdown-image-reference">
          {alt ? `图片：${alt}` : "图片"}
          {src ? ` (${src})` : ""}
        </span>
      );
    },
    input({ ...props }) {
      return <input disabled {...props} />;
    },
  };

  return (
    <div className="codex-markdown">
      <Markdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </Markdown>
    </div>
  );
}

function findLinkReference(links: LinkReference[], href: string | undefined, label: string): LinkReference | null {
  if (!href && !label) {
    return null;
  }

  return (
    links.find((link) => link.href === href && (!label || link.label === label)) ??
    links.find((link) => link.href === href || (!!label && link.label === label)) ??
    null
  );
}

function getNodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getNodeText(child.props.children);
      }

      return "";
    })
    .join("");
}
