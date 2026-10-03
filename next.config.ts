import type { NextConfig } from "next";

/**
 * Signed-in and account pages can't be put in a frame, so another site can't trick someone into
 * clicking through them (clickjacking). Published pages, collections, Discover and feeds stay
 * embeddable, so people can iframe them into Roam, Notion or a blog.
 */
const UNFRAMEABLE = [
  "dashboard",
  "admin",
  "settings",
  "onboarding",
  "setup",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
  "p",
].join("|");

const noFraming = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const everywhere = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Production only: on localhost it would pin the browser to https for every port.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: everywhere },
      { source: `/:area(${UNFRAMEABLE})`, headers: noFraming },
      { source: `/:area(${UNFRAMEABLE})/:rest*`, headers: noFraming },
    ];
  },
};

export default nextConfig;
