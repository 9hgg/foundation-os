
# MAX_FILE_SIZE = 1024 * 1024 * 1024 * 4  # = 4GB
# MAX_REQUEST_BODY_SIZE = MAX_FILE_SIZE + 1024


# def run_sync_code(fn, *args, **kwargs):
#     """To be used by "upload_trough_server
#     (Code in archives at this time)
#     """
#     executor = ThreadPoolExecutor(max_workers=1)
#     loop = get_event_loop()
#     loop.run_in_executor(executor, partial(fn, *args, **kwargs))


# class MaxBodySizeException(Exception):
#     def __init__(self, body_len: int):
#         self.body_len = body_len


# class MaxBodySizeValidator:
#     def __init__(self, max_size: int):
#         self.body_len: int = 0
#         self.max_size = max_size

#     def __call__(self, chunk: bytes):
#         self.body_len += len(chunk)
#         if self.body_len > self.max_size:
#             raise MaxBodySizeException(body_len=self.body_len)


    # @crud_file_router.post("/creation/upload")
    # @crud_file_router.post("/creation/upload/")
    # async def upload(
    #     #
    #     request: Request,
    #     current_storage: CurrentStorage__dep,
    #     # background_tasks: BackgroundTasks,
    # ):
    #     if current_app_db is None:
    #         return EndpointOutput(
    #             error=EndpointError(
    #                 title="App not found",
    #                 description=(
    #                     "The app you are trying to upload a file to does not exist"
    #                 ),
    #                 code="app_not_found",
    #             )
    #         )
    #     if current_storage is None:
    #         return EndpointOutput(
    #             error=EndpointError(
    #                 title="Storage not found",
    #                 description=(
    #     "The storage you are trying to upload a file to does not exist"
    #                 ),
    #                 code="storage_not_found",
    #             )
    #         )

    #     body_validator = MaxBodySizeValidator(MAX_REQUEST_BODY_SIZE)

    #     file_targets = {}
    #     nb_files = 0

    #     try:
    #         headers = request.headers
    #         nb_files = headers.get("nb-files", 0)
    #         if nb_files == 0:
    #             raise HTTPException(
    #                 status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    #                 detail="nb-files header is missing",
    #             )
    #         parser =
    # streaming_form_data.parser.StreamingFormDataParser(headers=headers)
    #         for i in range(int(nb_files)):
    #             file_id = str(uuidv4())
    #             filepath = os.path.join(
    #                 "uploads",
    #                 file_id,
    #             )

    #             file_target = streaming_form_data.targets.FileTargetCallback(
    #                 filepath,
    #                 True,
    #                 lambda x: print(
    #                     "File uploaded", file_id, file_target.multipart_filename, x
    #                 ),
    #             )
    #             sha256_target = streaming_form_data.targets.SHA256Target()

    #             form_data_field = "file-" + str(i)
    #             file_targets[file_id] = {
    #                 "file_target": file_target,
    #                 "sha256_target": sha256_target,
    #                 "id": file_id,
    #             }
    #             parser.register(form_data_field, file_target)
    #             parser.register(form_data_field, sha256_target)

    #         async for chunk in request.stream():
    #             body_validator(chunk)
    #             parser.data_received(chunk)

    #         for file_target_id, file_data in file_targets.items():
    #             run_sync_code(
    #                 upload_file_to_storage,
    #                 storage=current_storage,
    #                 file_id=file_target_id,
    #                 app_id=current_app_db.id,
    #                 local_path=file_data["file_target"].filename,
    #                 storage_path=file_target_id,
    #                 content_type=file_data["file_target"].multipart_content_type,
    #             )
    #     except ClientDisconnect:
    #         print_warning("Client Disconnected")
    #     except MaxBodySizeException as e:
    #         raise HTTPException(
    #             status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    #             detail=(
    #                 f"Maximum request body size limit \
    #                     ({MAX_REQUEST_BODY_SIZE} bytes) \
    #                         exceeded ({e.body_len} bytes read)"
    #             ),
    #         )
    #     except streaming_form_data.validators.ValidationError:
    #         raise HTTPException(
    #             status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    #             detail=f"Maximum file size limit ({MAX_FILE_SIZE} bytes) exceeded",
    #         )
    #     except Exception:
    #         raise HTTPException(
    #             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    #             detail="There was an error uploading the file",
    #         )

    #     return {"message": f"Successfuly uploaded {nb_files}  files"}

    # @crud_file_router.websocket("/creation/upload/ws/{file_id}")
    # async def websocket_endpoint(
    # websocket: WebSocket, file_id: str):
    #     await websocket.accept()

    #     try:
    #         while True:
    #             # Fetch the file status
    #             file = File.get(db, resource_id=file_id)
    #             file_status = "completed" if file is not None else "not_found"

    #             # Send the status to the client
    #             await websocket.send_json({"file_id": file_id, "status": file_status})

    #             # If the task is completed, you can break the loop
    #             if file_status == "completed":
    #                 break

    #             # Wait for some time before checking the status again
    #             await asyncio.sleep(5)
    #     except WebSocketDisconnect:
    #         # Handle WebSocket disconnection if needed
    #         pass
    #     finally:
    #         await websocket.close()
