-- TRUNCATE does not fire DELETE triggers. It is a separate event type, and
-- without its own guard `TRUNCATE application CASCADE` empties the register in
-- one statement while every no-delete trigger sits and watches.
--
-- CASCADE makes it worse: truncating one table reaches every table with a
-- foreign key to it, so a single unguarded statement could take the whole
-- register with it.

CREATE OR REPLACE FUNCTION osool_forbid_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'TRUNCATE is not permitted on %. This register has no destructive delete. See docs/02-SYSTEM-ARCHITECTURE.md section 7.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  protected text[] := ARRAY[
    'user', 'account',
    'party', 'ownership',
    'broker_entity', 'registration',
    'application', 'application_transition', 'application_event',
    'completion', 'declaration', 'power_of_attorney', 'brokerage_contract',
    'compliance_officer_tenure', 'training_record',
    'inspection', 'finding',
    'document', 'signal',
    'rule_set', 'rule_item',
    'audit_event', 'legal_hold'
  ];
BEGIN
  FOREACH t IN ARRAY protected LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'no_truncate_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_truncate()',
      'no_truncate_' || t, t
    );
  END LOOP;
END;
$$;
