import { createLucideIcon } from "lucide-react";

/**
 * A padlock with an "E" on its body: password protection that is also encrypted at rest. The body
 * is taller and the E thinner than a plain lock's proportions so the letter still reads at 12px.
 */
export const LockEIcon = createLucideIcon("lock-e", [
  ["rect", { width: "18", height: "12", x: "3", y: "10", rx: "2", key: "body" }],
  ["path", { d: "M7 10V7a5 5 0 0 1 10 0v3", key: "shackle" }],
  ["path", { d: "M14.5 13.5h-5v5h5M9.5 16h4", strokeWidth: 1.5, key: "e" }],
]);
