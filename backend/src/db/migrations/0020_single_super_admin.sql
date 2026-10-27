-- Preserve one Super Admin, preferring the configured owner.
WITH ranked AS (
 SELECT a.user_id, row_number() OVER (ORDER BY (lower(u.email)='bigboss@muacm.tech') DESC, a.created_at, a.user_id) AS position
 FROM admin_profiles a JOIN users u ON u.id=a.user_id WHERE a.role='SUPER_ADMIN'
), demoted AS (
 UPDATE admin_profiles a SET role='ADMIN',updated_at=now() FROM ranked r
 WHERE a.user_id=r.user_id AND r.position>1 RETURNING a.user_id
)
UPDATE sessions SET revoked_at=now() WHERE user_id IN (SELECT user_id FROM demoted) AND revoked_at IS NULL;
CREATE UNIQUE INDEX admin_profiles_single_super_admin ON admin_profiles(role) WHERE role='SUPER_ADMIN';
