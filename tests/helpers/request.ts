/** The pretend request that the mocked next/headers reads from. Reset between tests. */
export const request = {
  headers: new Headers(),
  cookies: new Map<string, string>(),
  after: [] as (() => unknown)[],
  emails: [] as string[],
};

export function resetRequest(init: { ip?: string } = {}) {
  request.headers = new Headers(init.ip ? { "x-real-ip": init.ip, "x-forwarded-for": init.ip } : {});
  request.cookies = new Map();
  request.after = [];
  request.emails = [];
}

/** Runs everything queued with after(), like Next does once the response is sent. */
export async function runAfter() {
  while (request.after.length) await request.after.shift()!();
}
