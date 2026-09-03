import { Link } from "@blueprintjs/core";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col w-full h-screen items-center justify-center">

      <div className="flex flex-row justify-between px-20 py-5 gap-10 sticky absolute top-0 border-b-2 bg-[#343A40] text-white">
        <div>Roam.pub</div>
        <div>share your <Link href="https://roamresearch.com" color="inherit">roam research</Link> <b>pages</b> and <b>blocks</b></div>
        <div className="flex gap-5">
          <Link href="/auth/signin" underline="hover" color="inherit">Sign in</Link>
          <Link href="/auth/signup" underline="hover" color="inherit">Sign up</Link>
        </div>
      </div>
      <div className="flex flex-row justify-end gap-2 p-5 items-end sticky translate-y-0  text-gray-400">
        this is a third-party service made by
        <Link href="https://ejqs.net" underline="hover" color="inherit">@ejqs</Link>
        <Link href="https://github.com/ejqs/roam-publish-web" underline="hover" color="inherit">github</Link>
        <Link href="/about/coffee" underline="hover" color="inherit">coffee</Link>
      </div>

    </div>

  );
}
