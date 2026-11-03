
from pydantic import BaseModel


class Candidate(BaseModel):
    excel_name: str
    first: str | None = None
    last: str | None = None
    nni: str | None = None
    inferred_category: str | None = None
    inferred_group: str | None = None
    inferred_department: str | None = None
    source: str | None = None


class Match(BaseModel):
    excel_name: str
    candidate: Candidate
    matched_contributor_id: str | None = None
    # how the match was found: 'full' for NNI+category+group, 'nni' for unique NNI match, None when unmatched
    matched_by: str | None = None


class ImportSummary(BaseModel):
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list = []
