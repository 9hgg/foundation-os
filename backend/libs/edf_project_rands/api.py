from fastapi import APIRouter, Body

from libs.acl.models import Acl
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.files.models import File
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import (
    Activity,
    ActivityDeliverable,
    AnnualContribution,
    AnnualFacilityUsage,
    Batch,
    Contributor,
    Customer,
    Deliverable,
    Facility,
    Project,
    ProjectCostTrackingData,
    Purchase,
    PresentationContributionSnapshot,
    PresentationDeliverableSnapshot,
    PresentationFacilityUsageSnapshot,
    PresentationActivitySnapshot,
    PresentationBatchSnapshot,
    PresentationSnapshot,
)


def create_crud_edf_project_rands_router():
    router = APIRouter()

    router.include_router(
        create_crud_endpoints(
            Project,
            prefix="/api/edf/rand/projects",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Contributor,
            prefix="/api/edf/rand/contributors",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    # Custom endpoints: preview and import contributors from an existing File resource

    @router.post(
        "/api/edf/rand/contributors/preview-from-file", tags=["edf_rand_project"]
    )
    def preview_contributors_from_file(
        #
        fileId: str = Body(..., embed=True),
        classic_deps: ClassicDeps__dep = None,
    ) -> EndpointOutput[list]:
        current_user_db, _, _ = classic_deps

        # authorization checks: must be logged and verified admin
        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized (not a verified admin)",
                    code="unauthorized",
                )
            )

        try:
            from .methods.contributors.extractors import preview_contributors_from_file as preview_impl

            result = preview_impl(fileId)
            return EndpointOutput(result=result)
        except Exception as e:
            return EndpointOutput(
                error=EndpointError(
                    title="Preview failed", description=str(e), code="preview_failed"
                )
            )

    @router.post(
        "/api/edf/rand/contributors/import-from-file", tags=["edf_rand_project"]
    )
    def import_contributors_from_file(
        body: dict = Body(...), classic_deps: ClassicDeps__dep = None
    ) -> EndpointOutput[dict]:
        # expected body: { "fileId": "...", "onlyNames": ["Name1", ...] }
        current_user_db, _, _ = classic_deps

        # authorization checks
        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized (not a verified admin)",
                    code="unauthorized",
                )
            )

        try:
            file_id = body.get("fileId")
            only_names = body.get("onlyNames") or None
            from .methods.contributors.importer import import_contributors_from_file as import_impl

            result = import_impl(file_id, only_names, created_by_user_id=str(current_user_db.id))
            return EndpointOutput(result=result)
        except Exception as e:
            return EndpointOutput(
                error=EndpointError(
                    title="Import failed", description=str(e), code="import_failed"
                )
            )

    @router.post("/api/edf/rand/contributors/purge", tags=["edf_rand_project"])
    def purge_contributors(classic_deps: ClassicDeps__dep = None) -> EndpointOutput[dict]:
        current_user_db, _, _ = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized (not a verified admin)",
                    code="unauthorized",
                )
            )

        try:
            with context_db() as db:
                acl_deleted = db.query(Acl).filter(Acl.resource_kind == Contributor.__kind__).delete()
                contrib_deleted = db.query(Contributor).delete()
                db.commit()
            return EndpointOutput(
                result={"deleted_contributors": int(contrib_deleted), "deleted_acls": int(acl_deleted)}
            )
        except Exception as e:
            return EndpointOutput(
                error=EndpointError(title="Purge failed", description=str(e), code="purge_failed")
            )

    @router.post(
        "/api/edf/rand/projects/cost-followup-from-file", tags=["edf_rand_project"]
    )
    def get_project_cost_followup_from_file(
        body: dict = Body(...), classic_deps: ClassicDeps__dep = None
    ) -> EndpointOutput[ProjectCostTrackingData]:
        current_user_db, _, _ = classic_deps

        if not current_user_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized",
                    code="unauthorized",
                )
            )

        try:
            file_id = body.get("fileId")
            project_code = body.get("projectCode")
            from .methods.project_cost_followup import (
                get_project_cost_followup_from_file as impl,
            )

            result = impl(file_id=file_id, project_code=project_code)
            return EndpointOutput(result=result)
        except Exception as e:
            return EndpointOutput(
                error=EndpointError(
                    title="Cost follow-up failed",
                    description=str(e),
                    code="cost_followup_failed",
                )
            )

    router.include_router(
        create_crud_endpoints(
            Facility,
            prefix="/api/edf/rand/facilities",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Customer,
            prefix="/api/edf/rand/customers",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Batch,
            prefix="/api/edf/rand/batches",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Deliverable,
            prefix="/api/edf/rand/deliverables",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            AnnualContribution,
            prefix="/api/edf/rand/annual-contributions",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            AnnualFacilityUsage,
            prefix="/api/edf/rand/annual-facility-usages",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Activity,
            prefix="/api/edf/rand/activities",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            Purchase,
            prefix="/api/edf/rand/purchases",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    router.include_router(
        create_crud_endpoints(
            ActivityDeliverable,
            prefix="/api/edf/rand/activity-deliverables",
            tags=["edf_rand_project"],
            include_create=True,
            include_update=True,
            include_delete=True,
            include_patch=True,
        )
    )

    @router.get(
        "/api/edf/rand/projects/{project_id}/presentations/{presentation_id}/snapshot",
        tags=["edf_rand_project"],
    )
    def get_presentation_snapshot(
        project_id: str,
        presentation_id: str,
    ) -> EndpointOutput[PresentationSnapshot]:
        """
        Public endpoint — no authentication required.

        Return a full snapshot of a presentation catalog for a given project.

        Fetches the project, catalog, and for every batch all activities with:
        - deliverables (+ customer)
        - annual contributions (+ contributor)
        - annual facility usages (+ facility)
        - purchases

        Intentional N+1 loops — kept explicit so the data flow is easy to follow.
        """
        with context_db() as db:
            # 1. Project
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return EndpointOutput(
                    error=EndpointError(
                        title="Not found",
                        description="Project not found",
                        code="not_found",
                    )
                )

            # 2. Catalog (lives inside project.config)
            catalog = next(
                (c for c in project.config.presentation_catalogs if c.id == presentation_id),
                None,
            )
            if not catalog:
                return EndpointOutput(
                    error=EndpointError(
                        title="Not found",
                        description="Presentation catalog not found",
                        code="not_found",
                    )
                )

            # 3. Project-level persons
            main_customer = (
                db.query(Customer).filter(Customer.id == str(project.config.main_customer_id)).first()
                if project.config.main_customer_id
                else None
            )
            sponsor_customer = (
                db.query(Customer).filter(Customer.id == str(project.config.sponsor_customer_id)).first()
                if project.config.sponsor_customer_id
                else None
            )
            project_manager = (
                db.query(Contributor)
                .filter(Contributor.id == str(project.config.project_manager_contributor_id))
                .first()
                if project.config.project_manager_contributor_id
                else None
            )
            strategic_lead = (
                db.query(Contributor)
                .filter(Contributor.id == str(project.config.strategic_lead_contributor_id))
                .first()
                if project.config.strategic_lead_contributor_id
                else None
            )

            # 4. Batches
            batches = (
                db.query(Batch)
                .filter(Batch.project_id == project.id)
                .order_by(Batch.prefix)
                .all()
            )

            batch_snapshots: list[PresentationBatchSnapshot] = []

            for batch in batches:
                # 5. Activities per batch
                activities = (
                    db.query(Activity)
                    .filter(Activity.batch_id == batch.id)
                    .order_by(Activity.prefix)
                    .all()
                )

                activity_snapshots: list[PresentationActivitySnapshot] = []

                for activity in activities:
                    # 6a. Deliverables
                    activity_deliverables = (
                        db.query(ActivityDeliverable)
                        .filter(ActivityDeliverable.activity_id == activity.id)
                        .all()
                    )
                    deliverable_snapshots: list[PresentationDeliverableSnapshot] = []
                    for ad in activity_deliverables:
                        deliverable = (
                            db.query(Deliverable)
                            .filter(Deliverable.id == ad.deliverable_id)
                            .first()
                        )
                        if deliverable:
                            customer = (
                                db.query(Customer)
                                .filter(Customer.id == str(deliverable.customer_id))
                                .first()
                                if deliverable.customer_id
                                else None
                            )
                            deliverable_snapshots.append(
                                PresentationDeliverableSnapshot(
                                    deliverable=deliverable, customer=customer
                                )
                            )

                    # 6b. Annual contributions
                    contributions = (
                        db.query(AnnualContribution)
                        .filter(AnnualContribution.activity_id == activity.id)
                        .all()
                    )
                    contribution_snapshots: list[PresentationContributionSnapshot] = []
                    for contribution in contributions:
                        contributor = (
                            db.query(Contributor)
                            .filter(Contributor.id == str(contribution.contributor_id))
                            .first()
                        )
                        if contributor:
                            contribution_snapshots.append(
                                PresentationContributionSnapshot(
                                    contribution=contribution, contributor=contributor
                                )
                            )

                    # 6c. Facility usages
                    facility_usages = (
                        db.query(AnnualFacilityUsage)
                        .filter(AnnualFacilityUsage.activity_id == activity.id)
                        .all()
                    )
                    facility_usage_snapshots: list[PresentationFacilityUsageSnapshot] = []
                    for facility_usage in facility_usages:
                        facility = (
                            db.query(Facility)
                            .filter(Facility.id == str(facility_usage.facility_id))
                            .first()
                        )
                        if facility:
                            facility_usage_snapshots.append(
                                PresentationFacilityUsageSnapshot(
                                    facility_usage=facility_usage, facility=facility
                                )
                            )

                    # 6d. Purchases
                    purchases = (
                        db.query(Purchase)
                        .filter(Purchase.activity_id == activity.id)
                        .all()
                    )

                    activity_snapshots.append(
                        PresentationActivitySnapshot(
                            activity=activity,
                            deliverables=deliverable_snapshots,
                            contributions=contribution_snapshots,
                            facility_usages=facility_usage_snapshots,
                            purchases=purchases,
                        )
                    )

                batch_snapshots.append(
                    PresentationBatchSnapshot(batch=batch, activities=activity_snapshots)
                )

            cost_tracking_data = None
            if project.config.cost_tracking_file_id and project.code:
                try:
                    from .methods.project_cost_followup import (
                        get_project_cost_followup_from_file as _get_cost_followup,
                    )

                    cost_tracking_data = _get_cost_followup(
                        file_id=str(project.config.cost_tracking_file_id),
                        project_code=project.code,
                    )
                except Exception:
                    pass  # cost tracking is optional — silently skip if unavailable

            # Collect all unique file IDs referenced in activity updates and proposals
            all_file_ids: set[str] = set()
            for batch_snapshot in batch_snapshots:
                for activity_snapshot in batch_snapshot.activities:
                    config = activity_snapshot.activity.config
                    if config:
                        for update in config.updates or []:
                            all_file_ids.update(update.file_ids or [])
                        for proposal in config.proposals or []:
                            all_file_ids.update(proposal.file_ids or [])

            files_map: dict[str, File] = {}
            for file_id in all_file_ids:
                file = db.query(File).filter(File.id == file_id).first()
                if file:
                    files_map[file_id] = file

            snapshot = PresentationSnapshot(
                project=project,
                catalog=catalog,
                main_customer=main_customer,
                sponsor_customer=sponsor_customer,
                project_manager=project_manager,
                strategic_lead=strategic_lead,
                batches=batch_snapshots,
                cost_tracking_data=cost_tracking_data,
                files=files_map,
            )

            return EndpointOutput(result=snapshot)

    return router
