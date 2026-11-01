@echo off
SETLOCAL
SET TEMP_JS=seed_all_temp.js

echo ===================================================
echo 🌱 MongoDB Multi-Database Seeder
echo ===================================================
echo Generating script...

:: Create the temporary JavaScript file for mongosh
(
echo // ═══════════════════════════════════════════════════════════════
echo // 1. DEMO ECOMMERCE DATABASE
echo // ═══════════════════════════════════════════════════════════════
echo use("demo_ecommerce");
echo db.dropDatabase();
echo db.products.insertMany^([
echo   { sku: "P-100", name: "MacBook Pro", category: "Electronics", price: 1999, stock: 50 },
echo   { sku: "P-101", name: "Logitech Mouse", category: "Electronics", price: 49, stock: 200 },
echo   { sku: "P-102", name: "Standing Desk", category: "Furniture", price: 499, stock: 15 },
echo   { sku: "P-103", name: "Office Chair", category: "Furniture", price: 299, stock: 30 }
echo ]^);
echo db.customers.insertMany^([
echo   { name: "Alice Smith", email: "alice@example.com", tier: "Gold", joined: new Date("2023-01-15") },
echo   { name: "Bob Jones", email: "bob@example.com", tier: "Silver", joined: new Date("2023-06-20") },
echo   { name: "Charlie Brown", email: "charlie@example.com", tier: "Bronze", joined: new Date("2023-11-05") }
echo ]^);
echo db.orders.insertMany^([
echo   { orderId: "ORD-001", customer: "alice@example.com", product: "MacBook Pro", amount: 1999, status: "Delivered", date: new Date("2023-10-01") },
echo   { orderId: "ORD-002", customer: "bob@example.com", product: "Logitech Mouse", amount: 49, status: "Delivered", date: new Date("2023-10-15") },
echo   { orderId: "ORD-003", customer: "alice@example.com", product: "Office Chair", amount: 299, status: "Processing", date: new Date("2023-11-01") },
echo   { orderId: "ORD-004", customer: "charlie@example.com", product: "Standing Desk", amount: 499, status: "Cancelled", date: new Date("2023-11-02") }
echo ]^);
echo print("✅ Created demo_ecommerce: " + db.products.countDocuments() + " products, " + db.orders.countDocuments() + " orders.");
echo.

echo // ═══════════════════════════════════════════════════════════════
echo // 2. DEMO SAAS DATABASE
echo // ═══════════════════════════════════════════════════════════════
echo use("demo_saas");
echo db.dropDatabase();
echo db.accounts.insertMany^([
echo   { company: "TechCorp", plan: "Enterprise", mrr: 5000, active: true, since: new Date("2021-05-10") },
echo   { company: "DevStudio", plan: "Pro", mrr: 500, active: true, since: new Date("2022-08-22") },
echo   { company: "SmallBiz", plan: "Basic", mrr: 50, active: false, since: new Date("2023-02-14") }
echo ]^);
echo db.invoices.insertMany^([
echo   { invoiceId: "INV-2023-10-001", company: "TechCorp", amount: 5000, paid: true, dueDate: new Date("2023-10-31") },
echo   { invoiceId: "INV-2023-10-002", company: "DevStudio", amount: 500, paid: true, dueDate: new Date("2023-10-31") },
echo   { invoiceId: "INV-2023-11-001", company: "TechCorp", amount: 5000, paid: false, dueDate: new Date("2023-11-30") }
echo ]^);
echo print("✅ Created demo_saas: " + db.accounts.countDocuments() + " accounts, " + db.invoices.countDocuments() + " invoices.");
echo.

echo // ═══════════════════════════════════════════════════════════════
echo // 3. DEMO HR DATABASE
echo // ═══════════════════════════════════════════════════════════════
echo use("demo_hr");
echo db.dropDatabase();
echo db.departments.insertMany^([
echo   { name: "Engineering", head: "Sarah Connor", budget: 1500000 },
echo   { name: "Sales", head: "John Wick", budget: 500000 },
echo   { name: "Marketing", head: "Don Draper", budget: 300000 }
echo ]^);
echo db.employees.insertMany^([
echo   { name: "Peter Parker", role: "Software Engineer", dept: "Engineering", salary: 120000, status: "Full-Time" },
echo   { name: "Tony Stark", role: "Principal Engineer", dept: "Engineering", salary: 250000, status: "Full-Time" },
echo   { name: "Mary Jane", role: "Sales Rep", dept: "Sales", salary: 80000, status: "Full-Time" },
echo   { name: "Clark Kent", role: "Content Writer", dept: "Marketing", salary: 65000, status: "Contract" }
echo ]^);
echo print("✅ Created demo_hr: " + db.departments.countDocuments() + " departments, " + db.employees.countDocuments() + " employees.");

) > %TEMP_JS%

echo Running MongoDB Shell...
mongosh %TEMP_JS%

echo Cleaning up...
del %TEMP_JS%

echo ===================================================
echo 🎉 All 3 databases successfully created!
echo.
echo Now go to your App -^> Connections and add them:
echo   1. Host: localhost, Port: 27017, DB: demo_ecommerce
echo   2. Host: localhost, Port: 27017, DB: demo_saas
echo   3. Host: localhost, Port: 27017, DB: demo_hr
echo ===================================================
pause
ENDLOCAL