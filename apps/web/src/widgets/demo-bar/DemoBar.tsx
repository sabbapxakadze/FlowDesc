import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { formatTimeLeft } from "../../entities/demo";
import { useEnterDemo } from "../../features/try-demo";
import { useAuth } from "../../shared/auth/useAuth";
import { useTimezone } from "../../shared/lib/timezone";
import { CONTACT_EMAIL } from "../../shared/lib/contact";
import { Button, buttonVariants } from "../../shared/ui";

/**
 * A slim bar at the top of the app for someone inside a "Try the demo" copy (ADR 0044), and nothing for a real organization: it says the data
 * is sample data, when the copy is deleted and how long is left (counting down), and once the time is up offers a new demo. The server
 * enforces the deadline (an expired copy is refused); this bar is the friendly warning before that.
 */
export function DemoBar() {
  const { organization } = useAuth();
  if (!organization?.demoExpiresAt) return null;
  const expiresAt = new Date(organization.demoExpiresAt).getTime();
  // Keyed by the deadline: starting a new demo mounts a fresh countdown, which reads the clock again at once (a countdown kept from the
  // old demo would show its up-to-15-seconds-old reading for the new one, "2 h 1 min left" on a fresh two-hour demo).
  return <Countdown key={expiresAt} expiresAt={expiresAt} />;
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const timezone = useTimezone();
  const [now, setNow] = useState(() => Date.now());
  const enter = useEnterDemo();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const left = expiresAt - now;
  const clock = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", timeZone: timezone ?? undefined }).format(expiresAt);

  return (
    <div
      role="status"
      data-testid="demo-bar"
      className="flex items-start gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-2 text-sm"
    >
      <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-text-link)]" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {left > 0 ? (
          <span>
            This is a demo with sample data. It is deleted at <strong>{clock}</strong> ({formatTimeLeft(left)} left).
          </span>
        ) : (
          <>
            <span>This demo has ended and its data is being deleted.</span>
            <Button type="button" variant="link" pending={enter.isPending} onClick={() => enter.mutate()}>
              {enter.isPending ? "Preparing your demo…" : "Start a new demo"}
            </Button>
          </>
        )}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("FlowDesc demo")}`}
          className={buttonVariants({ variant: "link" })}
        >
          Built by Saba. Get in touch
        </a>
      </div>
    </div>
  );
}
