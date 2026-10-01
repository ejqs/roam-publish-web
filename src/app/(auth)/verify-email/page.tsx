import { AuthCard } from "@/components/auth-card";

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { email } = await props.searchParams;
  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          We sent a verification link to{" "}
          <strong className="text-foreground">{typeof email === "string" ? email : "your inbox"}</strong>.
          Click it to finish signing up — you&apos;ll continue to graph setup automatically.
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Didn&apos;t get it? Check spam, or try logging in again to resend the link.
      </p>
    </AuthCard>
  );
}
