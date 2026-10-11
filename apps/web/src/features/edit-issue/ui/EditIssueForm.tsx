import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue, IssuePriority, IssueStatus } from "@flowdesk/contracts";
import { issueKeys, useAttachments } from "../../../entities/issue";
import { memberOptions, MentionEditor, useMembers } from "../../../entities/member";
import { ApiError } from "../../../shared/api/client";
import {
  Button,
  Dropdown,
  ErrorText,
  Field,
  Input,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
} from "../../../shared/ui";
import { LabelPicker } from "../../edit-issue-labels";
import { updateIssue } from "../api/updateIssue";
import { uploadDraftImage } from "../api/uploadDraftImage";

type FormValues = {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  // "YYYY-MM-DD", or "" for no due date (a date input's value is always a string).
  dueDate: string;
  // "" means unassigned (a <select> value is always a string).
  assigneeId: string;
};

const WATCHED_FIELDS = [
  ["title", "title"],
  ["description", "description"],
  ["status", "status"],
  ["priority", "priority"],
  ["dueDate", "due date"],
  ["assigneeId", "assignee"],
] as const;

/** Compares one field of the issue as the popup opened with it and as it is now ("" and no description are the same). */
const valueOf = (issue: Issue, field: (typeof WATCHED_FIELDS)[number][0]) =>
  field === "description" ? (issue.description ?? "") : (issue[field] ?? "");

/**
 * version isn't a form field — it's the version the caller already has
 * (issue.version, read when the list was fetched), attached at submit
 * time. That's the whole point of optimistic concurrency: the client
 * sends back what it read, not something it edits.
 *
 * On a version_conflict (409), this doesn't try to merge — it invalidates
 * the issue list (refetches the real current state), closes, and tells
 * the parent via onConflict so it can surface that to the user. Matches
 * the Phase 3 slice 2 plan's decision to keep conflict handling to
 * "refetch and show the real state," not a merge/retry UX.
 */
export function EditIssueForm({
  issue,
  organizationId,
  projectId,
  onDone,
  onConflict,
  onDirtyChange,
}: {
  issue: Issue;
  organizationId: string;
  projectId: string;
  onDone: () => void;
  onConflict: () => void;
  /** Tells the dialog whether there is unsaved text, so a stray click outside does not close it. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: {
      title: issue.title,
      description: issue.description ?? "",
      status: issue.status,
      priority: issue.priority,
      dueDate: issue.dueDate ?? "",
      assigneeId: issue.assigneeId ?? "",
    },
  });
  const { data: members } = useMembers(organizationId);
  // The pictures the description already shows (and any other file of the issue), so the editor can draw them (ADR 0063).
  const { data: files } = useAttachments(organizationId, projectId, issue.id);
  // True while a pasted picture is still uploading: Save waits, since the picture is not in the text yet.
  const [pictureUploading, setPictureUploading] = useState(false);
  // The issue as it was when the popup opened. `issue` keeps following live updates, the form's fields do not, so a save
  // resends the opening values and overwrites whatever someone else changed in the meantime. We only say so (no merge).
  const [openedWith] = useState(issue);
  const changedMeanwhile = WATCHED_FIELDS.filter(
    ([field]) => valueOf(issue, field) !== valueOf(openedWith, field),
  ).map(([, label]) => label);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateIssue(organizationId, projectId, issue.id, {
        version: issue.version,
        title: data.title,
        description: data.description,
        status: data.status,
        // Only when it changed: title/description/status are always resent
        // (existing behaviour), but a priority that did not change should not
        // write a "changed priority" line into the activity timeline.
        ...(data.priority !== issue.priority ? { priority: data.priority } : {}),
        // Same rule: only when it changed. An emptied date input is sent as null (remove the due date).
        ...(data.dueDate !== (issue.dueDate ?? "")
          ? { dueDate: data.dueDate === "" ? null : data.dueDate }
          : {}),
        // Same rule as priority: only when it changed. "" is sent as null (unassign).
        ...(data.assigneeId !== (issue.assigneeId ?? "")
          ? { assigneeId: data.assigneeId === "" ? null : data.assigneeId }
          : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      // The dedicated single-issue query (IssueDetailPage) needs its own
      // invalidation — it's no longer served from the list cache, so
      // invalidating the list alone would leave a stale detail view.
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
      // A successful update just wrote an issue.updated event — the
      // timeline (if anything is showing it) needs to pick that up too.
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issue.id) });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
        onConflict();
        onDone();
      }
    },
  });

  const showGenericError =
    mutation.isError &&
    !(mutation.error instanceof ApiError && mutation.error.code === "version_conflict");

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex flex-col gap-3"
    >
      {changedMeanwhile.length > 0 && (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--color-text-warning)] px-3 py-2 text-sm text-[var(--color-text-warning)]"
        >
          Someone changed this issue while you were editing:{" "}
          <b>{changedMeanwhile.join(", ")}</b>. Saving will overwrite their change.
        </p>
      )}
      <Field label="Title">
        <Input data-autofocus {...register("title", { required: true })} />
      </Field>

      {/* Not a <label>: it would wrap the editor's toolbar buttons, and a click on the word would press the first one. The editor names itself. */}
      <div className="flex flex-col gap-1.5 text-sm font-medium">
        <span>Description</span>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <MentionEditor
              organizationId={organizationId}
              value={field.value}
              onChange={field.onChange}
              ariaLabel="Description"
              uploadImage={async (file) => {
                const stored = await uploadDraftImage(
                  organizationId,
                  projectId,
                  issue.id,
                  file,
                );
                return { id: stored.id, url: stored.downloadUrl, name: stored.filename };
              }}
              images={files?.map((file) => ({ id: file.id, url: file.downloadUrl }))}
              onUploadingChange={setPictureUploading}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Dropdown
                value={field.value}
                onChange={field.onChange}
                options={STATUS_OPTIONS}
              />
            )}
          />
        </Field>

        <Field label="Priority">
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Dropdown
                value={field.value}
                onChange={field.onChange}
                options={PRIORITY_OPTIONS}
              />
            )}
          />
        </Field>

        <Field label="Due date">
          <Input type="date" {...register("dueDate")} />
        </Field>

        <Field label="Assignee">
          <Controller
            control={control}
            name="assigneeId"
            render={({ field }) => (
              <Dropdown
                value={field.value}
                onChange={field.onChange}
                options={[{ value: "", label: "Unassigned" }, ...memberOptions(members)]}
              />
            )}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        Labels
        <LabelPicker
          organizationId={organizationId}
          projectId={projectId}
          issueId={issue.id}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          pending={mutation.isPending}
          disabled={pictureUploading}
          variant="success"
        >
          {mutation.isPending
            ? "Saving…"
            : pictureUploading
              ? "Uploading picture…"
              : "Save"}
        </Button>
      </div>

      {showGenericError && <ErrorText>{mutation.error?.message}</ErrorText>}
    </form>
  );
}
