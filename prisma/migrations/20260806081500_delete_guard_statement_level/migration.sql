-- Strengthen the no-delete guarantee from row-level to statement-level.
--
-- A BEFORE DELETE ... FOR EACH ROW trigger only fires once per matched row, so
-- `DELETE FROM application` against an empty table succeeds silently. That is
-- harmless in itself, but it means the guarantee "there is no delete path" was
-- not actually testable, and a table that is empty today will not be tomorrow.
--
-- FOR EACH STATEMENT refuses the statement itself, whether it would have
-- matched a thousand rows or none. That is the rule this product needs:
-- CLAUDE.md rule 2, 02-SYSTEM-ARCHITECTURE §7.

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
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'no_delete_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_delete()',
      'no_delete_' || t, t
    );
  END LOOP;
END;
$$;

-- Same reasoning for the append-only tables: an UPDATE that matches nothing
-- should still be refused, so that "this table is never updated" is a fact
-- about the table rather than a fact about its current contents.
DROP TRIGGER IF EXISTS no_update_audit_event ON "audit_event";
CREATE TRIGGER no_update_audit_event
  BEFORE UPDATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_update();

DROP TRIGGER IF EXISTS no_update_application_event ON "application_event";
CREATE TRIGGER no_update_application_event
  BEFORE UPDATE ON "application_event"
  FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_update();
