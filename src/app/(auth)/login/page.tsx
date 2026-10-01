import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { signedInRedirect } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const { next } = await props.searchParams;
    const value = Array.isArray(next) ? next[0] : next;
    redirect(signedInRedirect(value));
  }

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
