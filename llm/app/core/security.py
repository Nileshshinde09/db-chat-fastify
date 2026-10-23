from dataclasses import dataclass
from fastapi import Header, HTTPException, status


@dataclass(frozen=True)
class UserContext:
    user_id: str
    organization_id: str


async def get_current_user(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_organization_id: str | None = Header(
        default=None, alias="X-Organization-Id"
    ),
) -> UserContext:
    """
    DEVELOPMENT ONLY identity dependency.
    Replace with verified JWT claims from your auth service before deployment.
    """
    print(x_user_id,x_organization_id)
    
    if not x_user_id or not x_organization_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if len(x_user_id) > 128 or len(x_organization_id) > 128:
        raise HTTPException(status_code=400, detail="Invalid identity")
    return UserContext(user_id=x_user_id, organization_id=x_organization_id)
