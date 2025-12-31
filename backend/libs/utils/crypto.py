from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()


def verify_secret(secret_clear: str, secret_hashed: str) -> bool:
    try:
        return ph.verify(secret_hashed, secret_clear)
    except VerifyMismatchError:
        return False


def hash_secret(secret: str) -> str:
    return ph.hash(secret)
