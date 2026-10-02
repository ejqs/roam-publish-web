import { randomInt } from "node:crypto";

/** A random id of `length` characters from `alphabet`, using a CSPRNG. */
export const randomId = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
