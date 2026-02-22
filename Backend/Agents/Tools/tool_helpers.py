"""
Tool Helpers
=============
Utilities shared across all Strands tools.

The Strands SDK ``@tool`` decorator inspects return values for ``status``
and ``content`` keys.  If they are missing the SDK stringifies the result
via ``str()``, which downstream code cannot iterate with ``.items()``.

``strands_result`` wraps any dict payload in the format the SDK expects,
using ``json.dumps`` (proper JSON) instead of ``str()`` (Python repr).
"""

import json
from typing import Any


def strands_result(data: Any, status: str = "success") -> dict:
    """Wrap *data* in the Strands SDK tool-return envelope.

    Returns ``{"status": status, "content": [{"text": json_string}]}``.
    """
    return {
        "status": status,
        "content": [{"text": json.dumps(data, default=str)}],
    }
