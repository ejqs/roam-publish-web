import { canStoreTokens } from "@/lib/append-token";
import { hasVerifiedGraph } from "@/lib/profiles";
import { requireSession } from "@/lib/session";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const session = await requireSession("/onboarding");
  const [{ graph }, hasGraph] = await Promise.all([props.searchParams, hasVerifiedGraph(session.user.id)]);
  return (
    <OnboardingFlow
      initialGraph={typeof graph === "string" ? graph : ""}
      hasGraph={hasGraph}
      changeLogAvailable={canStoreTokens()}
    />
  );
}
