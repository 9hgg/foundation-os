from types import SimpleNamespace
from unittest.mock import MagicMock

from libs.i18n import api as i18n_api


def test_get_smart_translation_uses_cache_for_hit():
    i18n_api.SMART_TRANSLATION_CACHE.clear()
    db = MagicMock()
    translation = SimpleNamespace(translator="manual", translated_content="Bonjour")
    query = db.query.return_value
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = [translation]

    result_1 = i18n_api._get_smart_translation(db, "Hello", "fr", "ctx", "en")
    result_2 = i18n_api._get_smart_translation(db, "Hello", "fr", "ctx", "en")

    assert result_1 == "Bonjour"
    assert result_2 == "Bonjour"
    db.query.assert_called_once()


def test_get_smart_translation_caches_miss():
    i18n_api.SMART_TRANSLATION_CACHE.clear()
    db = MagicMock()
    query = db.query.return_value
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = []

    result_1 = i18n_api._get_smart_translation(db, "Hello", "fr", "ctx", "en")
    result_2 = i18n_api._get_smart_translation(db, "Hello", "fr", "ctx", "en")

    assert result_1 is None
    assert result_2 is None
    db.query.assert_called_once()


def test_build_smart_translation_cache_key_changes_with_inputs():
    key_1 = i18n_api._build_smart_translation_cache_key("Hello", "fr", "ctx-a", "en")
    key_2 = i18n_api._build_smart_translation_cache_key("Hello", "fr", "ctx-b", "en")
    key_3 = i18n_api._build_smart_translation_cache_key("Hello", "es", "ctx-a", "en")

    assert key_1 != key_2
    assert key_1 != key_3
