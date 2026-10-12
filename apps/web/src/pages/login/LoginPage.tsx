import { Link } from "react-router";
import { OAuthErrorNotice } from "../../entities/oauth";
import { LoginForm } from "../../features/login-user";
import { OAuthButtons } from "../../features/oauth-sign-in";
import { buttonVariants, NavigationNotice } from "../../shared/ui";

export function LoginPage() {
  return (
    <main>
      <NavigationNotice />
      <OAuthErrorNotice />
      <h1 className="font-display text-3xl font-normal">Log in</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-text-muted)]">Welcome back to your workspace.</p>
      <OAuthButtons />
      <LoginForm />
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        New to FlowDesc?{" "}
        <Link to="/register" className={buttonVariants({ variant: "link" })}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
