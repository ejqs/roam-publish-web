import { permanentRedirect } from "next/navigation";

/** /collection/… is the long spelling of /c/…. */
export default async function CollectionAlias(props: PageProps<"/collection/[...rest]">) {
  const { rest } = await props.params;
  permanentRedirect(`/c/${rest.map(encodeURIComponent).join("/")}`);
}
