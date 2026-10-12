import { useState } from "react";
import type { Project } from "@flowdesc/contracts";
import { useProjects } from "../../../entities/project";
import { IssuePanel, useIssuePanel } from "../../../widgets/issue-detail";

/**
 * The side panel for `?issue=WEB-12` on My work (ADR 0025). The other pages belong to one project and hand it to `IssuePanel`; this page spans
 * projects, so the project is found from the key in the address. The last project is kept while the panel slides away (the address has already
 * lost `?issue=` by then). An address with something that is not a key (an old id) opens nothing here.
 */
export function MyWorkIssuePanel({ organizationId }: { organizationId: string }) {
  const { issueRef } = useIssuePanel();
  const projects = useProjects(organizationId);
  const key = issueRef?.match(/^([A-Za-z0-9]+)-\d+$/)?.[1]?.toUpperCase();
  const found = key ? projects.data?.find((project) => project.key === key) : undefined;
  const [shown, setShown] = useState<Project | undefined>(found);
  if (found && found.id !== shown?.id) setShown(found);
  if (!shown) return null;
  return <IssuePanel project={shown} />;
}
