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

def clean_bool(val):
    if val is None or val == '' or val == 'null':
        return None
    return str(val).lower() == 'true'

def clean_decimal(val):
    if val is None or val == '' or val == 'null':
        return None
    return float(val)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# Read CSV
rows = []
with open('data/services.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

count = 0
for row in rows:
    # Map composed -> kit
    service_type = clean_value(row.get('service_type')) or 'simple'
    if service_type == 'composed':
        service_type = 'kit'
    
    try:
        cur.execute("""
            INSERT INTO services (id, code, name, description, service_type, unit_price,
                unit_of_measure, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET 
                name = EXCLUDED.name,
                service_type = EXCLUDED.service_type,
                updated_at = NOW()
        """, (
            clean_value(row['id']), 
            clean_value(row.get('code')) or row['id'][:8],
            clean_value(row['name']), 
            clean_value(row.get('description')),
            service_type, 
            clean_decimal(row.get('unit_price')),
            clean_value(row.get('unit_of_measure')) or 'pz', 
            clean_bool(row.get('is_active', 'true')),
            clean_value(row.get('created_at')), 
            clean_value(row.get('updated_at'))
        ))
        conn.commit()
        count += 1
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")

cur.close()
conn.close()
print(f"Migrated {count} services")
