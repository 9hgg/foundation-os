"""Merging a patch into what is stored, including saying that a key should go."""

from typing import ClassVar

from pydantic import BaseModel

from libs.utils.methods import REMOVE_VALUE, deep_update, deep_update_pydantic_object


class Config(BaseModel):
    """Carries whatever keys it is given, like a contact's or a template's config."""

    model_config: ClassVar[dict] = {"extra": "allow"}

    description: str | None = None


class Item(BaseModel):
    name: str = ""
    config: Config = Config()


def test_a_patch_merges_rather_than_replaces():
    assert deep_update({"a": 1, "b": 2}, {"b": 3}) == {"a": 1, "b": 3}


def test_the_remove_value_drops_the_key_instead_of_setting_it():
    assert deep_update({"a": 1, "b": 2}, {"b": REMOVE_VALUE}) == {"a": 1}


def test_removing_a_key_that_is_not_there_is_not_an_error():
    assert deep_update({"a": 1}, {"nope": REMOVE_VALUE}) == {"a": 1}


def test_it_reaches_a_nested_dict():
    stored = {"config": {"first_name": "Marie", "plan": "pro"}}
    assert deep_update(stored, {"config": {"first_name": REMOVE_VALUE}}) == {"config": {"plan": "pro"}}


def test_a_key_a_config_was_given_can_be_taken_back():
    """A config accepting arbitrary keys is where this is needed: the value is the key's own."""
    item = Item(name="one", config=Config(first_name="Marie", plan="pro"))
    deep_update_pydantic_object(item, {"config": {"first_name": REMOVE_VALUE}})
    assert item.config.model_dump() == {"description": None, "plan": "pro"}


def test_the_rest_of_the_patch_still_applies():
    item = Item(name="one", config=Config(first_name="Marie", plan="pro"))
    deep_update_pydantic_object(item, {"name": "two", "config": {"first_name": REMOVE_VALUE, "plan": "team"}})
    assert item.name == "two"
    assert item.config.model_dump() == {"description": None, "plan": "team"}


def test_a_declared_field_is_left_alone():
    """It has a type and a default, so it cannot simply cease to exist."""
    item = Item(name="one", config=Config(description="a note"))
    deep_update_pydantic_object(item, {"config": {"description": REMOVE_VALUE}})
    assert item.config.description == "a note"


def test_the_value_only_means_removal_where_a_patch_is_merged():
    """It is an ordinary string anywhere else, so a template saying "~null~" is untouched."""
    assert deep_update({"a": 1}, {"b": "not ~null~ really"}) == {"a": 1, "b": "not ~null~ really"}
