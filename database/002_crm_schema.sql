-- =============================================================================
-- NOSCITE CRM - CRM Schema (Companies, Contacts, Services)
-- =============================================================================

-- Company types
CREATE TYPE company_type AS ENUM ('client', 'prospect', 'supplier', 'partner', 'freelance');

-- Companies Table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    company_type company_type NOT NULL DEFAULT 'prospect',
    vat_number VARCHAR(50),
    tax_code VARCHAR(50),
    sdi_code VARCHAR(10),
    pec_email VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    website VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Italia',
    industry VARCHAR(100),
    notes TEXT,
    tags TEXT[],
    account_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    onedrive_folder_id VARCHAR(255),
    onedrive_folder_path TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_type ON companies(company_type);
CREATE INDEX idx_companies_vat ON companies(vat_number);
CREATE INDEX idx_companies_is_active ON companies(is_active);

-- Contacts Table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    job_title VARCHAR(100),
    department VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    is_decision_maker BOOLEAN DEFAULT false,
    linkedin_url VARCHAR(255),
    notes TEXT,
    tags TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_email ON contacts(email);

-- Service types
CREATE TYPE service_type AS ENUM ('simple', 'kit');
CREATE TYPE billing_type AS ENUM ('fixed', 'hourly', 'daily', 'monthly', 'yearly');

-- Services Table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type service_type NOT NULL DEFAULT 'simple',
    unit_price DECIMAL(12, 2),
    cost_price DECIMAL(12, 2),
    billing_type billing_type DEFAULT 'fixed',
    unit_of_measure VARCHAR(50) DEFAULT 'pz',
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_code ON services(code);
CREATE INDEX idx_services_type ON services(service_type);

-- Service Compositions (KIT)
CREATE TABLE service_compositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    child_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
    unit_price_override DECIMAL(12, 2),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(parent_service_id, child_service_id),
    CHECK (parent_service_id != child_service_id)
);

-- Triggers
CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
