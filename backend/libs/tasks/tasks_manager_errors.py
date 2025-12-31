class TaskNotFoundError(Exception):
    """Exception raised when a task is not found."""

    def __init__(self, method_name: str):
        super().__init__(f"Task '{method_name}' not found.")
        self.method_name = method_name


class TaskAlreadyEnlistedError(Exception):
    """Exception raised when a task is already enlisted."""

    def __init__(self, method_name: str):
        super().__init__(f"Task '{method_name}' is already enlisted.")
        self.method_name = method_name


class WorkerNotFoundError(Exception):
    """Exception raised when a worker is not found."""

    def __init__(self, worker_name: str):
        super().__init__(f"Worker '{worker_name}' not found.")
        self.worker_name = worker_name


class WorkerAlreadyEnlistedError(Exception):
    """Exception raised when a worker is already enlisted."""

    def __init__(self, worker_name: str):
        super().__init__(f"Worker '{worker_name}' is already enlisted.")
        self.worker_name = worker_name
