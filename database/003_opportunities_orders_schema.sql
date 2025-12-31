-- =============================================================================
-- NOSCITE CRM - Opportunities & Orders Schema
-- =============================================================================

-- Opportunity status
CREATE TYPE opportunity_status AS ENUM ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
CREATE TYPE opportunity_source AS ENUM ('website', 'referral', 'cold_call', 'event', 'social', 'partner', 'other');

-- Opportunities Table
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status opportunity_status NOT NULL DEFAULT 'lead',
    source opportunity_source DEFAULT 'other',
    amount DECIMAL(15, 2) DEFAULT 0,
    win_probability INTEGER DEFAULT 50 CHECK (win_probability >= 0 AND win_probability <= 100),
    weighted_amount DECIMAL(15, 2) GENERATED ALWAYS AS (amount * win_probability / 100) STORED,
    expected_close_date DATE,
    actual_close_date DATE,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    competitors TEXT[],
    close_reason TEXT,
    notes TEXT,
    tags TEXT[],
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_company ON opportunities(company_id);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_owner ON opportunities(owner_id);

-- Opportunity Services
CREATE TABLE opportunity_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price * (1 - discount_percent / 100)) STORED,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order status
CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'in_progress', 'on_hold', 'completed', 'cancelled');
CREATE TYPE order_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Orders Table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    parent_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status order_status NOT NULL DEFAULT 'draft',
    priority order_priority DEFAULT 'medium',
    start_date DATE,
    end_date DATE,
    total_amount DECIMAL(15, 2) DEFAULT 0,
    invoiced_amount DECIMAL(15, 2) DEFAULT 0,
    estimated_hours DECIMAL(10, 2),
    actual_hours DECIMAL(10, 2) DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    account_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    contract_reference VARCHAR(100),
    po_number VARCHAR(100),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Order Services
CREATE TABLE order_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price * (1 - discount_percent / 100)) STORED,
    delivered_quantity DECIMAL(10, 3) DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequences for auto-codes
CREATE SEQUENCE opportunity_code_seq START 1;
CREATE SEQUENCE order_number_seq START 1;

-- Auto-generate opportunity code
CREATE OR REPLACE FUNCTION generate_opportunity_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.code IS NULL THEN
        NEW.code := 'OPP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('opportunity_code_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunity_code
    BEFORE INSERT ON opportunities
    FOR EACH ROW EXECUTE FUNCTION generate_opportunity_code();

-- Auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Auto-create order when opportunity is won
CREATE OR REPLACE FUNCTION create_order_from_opportunity()
RETURNS TRIGGER AS $$
DECLARE
    new_order_id UUID;
    opp_service RECORD;
BEGIN
    IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
        INSERT INTO orders (opportunity_id, company_id, contact_id, title, description, total_amount, status, account_manager_id, created_by)
        VALUES (NEW.id, NEW.company_id, NEW.contact_id, NEW.title, NEW.description, NEW.amount, 'draft', NEW.owner_id, NEW.owner_id)
        RETURNING id INTO new_order_id;
        
        FOR opp_service IN SELECT * FROM opportunity_services WHERE opportunity_id = NEW.id
        LOOP
            INSERT INTO order_services (order_id, service_id, quantity, unit_price, discount_percent, notes, sort_order)
            VALUES (new_order_id, opp_service.service_id, opp_service.quantity, opp_service.unit_price, opp_service.discount_percent, opp_service.notes, opp_service.sort_order);
        END LOOP;
        
        NEW.actual_close_date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunity_won
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION create_order_from_opportunity();

-- Triggers
CREATE TRIGGER update_opportunities_updated_at
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
