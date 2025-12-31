import typing

from fastapi import Depends

from .methods import get_translator
from .models import SimpleTranslator

Translator__dep = typing.Annotated[SimpleTranslator, Depends(get_translator)]
