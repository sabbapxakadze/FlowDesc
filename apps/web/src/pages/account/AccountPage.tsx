import { useAccount } from "../../entities/account";
import { ChangeEmailForm } from "../../features/change-email";
import { OAuthErrorNotice } from "../../entities/oauth";
import { ChangePasswordForm, SetPasswordForm } from "../../features/change-password";
import { SignInMethods } from "../../features/connected-accounts";
import { ApiTokens } from "../../features/manage-api-tokens";
import { TimezoneForm } from "../../features/set-timezone";
import { SignOutEverywhere } from "../../features/sign-out-everywhere";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, ErrorText, Page, PageHeader, Skeleton } from "../../shared/ui";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <section aria-label={title}>
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <p className="mt-1 mb-4 text-sm text-[var(--color-text-muted)]">{note}</p>}
        {!note && <div className="mb-4" />}
        {children}
      </section>
    </Card>
  );
}

/**
 * The private account page (owner's pick, 2026-10-05): email, password and timezone. The profile is what other people see;
 * this is only for the signed-in person, and the email and password changes ask for the current password.
 */
export function AccountPage() {
  const { user } = useAuth();
  const account = useAccount();

  return (
    <Page>
      <PageHeader title="Account" back={{ to: "/profile", label: "Edit profile", history: true }} />
      <OAuthErrorNotice />
      {account.isPending ? (
        <Skeleton className="h-48 w-full max-w-xl" />
      ) : account.isError ? (
        <ErrorText>Could not load your account: {account.error.message}</ErrorText>
      ) : (
        <div className="flex max-w-xl flex-col gap-5">
          <Section title="Email" note="Used to log in and for emails from FlowDesc. A new address is confirmed through a link sent to it.">
            <p className="mb-3 text-sm">
              <span className="font-medium">{account.data.email}</span>{" "}
              <span className="text-[var(--color-text-muted)]">{account.data.emailVerified ? "(verified)" : "(not verified yet)"}</span>
            </p>
            {account.data.pendingEmail && (
              <p role="status" className="mb-3 rounded-[var(--radius-control)] border border-[var(--color-text-warning)] px-3 py-2 text-sm text-[var(--color-text-warning)]">
                Waiting for you to open the link sent to <strong>{account.data.pendingEmail}</strong>. Until then your email stays{" "}
                {account.data.email}.
              </p>
            )}
            {account.data.hasPassword ? (
              <ChangeEmailForm />
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">To change your email, add a password first (in the Password section below).</p>
            )}
          </Section>
          <Section title="Sign-in methods" note="Besides your email and password, you can sign in with these. At least one way to sign in always stays.">
            <SignInMethods account={account.data} />
          </Section>
          {account.data.hasPassword ? (
            <Section title="Password" note="Other devices are signed out when you change it.">
              <ChangePasswordForm />
            </Section>
          ) : (
            <Section title="Password" note="You sign in with a provider and have no password yet. Adding one also lets you log in with your email. Other devices are signed out.">
              <SetPasswordForm />
            </Section>
          )}
          <Section title="Devices" note="Ends every session of your account, this one too. Use it if a device is lost or you left yourself logged in somewhere.">
            <SignOutEverywhere />
          </Section>
          <Section title="Access tokens" note="For apps that act on your behalf, such as an AI assistant. Each one can be revoked at any time.">
            <ApiTokens />
          </Section>
          <Section title="Timezone" note={"Used for the exact time you see when you point at a time like \u201c5 minutes ago\u201d."}>
            <TimezoneForm current={account.data.timezone} />
          </Section>
        </div>
      )}
      {user && <span className="sr-only">Signed in as {user.name}</span>}
    </Page>
  );
}
