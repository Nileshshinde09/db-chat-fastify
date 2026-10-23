import sqlglot
from sqlglot import exp
from fastapi import HTTPException

_FORBIDDEN = (
    exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter,
    exp.TruncateTable, exp.Command, exp.Copy, exp.Grant,
)

_DIALECT = {
    "postgres": "postgres",
    "mysql": "mysql",
    "mariadb": "mysql",
    "mssql": "tsql",
    "mongodb": None,          # not a SQL dialect — see error below
}


def assert_read_only(sql: str, db_type: str) -> None:
    """Reject anything that isn't a single SELECT/CTE/UNION."""
    dialect = _DIALECT.get(db_type)
    if dialect is None:
        raise HTTPException(400, f"Reports are not supported for {db_type}")

    try:
        statements = sqlglot.parse(sql, read=dialect)
    except sqlglot.errors.ParseError as e:
        raise HTTPException(400, f"Invalid SQL: {str(e)[:200]}") from None

    if len(statements) != 1:
        raise HTTPException(400, "Only a single statement is allowed.")

    stmt = statements[0]
    if not isinstance(stmt, (exp.Select, exp.Union)):
        raise HTTPException(400, "Only SELECT queries can be exported.")

    for node in stmt.walk():
        if isinstance(node, _FORBIDDEN):
            raise HTTPException(
                400, f"Forbidden operation: {type(node).__name__}"
            )