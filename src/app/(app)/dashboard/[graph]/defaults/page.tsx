import { permanentRedirect } from "next/navigation";

/** The Defaults tab became Sharing. */
export default async function GraphDefaultsAlias(props: PageProps<"/dashboard/[graph]/defaults">) {
  const { graph } = await props.params;
  permanentRedirect(`/dashboard/${graph}/sharing`);
}
