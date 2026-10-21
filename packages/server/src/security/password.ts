import * as argon2 from "argon2";

/** Argon2id dummy hash used to equalize credential-verification work for unknown accounts. */
export const DUMMY_ARGON2ID_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$AHApo5m5DGT6zKjrS09uXw$lGqa37zJwlxc7HkKTOkZT+Tkm+oVpzvjP3WhvX3uoQE";

const passwordHashOptions: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1
};

/** Hash credentials with Argon2id using the project security baseline. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordHashOptions);
}

/** Compare a plaintext credential to its encoded Argon2 hash. */
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
