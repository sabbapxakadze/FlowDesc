import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccountResponseSchema } from "@flowdesc/contracts";
import { accountKeys } from "../../../entities/account";
import { apiPatch } from "../../../shared/api/client";
import { browserTimezone, setTimezone } from "../../../shared/lib/timezone";
import { Dropdown, ErrorText } from "../../../shared/ui";

/**
 * Choose the timezone times are shown in (the date and time next to anything older than a day, and the exact time when you point at "5 minutes
 * ago"). The first choice is the browser's own, which is the default. Saved at once; the rest of the app picks it up through the timezone store.
 */
export function TimezoneForm({ current }: { current: string | null }) {
  const queryClient = useQueryClient();
  const options = useMemo(
    () => [
      { value: "", label: `Browser setting (${browserTimezone()})` },
      ...Intl.supportedValuesOf("timeZone").map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") })),
    ],
    [],
  );
  const mutation = useMutation({
    mutationFn: (timezone: string | null) => apiPatch("/v1/users/me/timezone", { timezone }, getAccountResponseSchema),
    onSuccess: (response) => {
      setTimezone(response.data.timezone);
      queryClient.setQueryData(accountKeys.me, response.data);
    },
  });
  const zone = current ?? browserTimezone();
  const now = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date());

  return (
    <div className="flex max-w-md flex-col gap-2">
      <Dropdown
        aria-label="Timezone"
        value={current ?? ""}
        onChange={(value) => mutation.mutate(value === "" ? null : value)}
        options={options}
        disabled={mutation.isPending}
      />
      <p className="text-sm text-[var(--color-text-muted)]">
        Now, in this timezone: <strong className="text-[var(--color-text-default)]">{now}</strong>
      </p>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </div>
  );
}
