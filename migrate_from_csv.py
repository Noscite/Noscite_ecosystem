#!/usr/bin/env python3
"""
Migration script from Supabase CSV exports to new PostgreSQL database.
"""

import csv
import psycopg2
import sys

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "noscite_crm",
    "user": "noscite",
    "password": "NosciteSecure2025!"
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

def clean_value(val):
    if val is None or val == '' or val == 'null' or val == 'NULL':
        return None
    return val

def clean_bool(val):
    if val is None or val == '' or val == 'null':
        return None
    if isinstance(val, bool):
        return val
    return str(val).lower() == 'true'

def clean_decimal(val):
    if val is None or val == '' or val == 'null':
        return None
    return float(val)

def clean_int(val):
    if val is None or val == '' or val == 'null':
        return None
    return int(float(val))

def read_csv(filepath):
    rows = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

def migrate_companies(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    
    for row in rows:
        is_partner = clean_bool(row.get('is_partner'))
        company_type = 'partner' if is_partner else 'client'
        
        try:
            cur.execute("""
                INSERT INTO companies (id, name, vat_number, tax_code, email, phone, website,
                    address, city, postal_code, province, country, notes, is_active, company_type, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row['name']), clean_value(row.get('vat_number')),
                clean_value(row.get('tax_code')), clean_value(row.get('email')), clean_value(row.get('phone')),
                clean_value(row.get('website')), clean_value(row.get('address')), clean_value(row.get('city')),
                clean_value(row.get('postal_code')), clean_value(row.get('province')),
                clean_value(row.get('country')) or 'IT', clean_value(row.get('notes')),
                clean_bool(row.get('is_active', 'true')), company_type,
                clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} companies")

def migrate_contacts(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    
    for row in rows:
        try:
            cur.execute("""
                INSERT INTO contacts (id, company_id, first_name, last_name, email, phone, mobile,
                    job_title, is_primary, notes, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row.get('company_id')),
                clean_value(row.get('first_name')) or '', clean_value(row.get('last_name')) or '',
                clean_value(row.get('email')), clean_value(row.get('phone')), clean_value(row.get('mobile')),
                clean_value(row.get('position')), clean_bool(row.get('is_primary', 'false')),
                clean_value(row.get('notes')), clean_bool(row.get('is_active', 'true')),
                clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} contacts")

def migrate_services(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    
    for row in rows:
        try:
            cur.execute("""
                INSERT INTO services (id, code, name, description, service_type, unit_price,
                    unit_of_measure, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row.get('code')) or row['id'][:8],
                clean_value(row['name']), clean_value(row.get('description')),
                clean_value(row.get('service_type')).replace('composed', 'kit') if clean_value(row.get('service_type')) else 'simple', clean_decimal(row.get('unit_price')),
                clean_value(row.get('unit_of_measure')) or 'pz', clean_bool(row.get('is_active', 'true')),
                clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} services")

def migrate_service_compositions(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
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
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} service compositions")

def migrate_orders(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    status_map = {'active': 'in_progress', 'pending': 'draft', 'completed': 'completed', 'cancelled': 'cancelled', 'on_hold': 'on_hold'}
    
    for row in rows:
        old_status = clean_value(row.get('status')) or 'draft'
        new_status = status_map.get(old_status, 'draft')
        
        try:
            cur.execute("""
                INSERT INTO orders (id, company_id, order_number, title, description, status, priority,
                    start_date, end_date, estimated_hours, actual_hours, total_amount, progress_percentage, notes, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row['company_id']), clean_value(row['order_number']),
                clean_value(row['title']), clean_value(row.get('description')), new_status,
                clean_value(row.get('priority')) or 'medium', clean_value(row.get('start_date')),
                clean_value(row.get('end_date')), clean_decimal(row.get('estimated_hours')),
                clean_decimal(row.get('actual_hours')), clean_decimal(row.get('total_amount')),
                clean_int(row.get('progress_percentage')), clean_value(row.get('notes')),
                clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} orders")

def migrate_order_services(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
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
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} order services")

def migrate_projects(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    
    for row in rows:
        try:
            cur.execute("""
                INSERT INTO projects (id, order_id, name, description, status, planned_start_date, planned_end_date,
                    budget, actual_cost, progress_percentage, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row.get('order_id')), clean_value(row['name']),
                clean_value(row.get('description')), clean_value(row.get('status')) or 'planning',
                clean_value(row.get('planned_start_date')), clean_value(row.get('planned_end_date')),
                clean_decimal(row.get('budget')), clean_decimal(row.get('actual_cost')),
                clean_int(row.get('progress_percentage')), clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} projects")

def migrate_tasks(filepath):
    conn = get_connection()
    cur = conn.cursor()
    rows = read_csv(filepath)
    count = 0
    
    for row in rows:
        try:
            cur.execute("""
                INSERT INTO tasks (id, project_id, parent_task_id, name, description, status, priority,
                    assigned_to_user_id, assigned_to_company_id, start_date, end_date, planned_start_date, planned_end_date,
                    estimated_hours, actual_hours, progress_percentage, is_milestone, sort_order, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            """, (
                clean_value(row['id']), clean_value(row['project_id']), clean_value(row.get('parent_task_id')),
                clean_value(row['name']), clean_value(row.get('description')),
                clean_value(row.get('status')) or 'todo', clean_value(row.get('priority')) or 'medium',
                clean_value(row.get('assigned_to_user_id')), clean_value(row.get('assigned_to_company_id')),
                clean_value(row.get('start_date')), clean_value(row.get('end_date')),
                clean_value(row.get('planned_start_date')), clean_value(row.get('planned_end_date')),
                clean_decimal(row.get('estimated_hours')), clean_decimal(row.get('actual_hours')),
                clean_int(row.get('progress_percentage')), clean_bool(row.get('is_milestone', 'false')),
                clean_int(row.get('sort_order')), clean_value(row.get('created_at')), clean_value(row.get('updated_at'))
            ))
            count += 1
        except Exception as e:
            print(f"Error: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Migrated {count} tasks")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python migrate_from_csv.py <table> <csv_file>")
        print("Tables: companies, contacts, services, service_compositions, orders, order_services, projects, tasks")
        sys.exit(1)
    
    table = sys.argv[1]
    filepath = sys.argv[2]
    
    funcs = {
        "companies": migrate_companies, "contacts": migrate_contacts, "services": migrate_services,
        "service_compositions": migrate_service_compositions, "orders": migrate_orders,
        "order_services": migrate_order_services, "projects": migrate_projects, "tasks": migrate_tasks
    }
    
    if table in funcs:
        funcs[table](filepath)
    else:
        print(f"Unknown table: {table}")
