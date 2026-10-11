import type { ReactNode } from "react";
import { parseCommentMarkdown, type Inline } from "@flowdesk/contracts";
import { PersonName } from "./PersonName";

/**
 * A comment body drawn as people and formatting (ADR 0033 for the @mentions, ADR 0056 for the formatting): plain text stays plain text, each
 * mention becomes an `@` and the person's name with the usual hover card and profile link, and bold, italic, strikethrough, code, lists and
 * safe links are drawn as such. Someone who has left the organization shows by the name saved in the token, without a link.
 *
 * Built from React nodes only, never HTML: the reader (`parseCommentMarkdown`) can produce nothing but text, formatting, mentions, breaks, lists
 * and links with a checked address, so nothing a writer types can inject markup. Links open in a new tab and say so to the browser
 * (`noopener noreferrer`), and tell search engines not to count them (`nofollow ugc`).
 */
export function MentionedText({
  organizationId,
  body,
  renderImage,
}: {
  organizationId: string;
  body: string;
  /** Draws a picture in the text (ADR 0062) from its file's id and name. Supplied by the caller, who knows the files; without it a picture shows as its name. */
  renderImage?: (attachmentId: string, alt: string) => ReactNode;
}) {
  const draw = (nodes: Inline[]): ReactNode =>
    nodes.map((node, index) => {
      switch (node.type) {
        case "text":
          return <span key={index}>{node.text}</span>;
        case "break":
          return <br key={index} />;
        case "bold":
          return <strong key={index}>{draw(node.children)}</strong>;
        case "italic":
          return <em key={index}>{draw(node.children)}</em>;
        case "strike":
          return <s key={index}>{draw(node.children)}</s>;
        case "code":
          return (
            <code key={index} className="rounded bg-[var(--color-bg-page)] px-1 py-0.5 font-mono text-[0.85em]">
              {node.text}
            </code>
          );
        case "link":
          return (
            <a key={index} href={node.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-2">
              {draw(node.children)}
            </a>
          );
        case "image":
          return <span key={index}>{renderImage ? renderImage(node.attachmentId, node.alt) : `[${node.alt || "image"}]`}</span>;
        case "mention":
          return (
            <span key={index} className="font-medium">
              @<PersonName organizationId={organizationId} userId={node.userId} name={node.name} />
            </span>
          );
      }
    });

  return (
    <div className="space-y-2">
      {parseCommentMarkdown(body).map((block, index) => {
        if (block.type === "image") {
          return (
            <div key={index}>{renderImage ? renderImage(block.attachmentId, block.alt) : `[${block.alt || "image"}]`}</div>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {draw(block.children)}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={index} className={block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{draw(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
