# Certificates — Phase 5 domain policies

> Status: ACTIVE (Phase 5). Deterministic eligibility (NO AI), real
> issuance/revocation flows, public verification and real server-side PDF.

## 1. Policy V-INTERN-COMPLETE v1 (spec 42/43)

Eligible when ALL of (persisted facts only):

1. Recruitment `passed` (`recruitment_profiles.status = 'passed'`).
2. At least one COMPLETED internship assignment.
3. Latest finalized instructor evaluation `overallScore >= 70` (by
   `finalizedAt DESC`); none → ineligible.
4. Latest KPI result of a FINALIZED period with `status='calculated'` and
   `finalScore >= 70`; none → ineligible.

Thresholds are inclusive. Every reason is structured — the API answers
`409 CERTIFICATE_NOT_ELIGIBLE` with
`details.reasons: [{requirement, satisfied, detail}]`. Issuance stamps
`(policyCode, policyVersion)` onto the certificate: future threshold
changes ship as version 2 and NEVER retroactively mutate old
certificates. The policy row is idempotently upserted
(`certificate_policies`, UNIQUE `(code, version)`).

## 2. Identity fields (spec 46/47)

- `certificateNumber`: `VINT-<UTC year>-<8-digit sequence>` from the SQL
  Server SEQUENCE `certificate_number_seq` — concurrency-safe by the
  engine, never `count()+1`.
- `verificationCode`: 24 random bytes, base64url — unguessable and
  distinct from the DB id.

Uniqueness (DB-enforced): certificateNumber, verificationCode, and
`(userId, policyCode, policyVersion)` — a double issue (even concurrent)
yields exactly one certificate; the loser gets
`409 CERTIFICATE_ALREADY_ISSUED` (spec 70).

## 3. Status + revocation (spec 45/50)

`issued | revoked` only; issued certificates are NEVER physically
deleted. Revoke (admin, `certificates.manage`) requires a reason,
preserves the record + issue metadata, adds revoke metadata, writes audit
+ activity, notifies the intern. A second revoke is deterministic:
`409 CERTIFICATE_ALREADY_REVOKED`.

## 4. Public verification (spec 47/48)

`GET /api/v1/certificates/verify/:verificationCode` — PUBLIC (no auth).

Issued:
```json
{ "valid": true, "status": "issued", "certificateNumber": "VINT-2026-00000001",
  "holderName": "…", "role": "Backend Developer", "projectName": "…", "issuedAt": "…" }
```

Revoked: `{ "valid": false, "status": "revoked", "certificateNumber": "…", "issuedAt": "…", "revokedAt": "…" }`
(holder/role/project withheld). Unknown code → `404
CERTIFICATE_VERIFICATION_NOT_FOUND`. NEVER exposed: email, userId,
evaluation comments, KPI internals.

## 5. PDF (spec 51-53)

`GET /certificates/:id/pdf` (certificates.view) and
`GET /intern/me/certificates/:id/pdf` (owner). REAL server-side
generation with **pdfkit** — never a screenshot:

- Deterministic: content derives ONLY from persisted data and
  CreationDate/ModDate are pinned to `issuedAt` → identical bytes for the
  same certificate.
- Vietnamese-safe: DejaVu Sans (bundled `dejavu-fonts-ttf`).
- Identity fields are also carried in the Info dictionary (Title =
  certificate number, Keywords include the verification code) — pdfkit
  subsets all fonts to glyph-ID streams, so the Info dict is the
  machine-verifiable representation.
- Contains: V-Intern branding, certificate number, holder name,
  role/project/session context, issue date, policy code+version,
  verification code and the verification URL from
  `CERTIFICATE_VERIFY_BASE_URL` (no hardcoded host), plus an explicit
  "VIRTUAL — no payroll value" note.
- Served for ISSUED certificates only; revoked → `409
  CERTIFICATE_ALREADY_REVOKED` (the public verify endpoint communicates
  revocation). Generated on request from the DB — no object storage; the
  database remains the single source of truth.

## 6. API surface

Admin/management: `GET /certificates`, `POST /certificates/issue`,
`GET /certificates/:id`, `POST /certificates/:id/revoke`,
`GET /certificates/:id/pdf`, plus the PUBLIC
`GET /certificates/verify/:code`.
Intern: `GET /intern/me/certificates(?:id)` and
`GET /intern/me/certificates/:id/pdf`.

Permissions: `certificates.view|manage|view.own|verify`
(manage = admin policy). Notification category: `certificate`
(`certificate.issued`, `certificate.revoked`).
