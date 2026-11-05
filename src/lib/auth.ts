import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { magicLink } from "better-auth/plugins/magic-link";
import { apiKey } from "@better-auth/api-key";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { deleteAccountData, isBlocked } from "@/lib/deletion";
import { sendEmail } from "@/lib/email";
import { MAGIC_LINK_MINUTES, PASSWORD_MIN } from "@/lib/sign-in-link";
import { deleteAccount, email, signInLink } from "@/lib/email-templates";

/** Bootstrap admins by user id; anyone with role "admin" is also an admin. */
export const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: "Roam Publish",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Keys come only from the dashboard (issueKey: one per person per graph, via auth.api on the
  // server). Over HTTP these would let anyone mint more, each with its own rate limit.
  disabledPaths: [
    "/api-key/create",
    "/api-key/update",
    // Passwords are set and changed only from Settings, and never reset by email (see emailAndPassword).
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/change-password",
  ],
  advanced: {
    // Behind Railway's edge proxy; without a resolvable IP, rate limiting
    // collapses into one shared bucket per path.
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },
  // Everyone logs in with an emailed link (magicLink below). A password is optional: people turn it on in
  // Settings (src/server/actions/account.ts), and can then log in with it too. Nobody signs up with one,
  // and there's no reset: someone who forgets theirs logs in with a link and sets a new one.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
  },
  user: {
    deleteUser: {
      enabled: true,
      // Deleting needs the link in this email, opened while signed in.
      sendDeleteAccountVerification: async ({ user, url }) => {
        void sendEmail({
          to: user.email,
          ...email(deleteAccount, { address: user.email, url }),
        });
      },
      beforeDelete: async (user) => {
        await deleteAccountData(user);
      },
    },
  },
  hooks: {
    // A suspended account's link fails when its session is made (the admin plugin), which would show
    // the browser a bare JSON error. Send it back to log in instead, like the link's other errors.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/magic-link/verify") return;
      const err = ctx.context.returned;
      if (!isAPIError(err) || err.body?.code !== "BANNED_USER") return;
      const back = new URL(String(ctx.query?.errorCallbackURL ?? "/login"), ctx.context.baseURL);
      back.searchParams.set("error", "BANNED_USER");
      throw ctx.redirect(back.toString());
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Emails of accounts deleted under a moderation action can't sign up again; see src/lib/deletion.ts.
        before: async (user) => {
          // The code makes the sign-in link redirect back to log in with this message (lib/sign-in-link.ts).
          if (await isBlocked("email", user.email))
            throw new APIError("BAD_REQUEST", {
              code: "EMAIL_BLOCKED",
              message: "This email can't be used on Roam Publish. Contact us if you think this is a mistake.",
            });
        },
      },
    },
  },
  plugins: [
    // Bans are enforced by this plugin on sign-in and session creation.
    admin({
      bannedUserMessage: "This account has been suspended. Check your email for details.",
    }),
    magicLink({
      expiresIn: MAGIC_LINK_MINUTES * 60,
      // Only a hash of the token is stored, so a database read can't be turned into a sign-in.
      storeToken: "hashed",
      sendMagicLink: async ({ email: to, url }) => {
        void sendEmail({
          to,
          ...email(signInLink, { address: to, url, minutes: String(MAGIC_LINK_MINUTES) }),
        });
      },
    }),
    apiKey({
      defaultPrefix: "rp_",
      enableMetadata: true,
      rateLimit: { enabled: true, timeWindow: 60 * 1000, maxRequests: 120 },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
