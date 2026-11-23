
from database.db import get_db_connection

try:
    connection = get_db_connection()

    print("ShopMind MySQL connection successful!")

    cursor = connection.cursor()
    cursor.execute("SHOW TABLES")

    print("Available tables:")

    for table in cursor.fetchall():
        print(table[0])

    cursor.close()
    connection.close()

except Exception as error:
    print("Database connection failed:", error)
