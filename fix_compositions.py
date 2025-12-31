import csv
import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "noscite_crm",
    "user": "noscite",
    "password": "NosciteSecure2025!"
}

def clean_value(val):
    if val is None or val == '' or val == 'null' or val == 'NULL':
        return None
    return val

def clean_decimal(val):
    if val is None or val == '' or val == 'null':
        return None
    return float(val)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# Service compositions
rows = []
with open('data/service_compositions.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

count = 0
for row in rows:
    try:
        cur.execute("""
            INSERT INTO service_compositions (id, parent_service_id, child_service_id, quantity, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (
            clean_value(row['id']), clean_value(row['parent_service_id']),
            clean_value(row['child_service_id']), clean_decimal(row.get('quantity')) or 1,
            clean_value(row.get('created_at'))
        ))
        conn.commit()
        count += 1
    except Exception as e:
        conn.rollback()
        print(f"Skipping composition (parent service missing): {e}")

print(f"Migrated {count} service compositions")

# Order services
rows = []
with open('data/order_services.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

count = 0
for row in rows:
    try:
        cur.execute("""
            INSERT INTO order_services (id, order_id, service_id, quantity, unit_price, notes, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (
            clean_value(row['id']), clean_value(row['order_id']), clean_value(row['service_id']),
            clean_decimal(row.get('quantity')) or 1, clean_decimal(row.get('unit_price')),
            clean_value(row.get('notes')), clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
        ))
        conn.commit()
        count += 1
    except Exception as e:
        conn.rollback()
        print(f"Skipping order service (service missing): {e}")

print(f"Migrated {count} order services")

cur.close()
conn.close()
