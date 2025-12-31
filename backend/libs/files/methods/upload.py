# def upload_file_to_storage(
#     storage: GenericStorage,
#     file_id: uuid.UUID,
#     app_id: uuid.UUID,
#     local_path: str,
#     storage_path: str,
#     content_type: str | None = None,
# ):
#     """
#     Upload a file to the storage, create the File db and delete the local file.

#     Args:
#         db (Session): _description_
#         storage (GenericStorage): _description_
#         file_id (uuid.UUID): _description_
#         app_id (uuid.UUID): _description_
#         local_path (str): _description_
#         storage_path (str): _description_
#     """
#     # upload
#     print("uploading file", local_path, storage_path)
#     uploaded = storage.upload(
#         local_path=local_path, storage_path=storage_path, content_type=content_type
#     )
#     print("uploaded", uploaded)

#     # delete local file
#     print("deleting local file", local_path)
#     delete_local_file(local_path)
#     print("deleted local file", local_path)

#     if uploaded:
#         print("creating File db")
#         # create File db
#         file = File(
#             id=file_id,
#             app_id=app_id,
#             storage_path=storage_path,
#             # original_filename="",
#             # public_filename="",
#             # description="",
#             # extension="",
#             # kind="",
#             # extension_client="",
#             # kind_client="",
#             # unprocessable=False,
#             # mime="",
#             # size=0,
#             # duration=0,
#             # has_audio=False,
#             # has_video=False,
#             storage_id=storage.storage_settings.id,
#         )
#         with context_db() as db:
#             File.create(db, obj=file)
#         print("created File db")
#     else:
#         print("not creating File db")
