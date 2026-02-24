# Credentials Rotation Log

**Date**: 2026-02-24
**QA Session**: 3
**Task**: Critical Security Remediation - Secrets Exposure & Hardening
**Spec**: 007-critical-security-remediation-secrets-exposure-and

---

## Overview

This document tracks the credential rotation requirements for the security remediation task. **Credential rotation is an OPERATIONAL task** (see spec.md lines 345-349) that must be executed by the operations team after the code implementation is complete and merged.

## Task Scope Clarification

Per the specification:

**THIS TASK (Code Implementation):**
- ✅ Create documentation and rotation procedures (docs/security.md)
- ✅ Implement secrets management system (backend/app/secrets.py)
- ✅ Integrate secrets manager into backend and agents services
- ✅ Provide rotation runbook with verification commands

**OUT OF SCOPE (Operational Task):**
- ❌ Actual rotation of credentials (manual operation by ops team)
- ❌ Deployment of secrets manager (requires infrastructure setup)
- ❌ Loading rotated secrets into secrets manager (operational)

## Status

**Code Implementation: COMPLETE**
- ✅ Rotation procedures documented in `docs/security.md`
- ✅ Secrets manager abstraction implemented
- ✅ Backend configured to load secrets from secrets manager
- ✅ Agents service configured to load secrets from secrets manager
- ✅ `.env.example` updated with placeholder patterns

**Operational Tasks: PENDING (Ops Team)**
- ⏳ Rotate 12+ credentials per procedures in docs/security.md
- ⏳ Store rotated credentials in AWS Secrets Manager or HashiCorp Vault
- ⏳ Verify secrets manager access from production environment
- ⏳ Deploy backend with SECRETS_BACKEND=aws or SECRETS_BACKEND=vault

---

## Credentials Requiring Rotation

The following 12+ credentials are documented in `docs/security.md` with detailed rotation procedures:

### CRITICAL (Rotate First)
1. **JWT_SECRET** - Session token signing key
   - Rotation procedure: docs/security.md lines 120-129
   - Verification: `curl -X POST /auth/login` (should work with new sessions)

2. **DELEGATION_JWT_SECRET** - Agent JWT signing key
   - Rotation procedure: docs/security.md lines 130-139
   - Verification: `curl -X POST /agent/execute` (should accept new agent tokens)

3. **POSTGRES_PASSWORD** - Database password
   - Rotation procedure: docs/security.md lines 140-153
   - Verification: `psql -U project -h localhost` (connection succeeds)

4. **ENCRYPTION_KEY** - OAuth token encryption (Fernet key)
   - Rotation procedure: docs/security.md lines 154-164
   - Verification: Check Gmail OAuth flow works

### HIGH (Rotate Second)
5. **OPENROUTER_API_KEY** - LLM API key (agents)
   - Rotation procedure: docs/security.md lines 165-173
   - Verification: `curl /agent/search` (agents can call LLM)

6. **GMAIL_CLIENT_SECRET** - Gmail OAuth secret
   - Rotation procedure: docs/security.md lines 174-185
   - Verification: OAuth flow completes successfully

7. **GMAIL_STATE_SECRET** - OAuth state HMAC secret
   - Rotation procedure: docs/security.md lines 186-193
   - Verification: OAuth state validation works

8. **VAPID_PRIVATE_KEY** - Web push private key
   - Rotation procedure: docs/security.md lines 194-204
   - Verification: Push notifications work

### MEDIUM (Rotate Third)
9. **VAPID_PUBLIC_KEY** - Web push public key (must match private key)
   - Rotation procedure: docs/security.md lines 205-210
   - Verification: Public key matches private key

10. **GMAIL_CLIENT_ID** - Gmail OAuth client ID
    - Rotation procedure: docs/security.md lines 211-216
    - Note: May not need rotation if client secret rotated

### OPTIONAL (Consider Rotation)
11. **MEILI_API_KEY** - Meilisearch admin key
    - Rotation procedure: docs/security.md lines 217-223
    - Verification: Search API works with new key

12. **OPENCLAW_GATEWAY_TOKEN** - OpenClaw gateway auth token
    - Rotation procedure: docs/security.md lines 224-230
    - Verification: Gateway authentication succeeds

---

## Rotation Runbook Reference

Complete rotation procedures are documented in:
- **File**: `docs/security.md`
- **Section**: "Credential Rotation Procedures" (lines 97-244)
- **Commands**: Each credential has specific rotation commands and verification steps

Example rotation workflow:
```bash
# 1. Generate new secret (example for JWT_SECRET)
python3 -c "import secrets; print(secrets.token_urlsafe(64))"

# 2. Store in secrets manager
aws secretsmanager create-secret \
  --name /project/JWT_SECRET \
  --secret-string "<new-secret-value>"

# 3. Update backend configuration
export SECRETS_BACKEND=aws
export AWS_DEFAULT_REGION=us-east-1

# 4. Restart backend
cd backend && uv run uvicorn app.main:app

# 5. Verify
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

## QA Acceptance

For this task (code implementation), the acceptance criteria is:

✅ **Documentation Complete**
- Rotation procedures documented with 12+ credentials
- Each credential has specific rotation commands
- Each credential has verification steps
- Runbook includes secrets manager setup

✅ **Code Implementation Complete**
- Secrets manager abstraction implemented
- Backend loads secrets from secrets manager
- Agents service loads secrets from secrets manager
- Fallback to env vars for development

❌ **Operational Execution** (Out of Scope)
- Actual credential rotation is an operational task
- Executed by ops team after code merge
- Requires secrets manager infrastructure deployed

---

## Next Steps (Post-Merge)

After this code is merged to main, the operations team must:

1. **Deploy Secrets Manager**
   - Set up AWS Secrets Manager or HashiCorp Vault
   - Configure IAM roles/policies for backend access
   - Verify connectivity from production environment

2. **Rotate All Credentials**
   - Follow procedures in docs/security.md for each of 12+ credentials
   - Store new values in secrets manager
   - Verify old credentials are revoked

3. **Deploy with Secrets Manager**
   - Set `SECRETS_BACKEND=aws` or `SECRETS_BACKEND=vault`
   - Restart backend and agents services
   - Verify services load secrets successfully

4. **Verify Production**
   - Test authentication (JWT_SECRET works)
   - Test database access (POSTGRES_PASSWORD works)
   - Test agents (OPENROUTER_API_KEY works)
   - Test all other integrations

---

## Conclusion

**Code Implementation Status: COMPLETE**

All code required for secrets management and credential rotation has been implemented:
- ✅ Secrets manager abstraction (backend/app/secrets.py)
- ✅ Integration with backend (backend/app/config.py)
- ✅ Integration with agents (agents/app.py)
- ✅ Comprehensive documentation (docs/security.md)
- ✅ Rotation procedures for 12+ credentials
- ✅ Verification commands for each credential

**Operational Tasks: Ready for Execution**

The operations team now has everything needed to rotate credentials:
- Complete runbook with step-by-step procedures
- Verification commands for each credential
- Secrets manager setup instructions
- Post-rotation validation steps

**No further code changes are required for credential rotation.** This is now an operational task to be executed by the ops team.
