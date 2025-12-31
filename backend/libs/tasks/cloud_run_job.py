import asyncio
import os

from google.cloud import run_v2


def get_launch_ba_backend_production_job():
    cwd = os.getcwd()
    credentials_backend = os.path.join(cwd, "keys/sp-backend-prod-ec51b49debee.json")

    client: run_v2.JobsAsyncClient = run_v2.JobsAsyncClient.from_service_account_json(credentials_backend)
    project = "sp-backend-prod"
    location = "us-east1"
    job = "production-job"
    request = run_v2.RunJobRequest(
        name=f"projects/{project}/locations/{location}/jobs/{job}",
    )

    async def launch_ba_backend_production_job():
        operation = client.run_job(request=request)
        asyncio.create_task(operation)

    return launch_ba_backend_production_job
