import { createDom } from "../dom.js";

const MAX_NODES = 1500;
const TOP_NODES = 1000;
const BOTTOM_NODES = 500;
const MAX_TEXT_LENGTH = 60;
const MAX_CLASSES = 3;

interface SnapshotNode {
  tag: string;
  depth: number;
  id?: string;
  role?: string;
  ariaLabel?: string;
  href?: string;
  classes?: string[];
  text?: string;
}

export function buildStructuralDomSnapshot(html: string, url: string): string {
  const dom = createDom(html, { url });
  const document = dom.window.document;

  for (const selector of ["script", "style", "svg", "noscript", "iframe", "meta", "link"]) {
    for (const element of document.querySelectorAll(selector)) {
      element.remove();
    }
  }

  for (const element of document.querySelectorAll('[hidden], [aria-hidden="true"]')) {
    element.remove();
  }

  const nodes = collectNodes(document.body);
  const selected = nodes.length <= MAX_NODES
    ? nodes
    : [...nodes.slice(0, TOP_NODES), ...nodes.slice(-BOTTOM_NODES)];

  return selected.map(formatNode).join("\n");
}

function collectNodes(root: Element | null): SnapshotNode[] {
  if (!root) return [];

  const queue: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }];
  const nodes: SnapshotNode[] = [];

  while (queue.length > 0 && nodes.length < MAX_NODES * 2) {
    const { element, depth } = queue.shift()!;
    const node = extractNode(element, depth);
    if (node) nodes.push(node);

    for (const child of element.children) {
      queue.push({ element: child, depth: depth + 1 });
    }
  }

  return nodes;
}

function extractNode(element: Element, depth: number): SnapshotNode | null {
  const tag = element.tagName.toLowerCase();
  const text = directText(element);
  const role = element.getAttribute("role") || undefined;
  const ariaLabel = element.getAttribute("aria-label") || undefined;
  const classes = Array.from(element.classList).slice(0, MAX_CLASSES);

  if (
    (tag === "div" || tag === "span") &&
    !element.id &&
    !role &&
    !ariaLabel &&
    classes.length === 0 &&
    !text
  ) {
    return null;
  }

  const node: SnapshotNode = { tag, depth };
  if (element.id) node.id = element.id.slice(0, 80);
  if (role) node.role = role.slice(0, 40);
  if (ariaLabel) node.ariaLabel = ariaLabel.slice(0, MAX_TEXT_LENGTH);
  if (classes.length > 0) node.classes = classes;
  if (text) node.text = text.slice(0, MAX_TEXT_LENGTH);
  if (tag === "a") {
    const href = element.getAttribute("href");
    if (href) node.href = truncateHref(href);
  }

  return node;
}

function directText(element: Element): string {
  let text = "";
  for (const child of element.childNodes) {
    if (child.nodeType === 3) text += ` ${child.textContent?.trim() || ""}`;
  }
  return text.trim().replace(/\s+/g, " ");
}

function truncateHref(href: string): string {
  try {
    const parsed = new URL(href, "https://example.invalid");
    return `${parsed.pathname}${parsed.search ? "?..." : ""}`;
  } catch {
    return href.slice(0, 80);
  }
}

function formatNode(node: SnapshotNode): string {
  const indent = "  ".repeat(Math.min(node.depth, 8));
  const parts = [node.tag];
  if (node.id) parts.push(`#${node.id}`);
  if (node.classes?.length) parts.push(`.${node.classes.join(".")}`);
  if (node.role) parts.push(`role="${node.role}"`);
  if (node.ariaLabel) parts.push(`aria="${node.ariaLabel}"`);
  if (node.href) parts.push(`href="${node.href}"`);
  if (node.text) parts.push(`"${node.text}"`);
  return `${indent}<${parts.join(" ")}>`;
}
