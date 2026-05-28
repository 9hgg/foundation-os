from sqlalchemy import text
from sqlmodel import SQLModel

from libs.db import context_db

target_metadata = SQLModel.metadata
with context_db() as db:
    engine = db.get_bind()
    target_metadata.reflect(bind=engine)
    table_names = target_metadata.tables.keys()

    for table_name in table_names:
        print(table_name)
    table_to_purge = input("Enter the name of the table to purge: ")
    if table_to_purge not in table_names:
        print("Table not found")
    else:
        # safety check asking to enter number of rows
        current_count = db.execute(text(f"SELECT COUNT(*) FROM {table_to_purge}")).scalar()
        print(f"Table {table_to_purge} has {current_count} rows")
        # only the same number is accepted:
        count_to_confirm = input(f"Enter the number of rows to confirm deletion: ")
        if count_to_confirm != str(current_count):
            print("Confirmation failed, aborting")
        else:
            db.execute(text(f"DELETE FROM {table_to_purge}"))
            db.commit()
            print(f"Table {table_to_purge} purged")
