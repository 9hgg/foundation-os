"""
Integration tests for CTE-based nested ACL access.

Verifies that resources are accessible through parent ACLs using
the CTE approach (eligible_acls -> readable_*_READ chain).
"""

import uuid
from unittest.mock import MagicMock

import pytest
import sqlmodel
from sqlalchemy.orm import Session
from sqlmodel import create_engine

from libs.acl.models import Acl, Operation, Who
from libs.endpoints.endpoints import apply_operation_access_filter
from libs.resource import Resource, SameAccessAs
from libs.teams.models import Membership


# ---------------------------------------------------------------------------
# Minimal resource hierarchy for these tests
# ---------------------------------------------------------------------------


class AclParent(Resource, table=True):
    __tablename__ = "test_acl_parents"
    __kind__ = "test_acl_parent"
    name: str = ""


class AclChild(Resource, table=True):
    __tablename__ = "test_acl_children"
    __kind__ = "test_acl_child"
    name: str = ""
    parent_id: uuid.UUID = sqlmodel.Field(foreign_key="test_acl_parents.id")


AclChild.__access_rules__ = (SameAccessAs(AclParent, local_field="parent_id"),)


class AclGrandchild(Resource, table=True):
    __tablename__ = "test_acl_grandchildren"
    __kind__ = "test_acl_grandchild"
    name: str = ""
    child_id: uuid.UUID = sqlmodel.Field(foreign_key="test_acl_children.id")


AclGrandchild.__access_rules__ = (SameAccessAs(AclChild, local_field="child_id"),)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_TABLES = [
    AclParent.__table__,
    AclChild.__table__,
    AclGrandchild.__table__,
    Acl.__table__,
    Membership.__table__,
]


@pytest.fixture(scope="module")
def engine(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "test_nested_acl.db"
    eng = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    # Only create the tables we need – avoids JSONB/ENUM issues with other models
    for tbl in _TABLES:
        tbl.create(eng, checkfirst=True)
    yield eng
    for tbl in reversed(_TABLES):
        tbl.drop(eng, checkfirst=True)


@pytest.fixture()
def db(engine):
    with Session(engine) as session:
        yield session
        session.rollback()


@pytest.fixture()
def user():
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.is_admin.return_value = False
    return mock_user


def _insert(db: Session, obj):
    db.add(obj)
    db.flush()
    return obj


def _make_acl(resource, operation: Operation, who: Who, who_id=None) -> Acl:
    return Acl(
        name=None,
        operation=operation,
        resource_kind=resource.__kind__,
        resource_id=resource.id,
        who=who,
        who_id=who_id,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_direct_acl_gives_access(db, user):
    """A resource with a direct ACL for the user is returned."""
    parent = _insert(db, AclParent(name="parent-direct"))
    acl = _insert(db, _make_acl(parent, Operation.READ, Who.user, user.id))

    query = db.query(AclParent)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclParent,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert any(r.id == parent.id for r in result)


def test_no_acl_denies_access(db, user):
    """A resource without any ACL is NOT returned."""
    parent = _insert(db, AclParent(name="parent-no-acl"))
    # no ACL inserted

    query = db.query(AclParent)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclParent,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert not any(r.id == parent.id for r in result)


def test_child_inherits_parent_acl(db, user):
    """A child resource is accessible when the parent has a READ ACL for the user."""
    parent = _insert(db, AclParent(name="parent-for-child"))
    child = _insert(db, AclChild(name="child", parent_id=parent.id))
    _insert(db, _make_acl(parent, Operation.READ, Who.user, user.id))

    query = db.query(AclChild)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclChild,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert any(r.id == child.id for r in result)


def test_child_without_parent_acl_denied(db, user):
    """A child is NOT returned when neither child nor parent have ACLs."""
    parent = _insert(db, AclParent(name="parent-no-acl2"))
    child = _insert(db, AclChild(name="child-no-access", parent_id=parent.id))

    query = db.query(AclChild)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclChild,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert not any(r.id == child.id for r in result)


def test_grandchild_inherits_through_two_levels(db, user):
    """A grandchild is accessible if the top-level grandparent has a READ ACL."""
    parent = _insert(db, AclParent(name="grandparent"))
    child = _insert(db, AclChild(name="child-mid", parent_id=parent.id))
    grandchild = _insert(db, AclGrandchild(name="grandchild", child_id=child.id))
    _insert(db, _make_acl(parent, Operation.READ, Who.user, user.id))

    query = db.query(AclGrandchild)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclGrandchild,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert any(r.id == grandchild.id for r in result)


def test_direct_child_acl_also_gives_access(db, user):
    """A child with a direct ACL is accessible even without parent ACL."""
    parent = _insert(db, AclParent(name="parent-no-direct-acl"))
    child = _insert(db, AclChild(name="child-with-direct-acl", parent_id=parent.id))
    _insert(db, _make_acl(child, Operation.READ, Who.user, user.id))

    query = db.query(AclChild)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclChild,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert any(r.id == child.id for r in result)


def test_connected_who_gives_access(db, user):
    """A resource with 'connected' ACL is accessible to any authenticated user."""
    parent = _insert(db, AclParent(name="parent-connected"))
    _insert(db, _make_acl(parent, Operation.READ, Who.connected, None))

    query = db.query(AclParent)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclParent,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert any(r.id == parent.id for r in result)


def test_other_user_acl_does_not_give_access(db, user):
    """A resource with a different user's ACL is NOT accessible to this user."""
    other_user_id = uuid.uuid4()
    parent = _insert(db, AclParent(name="parent-other-user"))
    _insert(db, _make_acl(parent, Operation.READ, Who.user, other_user_id))

    query = db.query(AclParent)
    result = apply_operation_access_filter(
        query=query,
        ResourceClass=AclParent,
        current_user_db=user,
        session=None,
        operation=Operation.READ,
    ).all()

    assert not any(r.id == parent.id for r in result)
