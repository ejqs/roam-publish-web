import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center">
      <header className="flex flex-row items-center justify-between gap-10 border-b-2 bg-[#343a40] px-20 py-5 text-base text-white">
        <div>Roam Publish</div>
        <div>
          share your{" "}
          <Button
            variant="link"
            className="h-auto p-0 text-base text-inherit"
            nativeButton={false}
            render={<a href="https://roamresearch.com" />}
          >
            roam research
          </Button>{" "}
          <strong>pages</strong> and <strong>blocks</strong>
        </div>
        <nav className="flex gap-5" aria-label="Account">
          <Button
            variant="link"
            className="h-auto p-0 text-base text-inherit"
            nativeButton={false}
            render={<Link href="/auth/sign-in" />}
          >
            Sign in
          </Button>
          <Button
            variant="link"
            className="h-auto p-0 text-base text-inherit"
            nativeButton={false}
            render={<Link href="/auth/sign-up" />}
          >
            Sign up
          </Button>
        </nav>
      </header>

      <footer className="flex flex-row items-end justify-end gap-2 p-5 text-base text-gray-400">
        this is a third-party service made by
        <Button variant="link" className="h-auto p-0 text-base text-inherit" nativeButton={false} render={<a href="https://ejqs.net" />}>@ejqs</Button>
        <Button variant="link" className="h-auto p-0 text-base text-inherit" nativeButton={false} render={<a href="https://github.com/ejqs/roam-publish-web" />}>github</Button>
        <Button variant="link" className="h-auto p-0 text-base text-inherit" nativeButton={false} render={<Link href="/about/coffee" />}>coffee</Button>
      </footer>
    </div>
  );
}
