import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.INVITE_ENCRYPTION_KEY;

  if (!key) {
    throw new Error("INVITE_ENCRYPTION_KEY is not configured");
  }

  const buffer = Buffer.from(key, "hex");

  if (buffer.length !== 32 || key.length !== 64) {
    throw new Error(
      "INVITE_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters",
    );
  }

  return buffer;
}

export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: IV:AUTH_TAG:CIPHERTEXT
  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) throw new Error("Not able to find the encrypted token");
  const parts = encryptedToken.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const ivHex = parts[0];
  const authTagHex = parts[1];
  const ciphertextHex = parts[2];

  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Missing encrypted token components");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  if (
    iv.length !== 12 ||
    authTag.length !== 16 ||
    ciphertext.length === 0 ||
    ![ivHex, authTagHex, ciphertextHex].every(
      (part) =>
        part.length > 0 && part.length % 2 === 0 && /^[0-9a-f]+$/i.test(part),
    )
  ) {
    throw new Error("Invalid encrypted token data");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
