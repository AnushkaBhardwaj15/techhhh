# 0005. Revocable Browser Sessions

Tech Tombola uses HTTP-only secure cookies containing signed JWTs whose `jti` references a server-side Session record. Protected requests validate both the token and the active Session, and logout revokes the Session immediately; this keeps browser credentials out of JavaScript and WebSocket query strings while preserving JWT verification and operational revocation without storing plaintext tokens.
