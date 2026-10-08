import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { notConfigured } from "@/lib/http/errors";

/**
 * AES-256-GCM envelope for OAuth tokens at rest. The key is derived from
 * KAMI_TOKEN_ENCRYPTION_KEY (generate with `openssl rand -base64 32`).
 */

export interface SealedValue {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function key(): Buffer {
  const secret = env().KAMI_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw notConfigured(
      "KAMI_TOKEN_ENCRYPTION_KEY must be set (at least 32 characters) before connecting accounts — generate one with `openssl rand -base64 32`",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): SealedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function isSealed(value: unknown): value is SealedValue {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as SealedValue).v === 1 &&
    "tag" in (value as object),
  );
}

export function unseal<T>(sealed: SealedValue): T {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}
