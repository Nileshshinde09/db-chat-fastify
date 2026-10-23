import os
import cloudinary
import cloudinary.uploader
import cloudinary.api
from typing import Optional, List, Dict, Any


class CloudinaryFileManager:
    """
    A utility class for uploading, deleting, listing, and managing
    CSV and Excel files on Cloudinary as 'raw' resources.

    Usage:
        manager = CloudinaryFileManager(
            cloud_name="your_cloud",
            api_key="your_key",
            api_secret="your_secret"
        )
        # Or rely on CLOUDINARY_URL environment variable
        manager = CloudinaryFileManager()
    """

    ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

    def __init__(
        self,
        cloud_name: Optional[str] = None,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        secure: bool = True,
    ):
        """
        Initialize Cloudinary configuration.

        If credentials are not passed explicitly, the SDK reads
        the CLOUDINARY_URL environment variable automatically.
        """
        if cloud_name and api_key and api_secret:
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret,
                secure=secure,
            )
        # else: assume CLOUDINARY_URL is set in the environment

    # ------------------------------------------------------------------
    # Validation helper
    # ------------------------------------------------------------------
    def _validate_file(self, file_path: str) -> None:
        """Raise ValueError if the file does not exist or has an unsupported extension."""
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type '{ext}'. "
                f"Allowed extensions: {', '.join(sorted(self.ALLOWED_EXTENSIONS))}"
            )

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------
    def upload_file(
        self,
        file_path: str,
        public_id: Optional[str] = None,
        folder: Optional[str] = None,
        overwrite: bool = False,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Upload a CSV or Excel file to Cloudinary as a raw resource.

        Args:
            file_path: Local path to the .csv / .xlsx / .xls file.
            public_id: Optional custom public ID (without extension).
            folder: Optional folder name to organise assets.
            overwrite: Whether to overwrite an existing asset with the same public_id.
            tags: Optional list of tags to attach.
            **kwargs: Extra options passed to cloudinary.uploader.upload.

        Returns:
            The full Cloudinary upload response dictionary.
        """
        self._validate_file(file_path)

        options: Dict[str, Any] = {
            "resource_type": "raw",   # required for CSV / Excel[reference:2]
            "overwrite": overwrite,
        }
        if public_id:
            options["public_id"] = public_id
        if folder:
            options["folder"] = folder
        if tags:
            options["tags"] = tags
        options.update(kwargs)

        result = cloudinary.uploader.upload(file_path, **options)
        return result

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------
    def delete_file(
        self,
        public_id: str,
        invalidate: bool = True,
    ) -> Dict[str, Any]:
        """
        Delete a single raw file from Cloudinary.

        Args:
            public_id: The public ID of the asset (including extension if present).
            invalidate: Whether to invalidate CDN cache.

        Returns:
            Cloudinary destroy response.
        """
        return cloudinary.uploader.destroy(
            public_id,
            resource_type="raw",      # must be raw for CSV/Excel[reference:3]
            invalidate=invalidate,
        )

    def delete_files(
        self,
        public_ids: List[str],
        invalidate: bool = True,
    ) -> Dict[str, Any]:
        """
        Delete multiple raw files in one Admin API call (up to 100 IDs).

        Args:
            public_ids: List of public IDs to delete.
            invalidate: Whether to invalidate CDN cache.

        Returns:
            Cloudinary delete_resources response.
        """
        if not public_ids:
            return {"deleted": {}}

        return cloudinary.api.delete_resources(
            public_ids,
            resource_type="raw",
            invalidate=invalidate,
        )

    # ------------------------------------------------------------------
    # List / search
    # ------------------------------------------------------------------
    def list_files(
        self,
        prefix: Optional[str] = None,
        folder: Optional[str] = None,
        max_results: int = 100,
        next_cursor: Optional[str] = None,
        tags: bool = False,
        context: bool = False,
    ) -> Dict[str, Any]:
        """
        List raw files stored on Cloudinary.

        Args:
            prefix: Filter by public_id prefix.
            folder: Filter by folder name.
            max_results: Number of results per page (max 500).
            next_cursor: Cursor for pagination.
            tags: Include tags in the response.
            context: Include contextual metadata.

        Returns:
            Cloudinary resources response with 'resources' and 'next_cursor'.
        """
        options: Dict[str, Any] = {
            "resource_type": "raw",
            "type": "upload",
            "max_results": max_results,
        }
        if prefix:
            options["prefix"] = prefix
        if folder:
            options["folder"] = folder
        if next_cursor:
            options["next_cursor"] = next_cursor
        if tags:
            options["tags"] = True
        if context:
            options["context"] = True
        return cloudinary.api.resources(**options)

    def list_all_files(
        self,
        prefix: Optional[str] = None,
        folder: Optional[str] = None,
        max_results: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Convenience method that automatically paginates and returns
        a flat list of all matching raw files.
        """
        all_resources: List[Dict[str, Any]] = []
        cursor = None

        while True:
            response = self.list_files(
                prefix=prefix,
                folder=folder,
                max_results=max_results,
                next_cursor=cursor,
            )
            all_resources.extend(response.get("resources", []))

            cursor = response.get("next_cursor")
            if not cursor:
                break

        return all_resources

    # ------------------------------------------------------------------
    # Get details of a single asset
    # ------------------------------------------------------------------
    def get_file_details(self, public_id: str) -> Dict[str, Any]:
        """
        Fetch full details of a single raw asset.
        """
        return cloudinary.api.resource(
            public_id,
            resource_type="raw",
        )

    # ------------------------------------------------------------------
    # Rename / move
    # ------------------------------------------------------------------
    def rename_file(
        self,
        from_public_id: str,
        to_public_id: str,
        overwrite: bool = False,
        invalidate: bool = True,
    ) -> Dict[str, Any]:
        """
        Rename (or move) a raw file by changing its public ID.
        """
        return cloudinary.uploader.rename(
            from_public_id,
            to_public_id,
            resource_type="raw",
            overwrite=overwrite,
            invalidate=invalidate,
        )

    # ------------------------------------------------------------------
    # Generate a delivery URL (optional utility)
    # ------------------------------------------------------------------
    def get_file_url(
        self,
        public_id: str,
        secure: bool = True,
        **kwargs: Any,
    ) -> str:
        """
        Build a delivery URL for a raw file.

        Note: raw files are delivered directly, so transformation
        options generally do not apply.
        """
        return cloudinary.CloudinaryResource(
            public_id,
            resource_type="raw",
        ).build_url(secure=secure, **kwargs)

    # ------------------------------------------------------------------
    # Check existence
    # ------------------------------------------------------------------
    def file_exists(self, public_id: str) -> bool:
        """
        Return True if a raw asset with the given public_id exists.
        """
        try:
            self.get_file_details(public_id)
            return True
        except cloudinary.api.Error as exc:
            # Cloudinary returns 404 for a missing resource
            if getattr(exc, "http_code", None) == 404:
                return False
            raise