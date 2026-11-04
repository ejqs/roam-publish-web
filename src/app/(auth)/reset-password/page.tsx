import { redirect } from "next/navigation";

/** Accounts log in with an emailed link now, so links to the old password pages land on log in. */
export default function Page() {
  redirect("/login");
}
