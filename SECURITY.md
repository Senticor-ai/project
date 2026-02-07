# Security Policy

## Supported Scope

Security reports are accepted for:

- `backend/` (API, auth/session handling, import/upload endpoints)
- `frontend/` (client-side auth/session usage and data handling)
- `infra/` manifests used for local/deployment setup

## Reporting a Vulnerability

Do not open public issues for suspected vulnerabilities.

Please report privately to project maintainers with:

- vulnerability type and impact
- affected component/file
- reproduction steps or proof of concept
- suggested mitigation (if known)

If this repository is hosted on GitLab, prefer a private vulnerability report/security advisory workflow there.

## Response Targets

- Initial acknowledgement: within 5 business days
- Triage and severity assessment: as soon as reproducible
- Fix timeline: based on severity and exploitability

## Disclosure

- Coordinate disclosure with maintainers.
- Public disclosure should happen after a fix is available or a mitigation is documented.

## Secrets and Hardening Basics

- Never commit `.env` or credentials.
- Rotate credentials immediately if exposure is suspected.
- Use least-privilege DB and API credentials.
- Keep dependencies updated and run regular security scans.
