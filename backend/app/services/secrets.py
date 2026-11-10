from base64 import urlsafe_b64encode
from secrets import token_bytes

from cryptography.fernet import Fernet
from fastapi import HTTPException


def generate_key() -> str:
    return urlsafe_b64encode(token_bytes(32)).decode()


class Cipher:
    """Encrypts provider secrets before they reach PostgreSQL.

    The master key lives only in configuration; losing it makes stored API keys
    unrecoverable, so it is never written to the database or returned anywhere.
    """

    missing = "缺少 KNOWRA_SECRET_KEY，无法安全保存模型密钥。请生成一个并写入部署配置。"

    def __init__(self, key=None):
        value = (key or "").strip()
        self.fernet = Fernet(value.encode()) if value else None

    def require(self):
        if self.fernet is None:
            raise HTTPException(503, self.missing)
        return self.fernet

    def encrypt(self, value: str) -> str:
        return self.require().encrypt(value.encode("utf-8")).decode()

    def decrypt(self, token: str) -> str:
        if not token:
            return ""
        try:
            return self.require().decrypt(token.encode()).decode("utf-8")
        except Exception:
            raise HTTPException(503, "模型密钥无法解密，KNOWRA_SECRET_KEY 与数据库记录不匹配。") from None
