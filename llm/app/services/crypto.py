import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import settings

def _key() -> bytes:
    # Fastify's ENCRYPTION_KEY is typically base64 — decode it
    return base64.b64decode(settings.ENCRYPTION_KEY)

def decrypt(enc: str) -> str:
    """Decrypt a `v1.{iv}.{tag}.{ciphertext}` value produced by Fastify."""
    if not enc:
        return ""
    parts = enc.split(".")
    if len(parts) != 4 or parts[0] != "v1":
        raise ValueError(f"Unsupported ciphertext format: {parts[0] if parts else 'empty'}")
    _, iv_b64, tag_b64, ct_b64 = parts
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    ct = base64.b64decode(ct_b64)
    aesgcm = AESGCM(_key())
    # AESGCM expects ciphertext||tag together
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")