from typing import Optional

from pydantic import BaseModel


class Candidate(BaseModel):
    excel_name: str
    first: Optional[str] = None
    last: Optional[str] = None
    nni: Optional[str] = None
    inferred_category: Optional[str] = None
    inferred_group: Optional[str] = None
    inferred_department: Optional[str] = None
    source: Optional[str] = None


class Match(BaseModel):
    excel_name: str
    candidate: Candidate
    matched_contributor_id: Optional[str] = None
    # how the match was found: 'full' for NNI+category+group, 'nni' for unique NNI match, None when unmatched
    matched_by: Optional[str] = None


class ImportSummary(BaseModel):
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list = []
