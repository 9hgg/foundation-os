import hashlib
import uuid


def deterministic_uuid(data: str):
    # Convert the input data to a string
    input_str = str(data)

    # Create an MD5 hash of the input data
    md5_hash = hashlib.md5(input_str.encode()).hexdigest()

    # Create a UUID based on the MD5 hash
    return uuid.UUID(md5_hash)
