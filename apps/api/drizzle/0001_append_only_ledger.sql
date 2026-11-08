-- E1: the bid ledger and the audit log are append-only. Corrections are new
-- rows, never mutations. A superuser can still disable the trigger — which is
-- exactly why bids are also hash-chained (E2) and verifiable.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER bids_append_only BEFORE UPDATE OR DELETE ON bids
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER bids_no_truncate BEFORE TRUNCATE ON bids
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER amendments_append_only BEFORE UPDATE OR DELETE ON amendments
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
