import { createLucideIcon } from "lucide-react";

/** A padlock with an "E" on its body: password protection that is also encrypted at rest. */
export const LockEIcon = createLucideIcon("lock-e", [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "body" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "shackle" }],
  ["path", { d: "M14 15h-4v5h4M10 17.5h3", key: "e" }],
]);
