from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from pydantic import ConfigDict, field_validator
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.files.models import File
from libs.resource import Resource, ResourceWithConfig
from libs.utils.types import BaseModelWithConfig, to_camel

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
    description: Optional[str] = None
    local_sync_path: Optional[str] = None
    template: Optional[str] = None
    templates: Optional[dict[str, TemplateData]] = Field(default_factory=dict)
    data: dict[str, ProjectBasicDataType] = Field(default_factory=dict)
    pdf_options: Optional[dict[str, Any]] = Field(default_factory=dict)


class ProjectPresentationCustomSlide(BaseModelWithConfig):
    id: str
    label: str
    title: str
    subtitle: Optional[str] = None
    body_html: Optional[str] = None
    body_lines: list[str] = Field(default_factory=list)
    include_in_toc: Optional[bool] = True
    show_number: Optional[bool] = True
    catalog_slide_id: Optional[str] = None
    before_slide_id: Optional[str] = None
    after_slide_id: Optional[str] = None


class ProjectPresentationSlideCatalogEntry(BaseModelWithConfig):
    id: str
    label: str
    title: str
    subtitle: Optional[str] = None
    body_html: Optional[str] = None
    body_lines: list[str] = Field(default_factory=list)
    include_in_toc: Optional[bool] = True
    show_number: Optional[bool] = True


class ProjectPresentationCatalog(BaseModelWithConfig):
    id: str
    title: str
    description: Optional[str] = None
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
    main_customer_id: Optional[UUID] = None
    # commanditaire (id)
    sponsor_customer_id: Optional[UUID] = None
    # chef de projet (id)
    project_manager_contributor_id: Optional[UUID] = None
    # pilote stratégique (id)
    strategic_lead_contributor_id: Optional[UUID] = None
    cost_tracking_file_id: Optional[UUID] = None

    report_configs: Optional[dict[str, ReportConfig]] = None
    presentation_catalogs: list[ProjectPresentationCatalog] = Field(default_factory=list)
    presentation_slide_catalog: list[ProjectPresentationSlideCatalogEntry] = Field(
        default_factory=list
    )

    extra_properties: Optional[dict[str, ProjectBasicDataType]] = Field(
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
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

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

    group_manager: Optional[str] = None


class ProjectCostTrackingContributorSeries(BaseModelWithConfig):
    contributor_key: str
    contributor_name: str
    contributor_id: Optional[str] = None
    nni: Optional[str] = None
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

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None

    category: Optional[CategoryEnum] = None
    unit: Optional[str] = None
    department: Optional[str] = None
    group: Optional[str] = None
    NNI: Optional[str] = None

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

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    identifier: Optional[str] = None

    unit: Optional[str] = None


class Batch(Resource, table=True):
    """
    Batch (FR: Lot)
    A subdivision of a Project, grouping multiple Activities.
    """

    __tablename__ = "batches"
    __kind__ = "batch"
    __title__ = "Batch"

    title: str
    description: Optional[str] = None
    prefix: Optional[str] = None

    project_id: UUID = Field(
        foreign_key="projects.id", nullable=False, ondelete="CASCADE"
    )


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
    description: Optional[str] = None

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    contractual_end_date: Optional[datetime] = None
    is_principal: bool = False
    hidden: bool = False

    customer_id: Optional[UUID] = Field(
        default=None, foreign_key="customers.id", nullable=True, ondelete="SET NULL"
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

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

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

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

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
    date: Optional[datetime] = None
    source_kind: str = "other"
    source_name: Optional[str] = None
    file_ids: list[str] = Field(default_factory=list)
    links: list[ActivityUpdateLink] = Field(default_factory=list)
    title: Optional[str] = None
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
    date: Optional[datetime] = None
    title: Optional[str] = None
    content: str = ""
    answer_content: Optional[str] = None
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
    updates: Optional[list[ActivityUpdate]] = None
    proposals: Optional[list[ActivityProposal]] = None


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

    title: Optional[str] = None
    description: Optional[str] = None
    prefix: Optional[str] = None

    batch_id: UUID = Field(foreign_key="batches.id", nullable=False, ondelete="CASCADE")

    # Financials / Metadata
    priority: int = 0
    is_corporate: bool = False
    is_confirmed: bool = False
    hidden: bool = False

    finality: Optional[str] = None
    strategic_interests: Optional[str] = None
    synergies: Optional[str] = None
    risks: Optional[str] = None
    parades: Optional[str] = None

    tags: list[str] = Field(sa_type=JSONB, default_factory=list)
    config: ActivityConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: ActivityConfig().model_dump(),
    )


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
    description: Optional[str] = None
    supplier: Optional[str] = None
    details: Optional[str] = None

    min_estimated_cost: Optional[float] = None
    estimated_cost: Optional[float] = None
    max_estimated_cost: Optional[float] = None

    activity_id: UUID = Field(
        foreign_key="activities.id", nullable=False, ondelete="CASCADE"
    )


# --- Presentation Snapshot ---


class PresentationDeliverableSnapshot(BaseModelWithConfig):
    """Deliverable with its associated customer."""

    deliverable: Deliverable
    customer: Optional[Customer] = None


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
    main_customer: Optional[Customer] = None
    sponsor_customer: Optional[Customer] = None
    project_manager: Optional[Contributor] = None
    strategic_lead: Optional[Contributor] = None
    batches: list[PresentationBatchSnapshot]
    cost_tracking_data: Optional[ProjectCostTrackingData] = None
    # Map of fileId → File for all files referenced in activity updates and proposals
    files: dict[str, File] = Field(default_factory=dict)
