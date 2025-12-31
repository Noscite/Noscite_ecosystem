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

def clean_int(val):
    if val is None or val == '' or val == 'null':
        return None
    return int(float(val))

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# Status mapping
status_map = {
    'acquisita': 'won',
    'in_attesa': 'qualified',
    'persa': 'lost',
    'lead': 'lead',
    'proposta': 'proposal',
    'negoziazione': 'negotiation',
}

# Migrate opportunities
print("Migrating opportunities...")
with open('data/opportunities.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    count = 0
    for row in reader:
        old_status = clean_value(row.get('status')) or 'lead'
        new_status = status_map.get(old_status, 'lead')
        
        try:
            cur.execute("""
                INSERT INTO opportunities (id, company_id, title, description, status, amount, 
                    win_probability, expected_close_date, notes, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
            """, (
                clean_value(row['id']),
                clean_value(row.get('company_id')),
                clean_value(row['title']),
                clean_value(row.get('description')),
                new_status,
                clean_decimal(row.get('amount')),
                clean_int(row.get('win_probability')),
                clean_value(row.get('expected_close_date')),
                clean_value(row.get('notes')),
                clean_value(row.get('created_at')),
                clean_value(row.get('updated_at'))
            ))
            conn.commit()
            count += 1
        except Exception as e:
            conn.rollback()
            print(f"Error: {e}")

print(f"Migrated {count} opportunities")

# Migrate opportunity_services
print("Migrating opportunity_services...")
with open('data/opportunity_services.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    count = 0
    for row in reader:
        try:
            cur.execute("""
                INSERT INTO opportunity_services (id, opportunity_id, service_id, quantity, unit_price, notes, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (
                clean_value(row['id']),
                clean_value(row['opportunity_id']),
                clean_value(row['service_id']),
                clean_decimal(row.get('quantity')) or 1,
                clean_decimal(row.get('unit_price')),
                clean_value(row.get('notes')),
                clean_value(row.get('created_at')),
                clean_value(row.get('updated_at'))
            ))
            conn.commit()
            count += 1
        except Exception as e:
            conn.rollback()
            print(f"Skipping (service missing): {e}")

print(f"Migrated {count} opportunity_services")

cur.close()
conn.close()
