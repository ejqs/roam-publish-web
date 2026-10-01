import { requireSession } from "@/lib/session";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  await requireSession("/onboarding");
  const { graph } = await props.searchParams;
  return <OnboardingFlow initialGraph={typeof graph === "string" ? graph : ""} />;
}
