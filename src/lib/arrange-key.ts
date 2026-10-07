import { createHash } from "node:crypto";

/** Changes whenever the saved arrangement does, so Arrange starts over from it after a save. */
export const arrangeKey = (saved: unknown) => createHash("sha1").update(JSON.stringify(saved)).digest("base64url");
