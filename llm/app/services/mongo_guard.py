from fastapi import HTTPException

_ALLOWED_OPS = {"find", "aggregate"}

# Stages that read data. Everything else is blocked by default.
_ALLOWED_STAGES = {
    "$match", "$group", "$project", "$sort", "$limit", "$skip",
    "$unwind", "$count", "$addFields", "$set", "$unset",
    "$replaceRoot", "$replaceWith", "$bucket", "$bucketAuto",
    "$facet", "$sample",
}

# Write / dangerous stages — always rejected.
_BLOCKED_STAGES = {
    "$out", "$merge",            # writes to a collection
    "$collStats", "$indexStats", "$planCacheStats",   # leak internals
    "$currentOp", "$listSessions", "$changeStream",   # admin
    "$unionWith",                # joins arbitrary collection
}

# Filter operators that execute code or bypass — always rejected.
_BLOCKED_FILTER_OPS = {"$where", "$function", "$accumulator", "$comment"}


def assert_mongo_read_only(plan) -> None:
    if not isinstance(plan, dict):
        raise HTTPException(400, "Mongo report plan must be a JSON object.")

    op = plan.get("operation")
    if op not in _ALLOWED_OPS:
        raise HTTPException(
            400, f"Mongo operation must be 'find' or 'aggregate', got {op!r}"
        )

    collection = plan.get("collection")
    if not collection or not isinstance(collection, str):
        raise HTTPException(400, "Missing 'collection'.")
    if collection.startswith("system."):
        raise HTTPException(400, "System collections are not allowed.")

    if op == "find":
        _validate_filter(plan.get("filter") or {})
        # reject unknown top-level keys
        allowed = {"operation", "collection", "filter", "projection", "sort", "limit"}
        extra = set(plan.keys()) - allowed
        if extra:
            raise HTTPException(400, f"Unknown plan keys: {sorted(extra)}")
        return

    # aggregate
    pipeline = plan.get("pipeline")
    if not isinstance(pipeline, list):
        raise HTTPException(400, "'pipeline' must be an array.")
    if not pipeline:
        raise HTTPException(400, "Pipeline cannot be empty.")
    for i, stage in enumerate(pipeline):
        if not isinstance(stage, dict) or len(stage) != 1:
            raise HTTPException(400, f"Stage {i} must be a single-key object.")
        key = next(iter(stage))
        if key in _BLOCKED_STAGES:
            raise HTTPException(400, f"Stage {key} is not allowed.")
        if key not in _ALLOWED_STAGES:
            raise HTTPException(
                400, f"Stage {key!r} is not in the allowlist. "
                     f"Allowed: {sorted(_ALLOWED_STAGES)}"
            )
        # also walk into $match / $facet / $group looking for blocked operators
        _walk_for_blocked(stage)


def _validate_filter(f):
    if not isinstance(f, dict):
        raise HTTPException(400, "Filter must be an object.")
    _walk_for_blocked(f)


def _walk_for_blocked(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in _BLOCKED_FILTER_OPS:
                raise HTTPException(400, f"Operator {k} is not allowed.")
            _walk_for_blocked(v)
    elif isinstance(node, list):
        for item in node:
            _walk_for_blocked(item)