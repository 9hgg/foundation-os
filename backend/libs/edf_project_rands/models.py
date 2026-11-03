from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID, uuid4

import sqlmodel
from pydantic import field_validator
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.files.models import File
from libs.resource import CanReadIfReadOver, Resource, ResourceWithConfig, SameAccessAs
from libs.utils.types import BaseModelWithConfig

# --- Enums ---


class CategoryEnum(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"


class FacilityTypeEnum(str, Enum):
    TESTING = "testing"
    TRANSVERSE = "transverse"


# --- Models ---


class ProjectBasicDataType(BaseModelWithConfig):
    """Data for report generation."""

    key: str  # e.g. "abstract", "activity_details", etc.
    title: str  # e.g "Abstract", "Activity details", etc.
    kind: str  # e.g "text", "paragraph","quill", "date"...
    content: Any


class TemplateData(BaseModelWithConfig):
    """Data for report template generation."""

    key: str  # e.g. "style", "header", "footer", "summary_table", etc.
    title: str  # e.g. "style", "header", "footer", "summary_table", etc.
    content: Any


class ReportConfig(BaseModelWithConfig):
    title: str
    description: str | None = None
    local_sync_path: str | None = None
    template: str | None = None
    templates: dict[str, TemplateData] | None = Field(default_factory=dict)
    data: dict[str, ProjectBasicDataType] = Field(default_factory=dict)
    pdf_options: dict[str, Any] | None = Field(default_factory=dict)


class ProjectPresentationCustomSlide(BaseModelWithConfig):
    id: str
    label: str
    title: str
    subtitle: str | None = None
    body_html: str | None = None
    body_lines: list[str] = Field(default_factory=list)
    include_in_toc: bool | None = True
    show_number: bool | None = True
    catalog_slide_id: str | None = None
    before_slide_id: str | None = None
    after_slide_id: str | None = None


class ProjectPresentationSlideCatalogEntry(BaseModelWithConfig):
    id: str
    label: str
    title: str
    subtitle: str | None = None
    body_html: str | None = None
    body_lines: list[str] = Field(default_factory=list)
    include_in_toc: bool | None = True
    show_number: bool | None = True


class ProjectPresentationCatalog(BaseModelWithConfig):
    id: str
    title: str
    description: str | None = None
    selected_years: list[int] = Field(default_factory=list)
    included_batch_ids: list[str] = Field(default_factory=list)
    included_activity_ids: list[str] = Field(default_factory=list)
    ordered_slide_ids: list[str] = Field(default_factory=list)
    included_slide_ids: list[str] = Field(default_factory=list)
    hidden_slide_ids: list[str] = Field(default_factory=list)
    custom_slides: list[ProjectPresentationCustomSlide] = Field(default_factory=list)


class ProjectConfig(BaseModelWithConfig):
    __kind__ = "project_config"
    __description__ = "The config of a project."
    __title__ = "Project config"
    __private__ = False
    __category__ = "config"

    # client principal (id)
    main_customer_id: UUID | None = None
    # commanditaire (id)
    sponsor_customer_id: UUID | None = None
    # chef de projet (id)
    project_manager_contributor_id: UUID | None = None
    # pilote stratégique (id)
    strategic_lead_contributor_id: UUID | None = None
    cost_tracking_file_id: UUID | None = None

    report_configs: dict[str, ReportConfig] | None = None
    presentation_catalogs: list[ProjectPresentationCatalog] = Field(default_factory=list)
    presentation_slide_catalog: list[ProjectPresentationSlideCatalogEntry] = Field(
        default_factory=list
    )

    extra_properties: dict[str, ProjectBasicDataType] | None = Field(
        default_factory=dict
    )

    # model_config = ConfigDict(
    #     strict=False,
    #     extra="ignore",
    #     from_attributes=True,
    #     alias_generator=to_camel,
    #     populate_by_name=True,
    #     populate_by_alias=True,
    #     arbitrary_types_allowed=True,
    #     validate_assignment=True,
    #     # json_encoders={
    #     #     uuid.UUID: lambda v: str(v),
    #     #     # datetime.datetime: lambda v: v.isoformat(),
    #     #     # datetime.date: lambda v: v.isoformat(),
    #     #     # datetime.time: lambda v: v.isoformat(),
    #     # },
    # )


class Project(ResourceWithConfig, table=True):
    """
    Project (FR: Projet)
    Represents the highest level of the project hierarchy.
    """

    __tablename__ = "projects"
    __kind__ = "project"
    __title__ = "Project"
    __description__ = "R&D Project"
    __config_type__ = ProjectConfig

    name: str = Field(index=True)
    code: str = Field(index=True)  # e.g. P120T
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None

    config: ProjectConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: ProjectConfig().model_dump(),
    )

    # Relationships
    # batches: list["Batch"] = Relationship(
    #     back_populates="project", sa_relationship_kwargs={"cascade": "all, delete"}
    # )


class ContributorConfig(BaseModelWithConfig):
    __kind__ = "contributor_config"
    __description__ = "The config of a contributor."
    __title__ = "Contributor config"
    __private__ = False
    __category__ = "config"

    group_manager: str | None = None


class ProjectCostTrackingContributorSeries(BaseModelWithConfig):
    contributor_key: str
    contributor_name: str
    contributor_id: str | None = None
    nni: str | None = None
    monthly_hours: dict[str, float] = Field(default_factory=dict)
    total_hours: float = 0.0


class ProjectCostTrackingData(BaseModelWithConfig):
    file_id: str
    project_code: str
    months: list[str] = Field(default_factory=list)
    contributors: list[ProjectCostTrackingContributorSeries] = Field(default_factory=list)
    total_hours_by_month: dict[str, float] = Field(default_factory=dict)
    total_hours: float = 0.0


class Contributor(ResourceWithConfig, table=True):
    """
    Contributor (FR: Contributeur/Contributrice)
    An individual resource (agent) that contributes days to activities.
    """

    __tablename__ = "contributors"
    __kind__ = "contributor"
    __title__ = "Contributor"
    __config_type__ = ContributorConfig

    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None

    category: CategoryEnum | None = None
    unit: str | None = None
    department: str | None = None
    group: str | None = None
    NNI: str | None = None

    config: ContributorConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: ContributorConfig().model_dump(),
    )

    # Relationships
    # contributions: list["AnnualContribution"] = Relationship(back_populates="contributor")
    # customer_referents: list["Customer"] = Relationship(
    #     back_populates="referent", sa_relationship_kwargs={"primaryjoin": "Contributor.id==Customer.referent_id"}
    # )
    # customer_tech_referents: list["Customer"] = Relationship(
    #     back_populates="technical_referent", sa_relationship_kwargs={"primaryjoin": "Contributor.id==Customer.technical_referent_id"}
    # )

    @property
    def display_name(self) -> str:
        parts = []
        if self.first_name:
            parts.append(self.first_name)
        if self.last_name:
            parts.append(self.last_name)
        return " ".join(parts) if parts else f"<User:{self.id}>"


class Facility(Resource, table=True):
    """
    Facility (FR: Moyen d'essai / Moyen transverse)
    A resource (other than a person) used by activities, with an associated cost.
    """

    __tablename__ = "facilities"
    __kind__ = "facility"
    __title__ = "Facility"

    name: str
    type: FacilityTypeEnum

    # Relationships
    # activity_links: list["AnnualFacilityUsage"] = Relationship(back_populates="facility")


class Customer(Resource, table=True):
    """
    Customer (FR: Client)
    Entity requesting the work, associated with deliverables.
    """

    __tablename__ = "customers"
    __kind__ = "customer"
    __title__ = "Customer"

    first_name: str | None = None
    last_name: str | None = None
    identifier: str | None = None

    unit: str | None = None


class Batch(Resource, table=True):
    """
    Batch (FR: Lot)
    A subdivision of a Project, grouping multiple Activities.
    """

    __tablename__ = "batches"
    __kind__ = "batch"
    __title__ = "Batch"

    title: str
    description: str | None = None
    prefix: str | None = None

    project_id: UUID = Field(
        foreign_key="projects.id", nullable=False, ondelete="CASCADE"
    )
    __access_rules__ = (SameAccessAs(Project, local_field="project_id"),)


class ActivityDeliverable(Resource, table=True):
    """
    ActivityDeliverable
    Association table linking an Activity to a Deliverable.
    """

    __tablename__ = "activity_deliverables"
    __kind__ = "activity_deliverable"
    __title__ = "Activity Deliverable"

    activity_id: UUID = Field(
        foreign_key="activities.id", nullable=False, ondelete="CASCADE"
    )
    deliverable_id: UUID = Field(
        foreign_key="deliverables.id", nullable=False, ondelete="CASCADE"
    )


class Deliverable(Resource, table=True):
    """
    Deliverable (FR: Livrable)
    A tangible output expected by a Customer.
    """

    __tablename__ = "deliverables"
    __kind__ = "deliverable"
    __title__ = "Deliverable"

    title: str
    description: str | None = None

    start_date: datetime | None = None
    end_date: datetime | None = None
    contractual_end_date: datetime | None = None
    is_principal: bool = False
    hidden: bool = False

    customer_id: UUID | None = Field(
        default=None, foreign_key="customers.id", nullable=True, ondelete="SET NULL"
    )
    __access_rules__ = (
        CanReadIfReadOver(ActivityDeliverable, local_field="id", remote_field="deliverable_id"),
    )


class AnnualContribution(Resource, table=True):
    """
    AnnualContribution (FR: Contribution Annuelle)
    Association table linking an Activity to a Contributor for a specific year,
    specifying the number of days worked in that year.
    """

    __tablename__ = "annual_contributions"
    __kind__ = "annual_contribution"
    __title__ = "Annual Contribution"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)

    activity_id: UUID = Field(
        foreign_key="activities.id", nullable=False, ondelete="CASCADE"
    )
    contributor_id: UUID = Field(
        foreign_key="contributors.id", nullable=False, ondelete="CASCADE"
    )

    year: int = Field(..., description="The year of this contribution")
    days: float = 0.0


class AnnualFacilityUsage(Resource, table=True):
    """
    AnnualFacilityUsage (FR: Utilisation Annuelle de Moyen)
    Association table linking an Activity to a Facility (Moyen) for a specific year,
    specifying the cost for that year.
    """

    __tablename__ = "annual_facility_usages"
    __kind__ = "annual_facility_usage"
    __title__ = "Annual Facility Usage"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)

    activity_id: UUID = Field(
        foreign_key="activities.id", nullable=False, ondelete="CASCADE"
    )
    facility_id: UUID = Field(
        foreign_key="facilities.id", nullable=False, ondelete="CASCADE"
    )

    year: int = Field(..., description="The year of this facility usage")
    cost: float = 0.0


class ActivityUpdateLink(BaseModelWithConfig):
    title: str = ""
    url: str = ""


class ActivityUpdate(BaseModelWithConfig):
    id: str
    date: datetime | None = None
    source_kind: str = "other"
    source_name: str | None = None
    file_ids: list[str] = Field(default_factory=list)
    links: list[ActivityUpdateLink] = Field(default_factory=list)
    title: str | None = None
    content: str = ""

    @field_validator("links", mode="before")
    @classmethod
    def _normalize_links(cls, value: Any):
        if value is None:
            return []
        if not isinstance(value, list):
            return value

        normalized_links = []
        for item in value:
            if isinstance(item, str):
                normalized_links.append({"title": item, "url": item})
                continue
            normalized_links.append(item)
        return normalized_links


class ActivityProposal(BaseModelWithConfig):
    id: str
    kind: Literal["inflexion", "question", "proposal"] = "question"
    date: datetime | None = None
    title: str | None = None
    content: str = ""
    answer_content: str | None = None
    answered: bool | None = None
    file_ids: list[str] = Field(default_factory=list)
    links: list[ActivityUpdateLink] = Field(default_factory=list)

    @field_validator("links", mode="before")
    @classmethod
    def _normalize_links(cls, value: Any):
        if value is None:
            return []
        if not isinstance(value, list):
            return value

        normalized_links = []
        for item in value:
            if isinstance(item, str):
                normalized_links.append({"title": item, "url": item})
                continue
            normalized_links.append(item)
        return normalized_links


class ActivityConfig(BaseModelWithConfig):
    updates: list[ActivityUpdate] | None = None
    proposals: list[ActivityProposal] | None = None


class Activity(ResourceWithConfig, table=True):
    """
    Activity (FR: Activité)
    The smallest unit of work / estimation, belonging to a Batch (Lot).
    Aggregates costs from Contributions, Facilities, and Purchases.
    """

    __tablename__ = "activities"
    __kind__ = "activity"
    __title__ = "Activity"
    __config_type__ = ActivityConfig

    title: str | None = None
    description: str | None = None
    prefix: str | None = None

    batch_id: UUID = Field(foreign_key="batches.id", nullable=False, ondelete="CASCADE")

    # Financials / Metadata
    priority: int = 0
    is_corporate: bool = False
    is_confirmed: bool = False
    hidden: bool = False

    finality: str | None = None
    strategic_interests: str | None = None
    synergies: str | None = None
    risks: str | None = None
    parades: str | None = None

    tags: list[str] = Field(sa_type=JSONB, default_factory=list)
    config: ActivityConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: ActivityConfig().model_dump(),
    )
    __access_rules__ = (SameAccessAs(Batch, local_field="batch_id"),)


class Purchase(Resource, table=True):
    """
    Purchase (FR: Achat)
    External expense associated with an Activity.
    """

    __tablename__ = "purchases"
    __kind__ = "purchase"
    __title__ = "Purchase"

    title: str
    year: int
    description: str | None = None
    supplier: str | None = None
    details: str | None = None

    min_estimated_cost: float | None = None
    estimated_cost: float | None = None
    max_estimated_cost: float | None = None

    activity_id: UUID = Field(
        foreign_key="activities.id", nullable=False, ondelete="CASCADE"
    )
    __access_rules__ = (SameAccessAs(Activity, local_field="activity_id"),)


# --- Presentation Snapshot ---


class PresentationDeliverableSnapshot(BaseModelWithConfig):
    """Deliverable with its associated customer."""

    deliverable: Deliverable
    customer: Customer | None = None


class PresentationContributionSnapshot(BaseModelWithConfig):
    """Annual contribution with its contributor."""

    contribution: AnnualContribution
    contributor: Contributor


class PresentationFacilityUsageSnapshot(BaseModelWithConfig):
    """Annual facility usage with the facility details."""

    facility_usage: AnnualFacilityUsage
    facility: Facility


class PresentationActivitySnapshot(BaseModelWithConfig):
    """Activity with all its related data."""

    activity: Activity
    deliverables: list[PresentationDeliverableSnapshot]
    contributions: list[PresentationContributionSnapshot]
    facility_usages: list[PresentationFacilityUsageSnapshot]
    purchases: list[Purchase]


class PresentationBatchSnapshot(BaseModelWithConfig):
    """Batch with all its activities and their data."""

    batch: Batch
    activities: list[PresentationActivitySnapshot]


class PresentationSnapshot(BaseModelWithConfig):
    """
    Full snapshot of a project presentation catalog.
    Contains all data required to render a presentation page without N+1 queries.
    """

    project: Project
    catalog: ProjectPresentationCatalog
    main_customer: Customer | None = None
    sponsor_customer: Customer | None = None
    project_manager: Contributor | None = None
    strategic_lead: Contributor | None = None
    batches: list[PresentationBatchSnapshot]
    cost_tracking_data: ProjectCostTrackingData | None = None
    # Map of fileId → File for all files referenced in activity updates and proposals
    files: dict[str, File] = Field(default_factory=dict)


ActivityDeliverable.__access_rules__ = (
    SameAccessAs(Activity, local_field="activity_id"),
)
Customer.__access_rules__ = (
    CanReadIfReadOver(Deliverable, local_field="id", remote_field="customer_id"),
)
Contributor.__access_rules__ = (
    CanReadIfReadOver(AnnualContribution, local_field="id", remote_field="contributor_id"),
)
AnnualContribution.__access_rules__ = (
    SameAccessAs(Activity, local_field="activity_id"),
)
AnnualFacilityUsage.__access_rules__ = (
    SameAccessAs(Activity, local_field="activity_id"),
)
