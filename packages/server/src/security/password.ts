import * as argon2 from "argon2";

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
