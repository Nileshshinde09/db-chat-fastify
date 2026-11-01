@echo off
SETLOCAL
SET TEMP_JS=delete_dbs_temp.js

echo ===================================================
echo ⚠️  MongoDB Demo Database Deleter
echo ===================================================
echo Preparing to drop all demo databases...

:: Create the temporary JavaScript file for mongosh
(
echo use('demo_ecommerce');
echo db.dropDatabase();
echo print("🗑️  Deleted demo_ecommerce");
echo.
echo use('demo_saas');
echo db.dropDatabase();
echo print("🗑️  Deleted demo_saas");
echo.
echo use('demo_hr');
echo db.dropDatabase();
echo print("🗑️  Deleted demo_hr");
echo.
echo print("✅ All 3 demo databases have been successfully removed from MongoDB.");
) > %TEMP_JS%

echo Executing deletion...
mongosh %TEMP_JS%

echo Cleaning up temporary files...
del %TEMP_JS%

echo ===================================================
echo 🎉 Done! Your MongoDB is clean.
echo ===================================================
pause
ENDLOCAL