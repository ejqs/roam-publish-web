import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { apiKey } from "@better-auth/api-key";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { deleteAccountData, isBlocked } from "@/lib/deletion";
import { sendEmail } from "@/lib/email";

/** Bootstrap admins by user id; anyone with role "admin" is also an admin. */
export const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: "Roam Publish",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  advanced: {
    // Behind Railway's edge proxy; without a resolvable IP, rate limiting
    // collapses into one shared bucket per path.
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your Roam Publish password",
        text: `Reset your password: ${url}\n\nIf you didn't request this, ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your Roam Publish email",
        text: `Verify your email: ${url}`,
      });
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      // Deleting needs the link in this email, opened while signed in.
      sendDeleteAccountVerification: async ({ user, url }) => {
        void sendEmail({
          to: user.email,
          subject: "Confirm deleting your Roam Publish account",
          text:
            `Open this link to permanently delete your account, your graphs, their pages and your collections:\n${url}\n\n` +
            "This can't be undone. If you didn't ask for this, ignore this email.",
        });
      },
      beforeDelete: async (user) => {
        await deleteAccountData(user);
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Emails of accounts deleted under a moderation action can't sign up again; see src/lib/deletion.ts.
        before: async (user) => {
          // Not 403: sign-up turns a 403 into its generic "check your email" reply, and nothing would arrive.
          if (await isBlocked("email", user.email))
            throw new APIError("BAD_REQUEST", {
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
    apiKey({
      defaultPrefix: "rp_",
      enableMetadata: true,
      rateLimit: { enabled: true, timeWindow: 60 * 1000, maxRequests: 120 },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
