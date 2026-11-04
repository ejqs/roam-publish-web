import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { signedInRedirect } from "@/lib/safe-next";
import { EmailLinkForm } from "../email-link-form";

export default async function SignupPage(props: PageProps<"/signup">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const { next } = await props.searchParams;
    const value = Array.isArray(next) ? next[0] : next;
    redirect(signedInRedirect(value));
  }

  return (
    <Suspense>
      <EmailLinkForm mode="signup" />
    </Suspense>
  );
}
