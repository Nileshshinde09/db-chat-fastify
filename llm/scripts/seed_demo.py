
import sqlite3
from pathlib import Path

db_path = Path("storage/demo.db")
db_path.parent.mkdir(parents=True, exist_ok=True)

with sqlite3.connect(db_path) as conn:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            total_spent REAL NOT NULL
        );

        DELETE FROM customers;

        INSERT INTO customers (id, name, city, total_spent)
        VALUES
            (1, 'Amit', 'Mumbai', 15000),
            (2, 'Priya', 'Pune', 22000),
            (3, 'Rahul', 'Thane', 12000),
            (4, 'Sneha', 'Mumbai', 30000),
            (5, 'Neha', 'Pune', 18000);
    """)

print(f"Seeded database: {db_path.resolve()}")
