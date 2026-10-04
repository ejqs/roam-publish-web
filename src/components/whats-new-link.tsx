import { cookies } from "next/headers";
import { SEEN_COOKIE, whatsNewDot } from "@/lib/whats-new";
import { WhatsNewAnchor } from "./whats-new-anchor";

/** Where the dot is decided: on the server, from the seen cookie, so it's there on first paint. */
export async function whatsNewState() {
  return whatsNewDot((await cookies()).get(SEEN_COOKIE)?.value);
}

/**
 * The "What's new" link with its dot. `quietClassName` applies only while there's nothing new, so a
 * faded footer can fade it too and let it stand out when there is.
 */
export async function WhatsNewLink({
  className,
  quietClassName,
  version,
}: {
  className?: string;
  quietClassName?: string;
  version?: string;
}) {
  const { dot, plant } = await whatsNewState();
  return <WhatsNewAnchor dot={dot} plant={plant} version={version} className={dot ? className : `${className ?? ""} ${quietClassName ?? ""}`} />;
}
