import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { loginRequestSchema, type LoginRequest } from "@flowdesc/contracts";
import { useAuth } from "../../../shared/auth/useAuth";
import { withViewTransition } from "../../../shared/lib/motion";
import { Button, buttonVariants, ErrorText, Field, Input, PasswordInput } from "../../../shared/ui";
import { loginUser } from "../api/loginUser";

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (session) => {
      // Same deliberately-vague message either way — login errors don't
      // say whether it was the email or the password that was wrong (see
      // auth.service.ts), so the form has nothing more specific to show.
      // The login card cross-fades into the app (a View Transition, the same fade as the theme change) instead of cutting.
      withViewTransition(() => {
        login(session);
        void navigate("/");
      });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex flex-col gap-4"
    >
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} autoComplete="username" aria-invalid={errors.email ? true : undefined} className="w-full" />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <PasswordInput {...register("password")} autoComplete="current-password" aria-invalid={errors.password ? true : undefined} className="w-full" />
      </Field>

      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}

      <Button type="submit" variant="create" fullWidth pending={mutation.isPending}>
        {mutation.isPending ? "Logging in…" : "Log in"}
      </Button>

      <Link to="/forgot-password" className={buttonVariants({ variant: "link" })}>
        Forgot password?
      </Link>
    </form>
  );
}
