# Security Operations Runbook

**Last Updated:** 2026-02-24
**Status:** Active Incident Response
**Severity:** CRITICAL

## Table of Contents

- [Overview](#overview)
- [Incident Summary](#incident-summary)
- [Credential Rotation Procedures](#credential-rotation-procedures)
- [Git History Cleanup](#git-history-cleanup)
- [Secrets Management Setup](#secrets-management-setup)
- [Incident Response](#incident-response)
- [Security Controls Reference](#security-controls-reference)
- [Post-Incident Hardening](#post-incident-hardening)

---

## Overview

This document provides operational procedures for responding to the `.env` file exposure incident and implementing long-term security hardening measures. All procedures must be executed in the order specified to ensure system integrity and prevent data loss.

**CRITICAL EXECUTION ORDER:**
1. Credential Rotation (all exposed secrets)
2. Git History Purge (remove `.env` from all commits)
3. Force Push & Team Notification
4. Secrets Manager Implementation
5. Security Controls Deployment

**DO NOT skip steps or execute out of order.**

---

## Incident Summary

### What Happened

A `.env` file containing production credentials was committed to the git repository and pushed to the remote. This file contains 12+ sensitive secrets that provide access to critical infrastructure.

### Impact Assessment

**Exposure Scope:**
- **Repository:** All branches and tags in git history
- **Timeline:** First committed on [TIMESTAMP], accessible until [DETECTION DATE]
- **Access:** Anyone with repository access (team members, CI/CD, potential attackers if repo was public)

**Compromised Systems:**
- Authentication & Session Management (JWT signing keys)
- Database (PostgreSQL credentials)
- External APIs (OpenRouter, Gmail OAuth)
- Encryption Services (Fernet keys)
- Push Notifications (VAPID keys)

### Immediate Actions Taken

- [ ] Repository access audit initiated
- [ ] Secrets manager procurement/setup begun
- [ ] Team notification sent
- [ ] Credential rotation initiated
- [ ] Git history purge planned

---

## Credential Rotation Procedures

### Overview

All exposed credentials must be rotated **BEFORE** purging git history. Assume all secrets have been compromised and are actively being exploited.

### Critical Secrets (Rotate First)

These secrets provide direct access to core systems and must be rotated immediately:

#### 1. JWT_SECRET
**Purpose:** Session token signing key
**Impact if compromised:** Attacker can forge session tokens and impersonate any user

**Rotation Steps:**
```bash
# Generate new secret (32+ bytes, cryptographically random)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/jwt-secret \
  --secret-string "<new-secret>" \
  --region us-east-1

# Or for Vault:
vault kv put secret/project/prod jwt_secret="<new-secret>"
```

**Deployment:**
- Update production environment configuration
- Rolling restart required (sessions will be invalidated)
- Users will be logged out and must re-authenticate
- Coordinate rotation during low-traffic window

**Verification:**
```bash
# Verify new secret is loaded
curl -H "Authorization: Bearer <old-token>" http://api.example.com/auth/me
# Should return 401 Unauthorized
```

---

#### 2. DELEGATION_JWT_SECRET
**Purpose:** Agent On-Behalf-Of JWT signing key
**Impact if compromised:** Attacker can impersonate backend service to agents API

**Rotation Steps:**
```bash
# Generate new secret
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/delegation-jwt-secret \
  --secret-string "<new-secret>" \
  --region us-east-1
```

**Deployment:**
- Update backend AND agents service configuration
- Both services must be restarted simultaneously
- Test backend → agents API calls after restart

**Verification:**
```bash
# Test delegation token creation and validation
curl -X POST http://localhost:8000/chat/completions \
  -H "Cookie: project_session=<valid-session>" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
# Should succeed with 200 response
```

---

#### 3. POSTGRES_PASSWORD
**Purpose:** Database connection password
**Impact if compromised:** Full database access (read/write/delete all data)

**Rotation Steps:**
```bash
# Connect to database as superuser
psql -h localhost -U postgres

# Create new password
ALTER USER project_user WITH PASSWORD '<new-password>';

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/postgres-password \
  --secret-string "<new-password>" \
  --region us-east-1
```

**Deployment:**
- Update backend service configuration
- Update backup scripts and monitoring tools
- Rolling restart with connection pool draining
- Monitor for connection errors in logs

**Verification:**
```bash
# Test database connection with new credentials
PGPASSWORD='<new-password>' psql -h localhost -U project_user -d project_db -c "SELECT 1;"
# Should return 1
```

**CRITICAL:** Coordinate with DBA to ensure no active connections are killed. Use connection pool draining.

---

#### 4. ENCRYPTION_KEY
**Purpose:** Fernet symmetric encryption key for OAuth tokens
**Impact if compromised:** Attacker can decrypt stored OAuth tokens

**Rotation Steps:**
```bash
# Generate new Fernet key
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Build keyring value (new active key first, then previous keys)
# Format: "<new-key>,<previous-key-1>,<previous-key-2>"
# Example:
# ENCRYPTION_KEY="NEW_KEY,OLD_KEY"

# Store keyring in secrets manager
aws secretsmanager create-secret \
  --name project/prod/encryption-key \
  --secret-string "<new-key>,<old-key>" \
  --region us-east-1
```

**Deployment:**
- Deploy backend with keyring-based `ENCRYPTION_KEY` (new key first).
- New token writes automatically:
  - Prefix ciphertext as `v<N>:...`
  - Persist `email_connections.encryption_key_version = <N>`
- Existing ciphertext remains decryptable because decryption tries the full keyring.

**Backfill Plan (metadata only):**
```sql
-- Backfill missing encryption_key_version from existing access token format.
-- v<N>:...  -> N
-- gAAAAA... -> 1 (legacy pre-version format)
UPDATE email_connections
SET encryption_key_version = CASE
  WHEN encrypted_access_token ~ '^v[0-9]+:' THEN
    substring(encrypted_access_token from '^v([0-9]+):')::integer
  WHEN encrypted_access_token ~ '^gAAAAA' THEN 1
  ELSE encryption_key_version
END
WHERE encrypted_access_token IS NOT NULL
  AND encryption_key_version IS NULL;
```

**Optional Full Re-encryption (to force latest key version):**
- Run a one-off worker/script that:
  - Reads active rows from `email_connections`
  - Decrypts `encrypted_access_token` and `encrypted_refresh_token` with current keyring
  - Re-encrypts both with active key
  - Sets `encryption_key_version` to active version
- Execute during low traffic and monitor disconnect/reconnect events.

**Verification:**
```bash
# 1) Ensure metadata backfill is complete
psql "$DATABASE_URL" -c "
SELECT COUNT(*) AS missing_versions
FROM email_connections
WHERE encrypted_access_token IS NOT NULL
  AND encryption_key_version IS NULL;
"

# 2) Check distribution by key version
psql "$DATABASE_URL" -c "
SELECT encryption_key_version, COUNT(*)
FROM email_connections
WHERE encrypted_access_token IS NOT NULL
GROUP BY encryption_key_version
ORDER BY encryption_key_version;
"

# 3) Smoke-test Gmail refresh path
# (trigger sync or open inbox/calendar API for a connected account)
```

---

### High Priority Secrets (Rotate Second)

#### 5. OPENROUTER_API_KEY
**Purpose:** LLM API access for agents service
**Impact if compromised:** Attacker can consume API quota, exfiltrate prompts

**Rotation Steps:**
```bash
# Revoke old key in OpenRouter dashboard
# Generate new key at https://openrouter.ai/keys

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/openrouter-api-key \
  --secret-string "<new-key>" \
  --region us-east-1
```

**Deployment:**
- Update agents service configuration
- Restart agents service
- Test chat completion endpoint

**Verification:**
```bash
# Test LLM API call
curl -X POST http://localhost:8002/chat/completions \
  -H "Authorization: Bearer <delegation-token>" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
# Should return streaming response
```

---

#### 6. GMAIL_CLIENT_SECRET
**Purpose:** Gmail OAuth client secret
**Impact if compromised:** Attacker can intercept OAuth flow, obtain user tokens

**Rotation Steps:**
```bash
# Revoke old client secret in Google Cloud Console
# Navigate to: APIs & Services → Credentials → OAuth 2.0 Client IDs
# Click your client ID → Reset secret

# Store new secret in secrets manager
aws secretsmanager create-secret \
  --name project/prod/gmail-client-secret \
  --secret-string "<new-secret>" \
  --region us-east-1
```

**Deployment:**
- Update backend configuration
- Existing OAuth tokens remain valid (no user impact)
- New OAuth flows will use new secret

**Verification:**
```bash
# Test OAuth flow
curl http://localhost:8000/auth/gmail/start
# Should redirect to Google OAuth with correct client_id
```

---

#### 7. GMAIL_STATE_SECRET
**Purpose:** OAuth state parameter HMAC secret
**Impact if compromised:** CSRF protection for OAuth flow bypassed

**Rotation Steps:**
```bash
# Generate new secret
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/gmail-state-secret \
  --secret-string "<new-secret>" \
  --region us-east-1
```

**Deployment:**
- Update backend configuration
- In-flight OAuth flows will fail (acceptable impact)
- Restart backend service

---

#### 8. VAPID_PRIVATE_KEY
**Purpose:** Web push notification signing key
**Impact if compromised:** Attacker can send fake push notifications

**Rotation Steps:**
```bash
# Generate new VAPID key pair
python3 -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print(v.private_key.export()); print(v.public_key.export())"

# Store both keys in secrets manager
aws secretsmanager create-secret \
  --name project/prod/vapid-private-key \
  --secret-string "<new-private-key>" \
  --region us-east-1

aws secretsmanager create-secret \
  --name project/prod/vapid-public-key \
  --secret-string "<new-public-key>" \
  --region us-east-1
```

**Deployment:**
- **REQUIRES USER RE-SUBSCRIPTION:** All existing push subscriptions will be invalidated
- Update backend configuration with new key pair
- Frontend must re-subscribe users to push notifications
- Coordinate with frontend team for migration UX

**Verification:**
```bash
# Test push notification
curl -X POST http://localhost:8000/notifications/push \
  -H "Cookie: project_session=<valid-session>" \
  -d '{"title":"Test","body":"Test notification"}'
# Should succeed (user will receive notification)
```

---

### Medium Priority Secrets (Rotate Third)

#### 9. VAPID_PUBLIC_KEY
**Purpose:** Web push public key (shared with browser)
**Impact if compromised:** Low (public key, but must match private key)

**Rotation:** Must be rotated with VAPID_PRIVATE_KEY (see above).

---

#### 10. GMAIL_CLIENT_ID
**Purpose:** Gmail OAuth client identifier
**Impact if compromised:** Low (public identifier)

**Rotation:** Optional. Client ID is semi-public but rotating reduces attack surface.

```bash
# Create new OAuth 2.0 client ID in Google Cloud Console
# Store in secrets manager (for consistency)
aws secretsmanager create-secret \
  --name project/prod/gmail-client-id \
  --secret-string "<new-client-id>" \
  --region us-east-1
```

---

### Optional Secrets (Consider Rotation)

#### 11. MEILI_API_KEY
**Purpose:** Meilisearch admin API key
**Impact if compromised:** Attacker can read/modify search index

**Rotation Steps:**
```bash
# Regenerate master key in Meilisearch configuration
# Update deployment/configuration manifest
MEILI_MASTER_KEY=<new-key>

# Restart Meilisearch workload (example: Kubernetes)
kubectl -n <namespace> rollout restart deployment/meilisearch

# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/meili-api-key \
  --secret-string "<new-key>" \
  --region us-east-1
```

**Deployment:**
- Update backend configuration
- Restart backend service
- Search index remains intact

---

#### 12. OPENCLAW_GATEWAY_TOKEN
**Purpose:** OpenClaw gateway authentication token (if configured)
**Impact if compromised:** Depends on OpenClaw permissions

**Rotation Steps:**
```bash
# Contact OpenClaw support or regenerate in admin dashboard
# Store in secrets manager
aws secretsmanager create-secret \
  --name project/prod/openclaw-token \
  --secret-string "<new-token>" \
  --region us-east-1
```

---

### Rotation Checklist

Use this checklist to track rotation progress:

```
CRITICAL (rotate first):
[ ] JWT_SECRET
[ ] DELEGATION_JWT_SECRET
[ ] POSTGRES_PASSWORD
[ ] ENCRYPTION_KEY (requires data migration)

HIGH PRIORITY (rotate second):
[ ] OPENROUTER_API_KEY
[ ] GMAIL_CLIENT_SECRET
[ ] GMAIL_STATE_SECRET
[ ] VAPID_PRIVATE_KEY (requires user re-subscription)

MEDIUM PRIORITY (rotate third):
[ ] VAPID_PUBLIC_KEY (rotate with private key)
[ ] GMAIL_CLIENT_ID (optional)

OPTIONAL (consider rotation):
[ ] MEILI_API_KEY
[ ] OPENCLAW_GATEWAY_TOKEN

POST-ROTATION:
[ ] All secrets stored in secrets manager
[ ] All services restarted and verified
[ ] No production errors in logs
[ ] All integrations tested (Gmail, push notifications, LLM API)
[ ] Team notified of completed rotation
```

---

## Git History Cleanup

### Overview

After rotating all credentials, the `.env` file must be removed from git history using `git-filter-repo`. This is a destructive operation that rewrites commit hashes.

**⚠️ WARNING:** This operation is irreversible. Create a backup before proceeding.

### Prerequisites

- [ ] All credentials rotated (see Credential Rotation Procedures)
- [ ] All team members notified of upcoming git history rewrite
- [ ] All open pull requests merged or documented for rebase
- [ ] Protected branch rules temporarily disabled (GitHub/GitLab settings)
- [ ] Backup created (see step 1 below)

### Step-by-Step Procedure

#### Step 1: Create Repository Backup

```bash
# Create timestamped backup bundle
git bundle create backup-$(date +%Y%m%d-%H%M%S).bundle --all

# Verify bundle integrity
git bundle verify backup-$(date +%Y%m%d-%H%M%S).bundle

# Store backup in secure location (encrypted, off-site)
# DO NOT delete this backup until history rewrite is verified successful
```

**Backup Location:** Store in encrypted cloud storage or encrypted external drive. Keep for at least 90 days.

---

#### Step 2: Install git-filter-repo

```bash
# macOS (Homebrew)
brew install git-filter-repo

# Ubuntu/Debian
apt-get install git-filter-repo

# Python pip (cross-platform)
pip install git-filter-repo

# Verify installation
git filter-repo --version
```

**Compatibility:** Requires Git 2.22.0+ and Python 3.6+

---

#### Step 3: Clone Fresh Repository

```bash
# Clone repository to clean directory (REQUIRED for git-filter-repo)
git clone --mirror git@github.com:org/repo.git repo-cleanup
cd repo-cleanup

# Verify .env exists in history
git log --all --full-history -- .env
# Should show commits where .env was added/modified
```

**Why `--mirror`?** Ensures all branches, tags, and refs are included in cleanup.

---

#### Step 4: Purge .env from History

```bash
# Remove .env file from all commits
git filter-repo --path .env --invert-paths --force

# This rewrites ALL commits that touched .env
# Commit hashes will change for affected commits and all descendants
```

**What happens:**
- `.env` file is removed from all commits in history
- Commit hashes change for affected commits
- Branch refs are updated
- Tag refs are updated
- Reflog is rewritten

---

#### Step 5: Verify .env is Gone

```bash
# Verify .env does not appear in any commit
git log --all --full-history -- .env
# Should return no results

# Verify file system
find . -name ".env"
# Should only find .env.example (if present)

# Check repository size reduction
du -sh .
# Should be smaller than original (if .env was large)
```

**Critical Verification:** If `git log --all --full-history -- .env` returns ANY results, DO NOT proceed. Repeat step 4.

---

#### Step 6: Force Push All Branches and Tags

```bash
# Disable protected branches temporarily (GitHub/GitLab settings)
# Navigate to Settings → Branches → Unprotect main/master

# Force push all branches
git push --force --all

# Force push all tags
git push --force --tags

# Re-enable branch protection rules
```

**⚠️ WARNING:** This overwrites remote repository history. All team members must re-clone.

---

#### Step 7: Notify Team to Re-clone

**Send this message to all team members:**

```
CRITICAL: Git history has been rewritten to remove exposed credentials.

REQUIRED ACTIONS:
1. Commit and push any uncommitted work immediately
2. Delete your local repository clone
3. Re-clone the repository from scratch
4. DO NOT attempt to pull or rebase existing clones

COMMANDS:
cd ~/projects
rm -rf project  # Replace with your repo name
git clone git@github.com:org/repo.git project
cd project
git checkout your-branch  # Restore your working branch

TIMELINE: Complete by [DATE]

SUPPORT: Contact #security channel for assistance
```

**Follow-up:** Verify all team members have re-cloned before proceeding to secrets manager deployment.

---

#### Step 8: Verify Remote Repository

```bash
# Clone from remote to verify cleanup
cd ~/temp
git clone git@github.com:org/repo.git verify-cleanup
cd verify-cleanup

# Verify .env is gone
git log --all --full-history -- .env
# Should return no results

# Check latest commit
git log -1
# Should show updated commit hash (different from pre-cleanup)
```

---

#### Step 9: Audit Repository Access

```bash
# GitHub: Review repository access logs
# Navigate to: Settings → Security & analysis → Audit log
# Filter by: action:repo.access, action:repo.download_zip

# Look for:
# - Unauthorized clones
# - Suspicious download_zip events
# - Unknown SSH keys or deploy keys
```

**If suspicious activity found:** Escalate to security team, consider additional credential rotations.

---

#### Step 10: Update CI/CD

```bash
# Update CI/CD secrets if stored in GitHub Actions / GitLab CI
# Navigate to: Settings → Secrets and variables → Actions

# Update secrets:
- JWT_SECRET
- POSTGRES_PASSWORD
- OPENROUTER_API_KEY
# (All rotated secrets from previous section)

# Test CI/CD pipeline
git commit --allow-empty -m "test: trigger CI after git history rewrite"
git push
```

---

### Git History Cleanup Checklist

```
PRE-CLEANUP:
[ ] All credentials rotated
[ ] Team notified of upcoming rewrite
[ ] Open PRs merged or documented
[ ] Protected branches disabled
[ ] Backup created and verified

CLEANUP:
[ ] git-filter-repo installed
[ ] Fresh repository cloned (--mirror)
[ ] .env purged from history
[ ] Verification passed (git log returns no .env)
[ ] Force push completed (all branches + tags)
[ ] Protected branches re-enabled

POST-CLEANUP:
[ ] Team notified to re-clone
[ ] All team members confirmed re-clone
[ ] Remote repository verified (no .env in history)
[ ] Repository access audit completed
[ ] CI/CD secrets updated
[ ] CI/CD pipeline tested
```

---

## Secrets Management Setup

### Overview

Implement centralized secrets management using AWS Secrets Manager or HashiCorp Vault. This prevents future credential exposure and enables automated rotation.

### Decision Matrix

| Factor | AWS Secrets Manager | HashiCorp Vault |
|--------|-------------------|-----------------|
| **Cost** | $0.40/secret/month + $0.05/10k API calls | Infrastructure cost (EC2/K8s) |
| **Setup** | Fully managed (no setup) | Self-hosted (Docker/K8s required) |
| **Maintenance** | Zero (AWS managed) | Patching, upgrades, backups required |
| **Rotation** | Automatic rotation support | Manual or custom Lambda rotation |
| **On-Premise** | No | Yes |
| **Multi-Cloud** | AWS only | Yes (GCP, Azure, on-prem) |
| **Audit Logs** | CloudTrail integration | Built-in audit log |
| **Access Control** | IAM policies | Vault policies + auth methods |
| **High Availability** | Built-in (SLA 99.99%) | Must configure replication |

**Recommendation:**
- **AWS Secrets Manager:** Cloud-native deployments, AWS-hosted infrastructure, minimal ops overhead
- **HashiCorp Vault:** Self-hosted, multi-cloud, on-premise, or advanced secret workflows

---

### Option 1: AWS Secrets Manager Setup

#### Prerequisites

- AWS account with IAM permissions for Secrets Manager
- AWS CLI configured (`aws configure`)
- boto3 Python library installed

#### Step 1: Install Dependencies

```bash
# Backend
cd backend
uv add boto3

# Agents
cd agents
uv add boto3
```

#### Step 2: Create IAM Policy

Create `secrets-manager-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:project/prod/*"
    }
  ]
}
```

Apply policy:
```bash
aws iam create-policy \
  --policy-name ProjectSecretsManagerReadOnly \
  --policy-document file://secrets-manager-policy.json

# Attach to EC2 instance role or ECS task role
aws iam attach-role-policy \
  --role-name ProjectBackendRole \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/ProjectSecretsManagerReadOnly
```

#### Step 3: Store Secrets

```bash
# Create secrets (use rotated values from previous section)
aws secretsmanager create-secret \
  --name project/prod/jwt-secret \
  --secret-string "<rotated-jwt-secret>" \
  --region us-east-1

aws secretsmanager create-secret \
  --name project/prod/delegation-jwt-secret \
  --secret-string "<rotated-delegation-jwt-secret>" \
  --region us-east-1

aws secretsmanager create-secret \
  --name project/prod/postgres-password \
  --secret-string "<rotated-postgres-password>" \
  --region us-east-1

aws secretsmanager create-secret \
  --name project/prod/encryption-key \
  --secret-string "<rotated-encryption-key>" \
  --region us-east-1

aws secretsmanager create-secret \
  --name project/prod/openrouter-api-key \
  --secret-string "<rotated-openrouter-api-key>" \
  --region us-east-1

# Continue for all 12+ secrets...
```

#### Step 4: Configure Application

Update `backend/app/config.py`:
```python
# Set secrets backend
SECRETS_BACKEND=aws
AWS_DEFAULT_REGION=us-east-1
```

For local development (fallback to environment variables):
```python
SECRETS_BACKEND=env
```

#### Step 5: Verify

```bash
# Start backend
cd backend && uv run uvicorn app.main:app --reload

# Check logs for secrets loading
# Should see: "Loading secrets from AWS Secrets Manager"
# Should NOT see: "Using environment variables for secrets (not recommended for production)"

# Test API endpoint
curl http://localhost:8000/health
# Should return 200 OK
```

---

### Option 2: HashiCorp Vault Setup

#### Prerequisites

- Docker or Kubernetes cluster
- Vault CLI installed (`brew install vault`)

#### Step 1: Deploy Vault

```bash
# Docker deployment (dev mode - NOT for production)
docker run -d \
  --name vault \
  --cap-add=IPC_LOCK \
  -e 'VAULT_DEV_ROOT_TOKEN_ID=dev-root-token' \
  -p 8200:8200 \
  vault:latest

# For production: Use Vault Helm chart or Terraform module
# See: https://developer.hashicorp.com/vault/docs/platform/k8s/helm
```

#### Step 2: Initialize Vault (Production)

```bash
# Initialize Vault
vault operator init

# Output:
# Unseal Key 1: <key1>
# Unseal Key 2: <key2>
# Unseal Key 3: <key3>
# Unseal Key 4: <key4>
# Unseal Key 5: <key5>
# Initial Root Token: <root-token>

# Store unseal keys securely (encrypted, distributed)
# NEVER store all unseal keys in same location

# Unseal Vault (requires 3 of 5 keys)
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# Login with root token
vault login <root-token>
```

#### Step 3: Enable KV Secrets Engine

```bash
# Enable KV v2 secrets engine
vault secrets enable -path=secret kv-v2

# Verify
vault secrets list
# Should show: secret/ kv
```

#### Step 4: Store Secrets

```bash
# Store secrets (use rotated values)
vault kv put secret/project/prod \
  jwt_secret="<rotated-jwt-secret>" \
  delegation_jwt_secret="<rotated-delegation-jwt-secret>" \
  postgres_password="<rotated-postgres-password>" \
  encryption_key="<rotated-encryption-key>" \
  openrouter_api_key="<rotated-openrouter-api-key>" \
  gmail_client_secret="<rotated-gmail-client-secret>" \
  gmail_state_secret="<rotated-gmail-state-secret>" \
  vapid_private_key="<rotated-vapid-private-key>" \
  vapid_public_key="<rotated-vapid-public-key>" \
  meili_api_key="<rotated-meili-api-key>"
```

#### Step 5: Create Application Policy

```bash
# Create policy for backend service
vault policy write project-backend - <<EOF
path "secret/data/project/prod" {
  capabilities = ["read"]
}
EOF

# Create token for backend service
vault token create -policy=project-backend -ttl=720h
# Output: token: s.xxxxxxxxxxxxxxxx

# Store token securely (use AppRole or Kubernetes auth in production)
```

#### Step 6: Configure Application

Update `backend/app/config.py`:
```python
# Set secrets backend
SECRETS_BACKEND=vault
VAULT_ADDR=http://vault.example.com:8200
VAULT_TOKEN=s.xxxxxxxxxxxxxxxx
```

#### Step 7: Install Dependencies

```bash
# Backend
cd backend
uv add hvac

# Agents
cd agents
uv add hvac
```

#### Step 8: Verify

```bash
# Start backend
cd backend && uv run uvicorn app.main:app --reload

# Check logs
# Should see: "Loading secrets from Vault"
# Should NOT see: "Failed to retrieve secret from Vault"

# Test API endpoint
curl http://localhost:8000/health
# Should return 200 OK
```

---

### Secrets Management Checklist

```
AWS SECRETS MANAGER:
[ ] IAM policy created and attached
[ ] All 12+ secrets stored in AWS Secrets Manager
[ ] Application configured (SECRETS_BACKEND=aws)
[ ] Dependencies installed (boto3)
[ ] Backend verified (secrets loaded successfully)
[ ] Agents verified (OPENROUTER_API_KEY loaded)

HASHICORP VAULT:
[ ] Vault deployed (Docker/K8s)
[ ] Vault initialized and unsealed
[ ] KV secrets engine enabled
[ ] All 12+ secrets stored in Vault
[ ] Application policy created
[ ] Access token generated
[ ] Application configured (SECRETS_BACKEND=vault)
[ ] Dependencies installed (hvac)
[ ] Backend verified (secrets loaded successfully)
[ ] Agents verified (OPENROUTER_API_KEY loaded)

POST-SETUP:
[ ] .env file deleted from production servers
[ ] .env.example updated with placeholder patterns
[ ] Local dev uses SECRETS_BACKEND=env (with warning log)
[ ] Production uses SECRETS_BACKEND=aws|vault
[ ] Team documentation updated
```

---

## Incident Response

### Incident Response Plan

Use this plan when credentials are exposed in the future.

#### Phase 1: Detection (0-15 minutes)

**Trigger:** Automated secret scanner alert, manual discovery, or external report

**Actions:**
1. Verify exposure (check git history, logs, backups)
2. Identify scope (which secrets, how long exposed, who had access)
3. Escalate to security team
4. Create incident ticket (track all actions)

**Roles:**
- **Incident Commander:** Security team lead
- **Technical Lead:** Senior backend engineer
- **Communications:** Engineering manager

---

#### Phase 2: Containment (15-60 minutes)

**Immediate Actions:**
1. [ ] Rotate exposed credentials (follow Credential Rotation Procedures)
2. [ ] Revoke access for compromised secrets (if applicable)
3. [ ] Review access logs for suspicious activity
4. [ ] Isolate affected systems if breach detected
5. [ ] Notify stakeholders (internal team, management)

**Critical Decision:** If active breach detected, escalate to Phase 3 immediately.

---

#### Phase 3: Eradication (1-4 hours)

**Actions:**
1. [ ] Remove exposed secrets from git history (follow Git History Cleanup)
2. [ ] Scan for secrets in logs, backups, monitoring systems
3. [ ] Purge secrets from CI/CD secret stores
4. [ ] Review code for hardcoded secrets
5. [ ] Audit all systems with access to exposed secrets

**Tools:**
- `git-filter-repo` for git history cleanup
- `gitleaks` for secret scanning
- `trufflehog` for commit history analysis

---

#### Phase 4: Recovery (4-24 hours)

**Actions:**
1. [ ] Deploy secrets manager (if not already implemented)
2. [ ] Update all services to use secrets manager
3. [ ] Test all integrations (database, APIs, OAuth)
4. [ ] Verify no production errors in logs
5. [ ] Monitor for anomalous activity

**Verification:**
- [ ] All services healthy
- [ ] No authentication failures
- [ ] External integrations working (Gmail, OpenRouter)
- [ ] Users can access application normally

---

#### Phase 5: Post-Incident (1-7 days)

**Actions:**
1. [ ] Complete incident report (timeline, root cause, impact)
2. [ ] Implement preventive measures (pre-commit hooks, CI secret scanning)
3. [ ] Team training on secret management best practices
4. [ ] Update documentation (this runbook)
5. [ ] Schedule post-mortem meeting

**Post-Mortem Questions:**
- What went wrong?
- How was the exposure detected?
- How long were secrets exposed?
- What was the impact?
- How can we prevent this in the future?

---

### Contact Information

**Security Team:**
- Primary: security@example.com
- Secondary: +1-555-0100 (24/7 on-call)

**Escalation Path:**
1. Engineering Team Lead
2. VP of Engineering
3. CISO (if high severity)
4. CEO (if customer data breach)

**External Contacts:**
- AWS Support: For Secrets Manager issues
- GitHub Support: For repository security issues
- OpenRouter Support: For API key compromise

---

## Security Controls Reference

### Implemented Controls

#### CSRF Protection

**Status:** Implemented, disabled by default
**Configuration:** `CSRF_ENABLED=false` (change to `true` in production)

**How it works:**
1. Frontend calls `GET /auth/csrf` to obtain CSRF token (set in cookie)
2. Frontend includes `X-CSRF-Token` header on state-changing requests
3. Backend validates token in `csrf_middleware` (app/main.py:240-244)

**Enable in production:**
```bash
# Production environment
export CSRF_ENABLED=true
export CSRF_COOKIE_NAME=project_csrf
export CSRF_COOKIE_SAMESITE=strict
export CSRF_COOKIE_SECURE=true
```

---

#### Rate Limiting

**Status:** To be implemented (subtask-2-1)
**Technology:** SlowAPI + Redis

**Endpoints to rate limit:**
- `/auth/login` - 5 requests/minute per IP
- `/auth/register` - 5 requests/minute per IP
- `/files/initiate` - 10 requests/minute per IP
- `/files/upload` - 10 requests/minute per IP

**Configuration:**
```bash
export RATE_LIMIT_STORAGE=redis
export REDIS_URL=redis://localhost:6379/0
```

**Test rate limiting:**
```bash
# Should see 429 on 6th request
for i in {1..6}; do
  curl -X POST http://localhost:8000/auth/login \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
done
```

---

#### File Upload Validation

**Status:** To be implemented (subtask-3-1, subtask-3-2)
**Technology:** python-magic, ClamAV (optional)

**Validation steps:**
1. **Type validation:** Check magic bytes (not file extension)
2. **Size validation:** Reject files > 50MB
3. **Malware scanning:** Integration point for ClamAV or VirusTotal

**Allowed MIME types:**
- `application/pdf`
- `image/jpeg`, `image/png`
- `text/plain`
- `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Error responses:**
- HTTP 415 Unsupported Media Type (disallowed file type)
- HTTP 413 Request Entity Too Large (file too large)

---

#### Security Headers

**Status:** Partially implemented, to be strengthened
**Current headers:** X-Content-Type-Options, X-Frame-Options, Referrer-Policy

**Production headers to add:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Testing:**
```bash
# Check security headers
curl -I https://production-domain.com/
# Or use: https://securityheaders.com/
```

**Target:** A+ rating on securityheaders.com

---

#### Dependency Scanning

**Status:** To be implemented (subtask-5-1)
**Technology:** Dependabot, pip-audit, npm audit

**CI/CD integration:**
```yaml
# .github/workflows/ci.yml
- name: Scan Python dependencies
  run: |
    pip install pip-audit
    pip-audit --requirement backend/requirements.txt

- name: Scan npm dependencies
  run: |
    cd frontend && npm audit --audit-level=moderate
```

**Dependabot config:**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/backend"
    schedule:
      interval: "weekly"

  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
```

---

## Post-Incident Hardening

### Pre-Commit Hooks

Prevent future secret exposure with pre-commit hooks.

#### Install pre-commit

```bash
pip install pre-commit
cd /path/to/repo
pre-commit install
```

#### Configure .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-added-large-files
        args: ['--maxkb=500']
      - id: check-merge-conflict
      - id: detect-private-key
```

#### Create baseline

```bash
# Generate baseline (after removing .env from history)
detect-secrets scan > .secrets.baseline

# Commit baseline
git add .secrets.baseline .pre-commit-config.yaml
git commit -m "Add pre-commit hooks for secret detection"
```

#### Test

```bash
# Attempt to commit .env file
echo "JWT_SECRET=real-secret" > .env
git add .env
git commit -m "test"

# Should block commit with error:
# Detect secrets...................................................Failed
# - hook id: detect-secrets
# - exit code: 1
```

---

### CI/CD Secret Scanning

Add secret scanning to GitHub Actions workflow.

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for gitleaks

      - name: Gitleaks scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # Optional

      - name: Detect secrets
        run: |
          pip install detect-secrets
          detect-secrets scan --baseline .secrets.baseline
```

---

### Environment Variable Best Practices

**DO:**
- Use `.env.example` with placeholder patterns: `<your-password>`, `${VAR}`, `{{TOKEN}}`
- Load secrets from secrets manager in production
- Use environment variable fallback for local dev only (with warning log)
- Document all required environment variables in README
- Use descriptive variable names: `JWT_SECRET_KEY` not `SECRET`

**DON'T:**
- Commit `.env` files (add to `.gitignore`)
- Use hardcoded secrets in code
- Share `.env` files via Slack/email
- Use production secrets in development
- Store secrets in CI/CD logs or artifacts

**Example `.env.example`:**
```bash
# Authentication
JWT_SECRET=<your-jwt-secret>  # Generate with: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
DELEGATION_JWT_SECRET=<your-delegation-jwt-secret>

# Database
POSTGRES_PASSWORD=<your-postgres-password>

# External APIs
OPENROUTER_API_KEY=<your-openrouter-api-key>

# Secrets Manager (production only)
SECRETS_BACKEND=env  # Options: env, aws, vault
AWS_DEFAULT_REGION=us-east-1  # For AWS Secrets Manager
VAULT_ADDR=http://vault:8200  # For HashiCorp Vault
```

---

### Team Training Checklist

Conduct training session with all team members covering:

```
[ ] Secret management fundamentals
    - What is a secret?
    - Why secrets in git history are critical
    - How secrets manager works

[ ] Hands-on: Using secrets manager
    - Retrieving secrets via CLI
    - Adding new secrets
    - Rotating existing secrets

[ ] Pre-commit hooks demonstration
    - How gitleaks detects secrets
    - How to handle false positives
    - How to bypass (with approval)

[ ] Incident response walkthrough
    - Who to contact
    - What to do if you commit a secret
    - How to rotate credentials

[ ] Security best practices
    - .env.example vs .env
    - Placeholder patterns
    - Production vs development secrets
    - Least privilege principle

[ ] Q&A session

[ ] Documentation review
    - Where to find this runbook
    - How to update procedures
    - Who owns security documentation
```

---

## Appendices

### Appendix A: Gitleaks Configuration

Create `.gitleaks.toml` for customized secret detection:

```toml
title = "Gitleaks Configuration"

[[rules]]
description = "Generic API Key"
regex = '''(?i)(api[_-]?key|apikey|api[_-]?secret)(["\s:=]+)?([a-zA-Z0-9_\-]{20,})'''
tags = ["key", "API"]

[[rules]]
description = "JWT Token"
regex = '''eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'''
tags = ["jwt"]

[[rules]]
description = "PostgreSQL Connection String"
regex = '''postgres(ql)?://[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+:\d+/[a-zA-Z0-9_-]+'''
tags = ["database", "postgres"]

[[rules]]
description = "AWS Access Key ID"
regex = '''AKIA[0-9A-Z]{16}'''
tags = ["aws", "access-key"]

[[rules]]
description = "Generic Secret"
regex = '''(?i)(secret|password|passwd|pwd|token)(["\s:=]+)?([a-zA-Z0-9_\-]{16,})'''
tags = ["secret", "password"]

[allowlist]
description = "Allowlisted files"
paths = [
    '''.env.example$''',
    '''docs/security.md$''',  # This file (contains example placeholders)
]

[allowlist]
regexes = [
    '''<[A-Z_]+>''',  # Placeholder pattern: <SECRET>
    '''\$\{[A-Z_]+\}''',  # Shell variable: ${SECRET}
    '''\{\{[A-Z_]+\}\}''',  # Template: {{SECRET}}
    '''your_[a-z_]+_here''',  # Obvious placeholder
    '''changeme''',  # Obvious placeholder
    '''placeholder''',  # Obvious placeholder
]
```

---

### Appendix B: Secrets Rotation Automation

Future enhancement: Automate secrets rotation with AWS Lambda or scheduled job.

**Example: Automated JWT Secret Rotation (AWS Lambda)**

```python
import boto3
import secrets
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """Rotate JWT secret every 90 days."""

    secretsmanager = boto3.client('secretsmanager')
    secret_name = 'project/prod/jwt-secret'

    # Check when secret was last rotated
    response = secretsmanager.describe_secret(SecretId=secret_name)
    last_rotated = response.get('LastRotatedDate')

    if last_rotated and (datetime.now() - last_rotated) < timedelta(days=90):
        print("Secret rotation not due yet")
        return

    # Generate new secret
    new_secret = secrets.token_urlsafe(32)

    # Update secret in Secrets Manager
    secretsmanager.update_secret(
        SecretId=secret_name,
        SecretString=new_secret
    )

    # Trigger rolling restart of backend service
    # (Implementation depends on deployment platform)

    print(f"Rotated {secret_name} successfully")
```

**Deployment:**
```bash
# Create Lambda function
aws lambda create-function \
  --function-name RotateJWTSecret \
  --runtime python3.12 \
  --role arn:aws:iam::ACCOUNT_ID:role/LambdaSecretsRotation \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://function.zip

# Schedule rotation (every 90 days)
aws events put-rule \
  --name RotateJWTSecretSchedule \
  --schedule-expression "rate(90 days)"

aws events put-targets \
  --rule RotateJWTSecretSchedule \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT_ID:function:RotateJWTSecret"
```

---

### Appendix C: Compliance Mapping

| Control | Requirement | Implementation | Status |
|---------|------------|----------------|--------|
| **Secrets Management** | No hardcoded credentials | Secrets manager (AWS/Vault) | In Progress |
| **Access Control** | Least privilege access | IAM policies, Vault policies | Pending |
| **Audit Logging** | Log all secret access | CloudTrail, Vault audit log | Pending |
| **Encryption in Transit** | TLS 1.2+ for all APIs | HTTPS, HSTS headers | Implemented |
| **Encryption at Rest** | Database encryption | PostgreSQL encryption | Implemented |
| **CSRF Protection** | Token-based CSRF | CSRF middleware | Implemented (disabled) |
| **Rate Limiting** | Prevent brute force | SlowAPI + Redis | Pending |
| **File Validation** | Validate uploads | python-magic, size limits | Pending |
| **Security Headers** | HSTS, CSP, etc. | Security headers middleware | Partial |
| **Dependency Scanning** | Automated vulnerability scan | Dependabot, pip-audit | Pending |
| **Incident Response** | Documented procedures | This runbook | Complete |

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-24 | Security Team | Initial version - incident response to .env exposure |

---

**Document Owner:** Security Team
**Review Frequency:** Quarterly
**Next Review:** 2026-05-24
