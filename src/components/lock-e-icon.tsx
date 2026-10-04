import type { ComponentProps } from "react";

/** A padlock with an "E" on its body: password protection that is also encrypted at rest. */
export function LockEIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <path d="M14 15h-4v5h4M10 17.5h3" strokeWidth={1.5} />
    </svg>
  );
}
