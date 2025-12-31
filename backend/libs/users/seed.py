import libs.utils.crypto
from libs.acl.methods import Who, create_default_acls
from libs.db import context_db
from libs.logger import print_color
from libs.utils.id import deterministic_uuid

from .models import User

USERS = [
    {"first_name": "joris", "email": "joris@banana.army", "acls": ["read", "write"]},
    {"first_name": "alice", "email": "alice@example.com", "acls": ["read"]},
    {"first_name": "bob", "email": "bob@example.com", "acls": ["read"]},
]


def seed_user_by_name(user: dict):
    # get the default app and create it if it doesn't exist
    user_id = deterministic_uuid(user["first_name"] + "_user")
    if not User.in_db(obj_id=user_id):
        print_color("cyan", "[users.seed] creating user", user_id)
        user_db = User(
            id=user_id,
            first_name=user["first_name"],
            email=user["email"],
            password_hashed=libs.utils.crypto.hash_secret("password"),
        )
        # need to create user directly to avoid "password_hashed" being excluded
        with context_db() as db:
            db.add(user_db)
            db.commit()
            create_default_acls(
                resource=user_db,
                who=Who.user,
                who_id=user_id,
                create_delete_acl="create" in user["acls"],
                create_read_acl="read" in user["acls"],
                create_write_acl="write" in user["acls"],
                _db=db,
            )


def seed():
    print_color("cyan", "[users.seed] seeding users")
    for user in USERS:
        seed_user_by_name(user)
    print_color("cyan", "[users.seed] done seeding users")
