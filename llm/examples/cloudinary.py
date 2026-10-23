from ..app.utils.cloudinary import CloudinaryFileManager

# 1. Initialise (credentials can also come from CLOUDINARY_URL)
manager = CloudinaryFileManager(
    cloud_name="your_cloud_name",
    api_key="your_api_key",
    api_secret="your_api_secret",
)

# 2. Upload a CSV file
result = manager.upload_file(
    "data/report_2026.csv",
    public_id="reports/report_2026",
    folder="reports",
    overwrite=True,
    tags=["finance", "quarterly"],
)
print("Uploaded:", result["secure_url"])

# 3. Upload an Excel file
result = manager.upload_file(
    "data/budget_2026.xlsx",
    public_id="budgets/budget_2026",
    folder="budgets",
)

# 4. List all raw files in the "reports" folder
reports = manager.list_all_files(folder="reports")
for item in reports:
    print(item["public_id"], item["secure_url"])

# 5. Get details of a specific file
details = manager.get_file_details("reports/report_2026.csv")
print(details["bytes"], details["created_at"])

# 6. Rename a file
manager.rename_file(
    "reports/report_2026.csv",
    "reports/report_2026_final.csv",
)

# 7. Delete a single file
manager.delete_file("reports/report_2026_final.csv")

# 8. Bulk delete multiple files
manager.delete_files([
    "budgets/budget_2026.xlsx",
    "reports/old_report.csv",
])