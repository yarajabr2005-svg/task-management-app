# User and Authentication API Contracts

This document defines the versioned HTTP contract for registration, email verification, login, token sessions, password management, profiles, account deletion, roles, and administrative user operations.

It follows `requirements-and-decisions.md`. Task-resource operations belong in `task.api.contracts.md`.

## 1. Conventions

### Base URL

```text
/api/v1
```

### Access-token authentication

Authenticated endpoints require a valid short-lived JWT access token in this header:

```http
Authorization: Bearer <access_token>
```

The access token lifetime is 15 minutes. It must contain only the claims required for authorization, such as subject, role, issuer, audience, issued-at, and expiry. Passwords, refresh tokens, and sensitive profile data must never be JWT claims.

### Refresh-token authentication

Refresh tokens are used only by the refresh and logout-session endpoints. The raw refresh token is sent in a secure cookie:

```http
Set-Cookie: refresh_token=<opaque-or-jwt-token>; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth
```

The production cookie must use `Secure`. The exact `SameSite` value must match the deployment's frontend/API origins. Because browsers automatically send this cookie, refresh and logout-cookie endpoints require CSRF protection through strict same-site policy plus origin checks or a CSRF-token strategy.

The refresh-token lifetime is 7 days. The server stores only a cryptographic hash of the refresh token in a session record. It never stores the raw refresh token in MongoDB, logs, responses, or audit records.

### Content type

Requests with JSON bodies use `Content-Type: application/json`. JSON responses use `application/json`, except `204 No Content` responses.

### Identifier format

User identifiers are 24-character hexadecimal MongoDB ObjectIds. A malformed identifier returns `400 INVALID_USER_ID`. A valid but missing, deleted, or inaccessible user returns `404 USER_NOT_FOUND`.

### Public user representation

The public/current-user representation is:

```json
{
  "id": "64f1c9b8f1a2c0012345678",
  "email": "user@example.com",
  "username": "yara_dev",
  "role": "user",
  "emailVerified": true,
  "emailVerifiedAt": "2026-09-18T14:20:00.000Z",
  "avatar": null,
  "bio": "",
  "timezone": "Europe/Amsterdam",
  "createdAt": "2026-09-18T14:13:00.000Z",
  "updatedAt": "2026-09-18T14:20:00.000Z"
}
```

`passwordHash`, raw passwords, raw tokens, refresh-session records, internal deletion flags, and internal database fields are never returned. Admin responses may include safe account-status fields required for administration.

The current Mongoose model must evolve from `password` to `passwordHash` when password authentication is implemented. The API contract uses the final public behavior and never exposes either field.

### Error envelope

Every error uses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {}
  }
}
```

`details` contains safe field-level information when useful. Responses must not expose stack traces, database errors, token values, password information, or whether an email exists for forgot-password and verification-email requests.

### Pagination

Administrative collection endpoints accept:

- `page`: positive integer, default `1`.
- `limit`: integer from `1` to `100`, default `20`.

Paginated responses use:

```json
{
  "users": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## 2. Identity and Validation Rules

- Registration accepts `email`, `password`, and `username` only. The client cannot choose `role`, `isDeleted`, verification status, or timestamps.
- Email is trimmed and lowercased before lookup and storage. Email uniqueness is enforced by a database unique index.
- Username is trimmed, lowercased, unique, and must match `^[a-z0-9_.]{3,30}$`.
- Passwords are hashed with bcrypt before storage. The plaintext password exists only during the request and is never logged or persisted.
- The bcrypt cost factor must be configured centrally and reviewed as security guidance changes.
- The exact password policy must be documented and enforced consistently. It must at minimum reject passwords that are too short and should reject common/compromised passwords. A confirmation field may be accepted by the client but is never stored.
- `bio` is optional, trimmed, and limited to 300 characters.
- `avatar` is optional and must be either `null` or a validated HTTPS URL to an approved image host. File upload and image processing are separate contracts if added later.
- `timezone` is an IANA timezone such as `Europe/Amsterdam`. If omitted during registration, the server uses the configured default timezone.
- The server always assigns `role: "user"` during public registration.
- Duplicate email and username conflicts return `409`; database unique-index errors must be translated into the same API errors.

## 3. Register User

### Request

```http
POST /api/v1/auth/register
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "PlainTextPassword123!",
  "username": "yara_dev",
  "timezone": "Europe/Amsterdam"
}
```

The account is created with `role: "user"`, `emailVerified: false`, no active sessions, and no password-reset or verification token exposed to the client. The server sends a verification email through the configured email provider.

### Success: `201 Created`

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "emailVerified": false,
    "emailVerifiedAt": null,
    "avatar": null,
    "bio": "",
    "timezone": "Europe/Amsterdam",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:13:00.000Z"
  },
  "message": "Account created. Check your email to verify your account."
}
```

Registration does not log the user in or issue access/refresh tokens before email verification.

### Errors

- `400 VALIDATION_ERROR`
- `409 EMAIL_ALREADY_EXISTS` or `USERNAME_ALREADY_EXISTS`
- `422 PASSWORD_POLICY_VIOLATION` or `USERNAME_POLICY_VIOLATION`

## 4. Login

### Request

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "PlainTextPassword123!"
}
```

Email lookup is case-insensitive after normalization. A successful login creates a refresh session, sets the refresh-token cookie, and returns a short-lived access token.

### Success: `200 OK`

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "emailVerified": true,
    "emailVerifiedAt": "2026-09-18T14:20:00.000Z",
    "avatar": null,
    "bio": "",
    "timezone": "Europe/Amsterdam",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:20:00.000Z"
  },
  "accessToken": "jwt-access-token-string",
  "accessTokenExpiresAt": "2026-09-18T14:35:00.000Z"
}
```

The refresh token is returned only through `Set-Cookie`; it is never included in JSON. The server may update `lastLoginAt` when that field is implemented.

### Errors

- `400 VALIDATION_ERROR`
- `401 INVALID_CREDENTIALS`: use the same externally visible response for unknown email and wrong password.
- `403 EMAIL_NOT_VERIFIED`
- `403 ACCOUNT_DISABLED`
- `429 RATE_LIMITED`

## 5. Refresh Access Token

### Request

```http
POST /api/v1/auth/refresh
Cookie: refresh_token=<current-refresh-token>
Origin: https://app.example.com
```

The server validates the cookie, verifies the session hash, checks expiry and revocation, and atomically rotates the refresh session. Every successful request issues a new refresh cookie and access token. The previous refresh token is invalid immediately.

### Success: `200 OK`

```json
{
  "accessToken": "new-jwt-access-token",
  "accessTokenExpiresAt": "2026-09-18T14:35:00.000Z"
}
```

### Errors

- `400 CSRF_VALIDATION_FAILED`
- `401 INVALID_REFRESH_TOKEN`
- `401 REFRESH_SESSION_REVOKED`
- `409 REFRESH_TOKEN_REUSE_DETECTED`: revoke all sessions for the affected user and record an audit event.
- `429 RATE_LIMITED`

## 6. Logout Current Session

### Request

```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
Cookie: refresh_token=<current-refresh-token>
Origin: https://app.example.com
```

The server revokes only the refresh session represented by the current cookie and clears the refresh cookie. Logout is idempotent: a missing or already-revoked current session may still return success after clearing the cookie.

### Success: `204 No Content`

### Errors

- `400 CSRF_VALIDATION_FAILED`
- `401 UNAUTHENTICATED`

## 7. Logout All Sessions

### Request

```http
POST /api/v1/auth/logout-all
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "currentPassword": "PlainTextPassword123!"
}
```

The password confirmation is required for this security-sensitive operation. The server revokes every refresh session for the authenticated user and clears the current refresh cookie. This does not revoke the currently issued access JWT; it expires normally.

### Success: `204 No Content`

### Errors

- `401 UNAUTHENTICATED`
- `403 INVALID_CURRENT_PASSWORD`
- `429 RATE_LIMITED`

## 8. Request Email Verification

### Request

```http
POST /api/v1/auth/verify-email/request
Content-Type: application/json
```

```json
{
  "email": "user@example.com"
}
```

This endpoint is public because an unverified user cannot log in. It always returns the same response whether the account exists, is already verified, or is deleted. If appropriate, the server sends a new 30-minute verification token email. Tokens are cryptographically random, stored only as hashes, and single-use.

### Success: `202 Accepted`

```json
{
  "message": "If the account can receive verification mail, a verification email has been sent."
}
```

### Errors

- `400 VALIDATION_ERROR`
- `429 RATE_LIMITED`

## 9. Confirm Email Verification

### Request

```http
POST /api/v1/auth/verify-email/confirm
Content-Type: application/json
```

```json
{
  "token": "verification-token-from-email"
}
```

The server hashes the supplied token, finds an unexpired matching record, marks the user verified, and invalidates the token. The operation is single-use.

### Success: `200 OK`

```json
{
  "message": "Email verified successfully."
}
```

### Errors

- `400 VALIDATION_ERROR`
- `410 VERIFICATION_TOKEN_EXPIRED`
- `410 VERIFICATION_TOKEN_USED`
- `404 VERIFICATION_TOKEN_NOT_FOUND`

## 10. Request Password Reset

### Request

```http
POST /api/v1/auth/password/forgot
Content-Type: application/json
```

```json
{
  "email": "user@example.com"
}
```

The server always returns the same response and must not reveal whether the email exists. If an eligible account exists, it sends a cryptographically random, single-use reset token that expires after 15 minutes. Only the token hash is stored.

### Success: `202 Accepted`

```json
{
  "message": "If the account exists, a password reset email has been sent."
}
```

### Errors

- `400 VALIDATION_ERROR`
- `429 RATE_LIMITED`

## 11. Reset Password by Email

### Request

```http
POST /api/v1/auth/password/reset
Content-Type: application/json
```

```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewPlainTextPassword123!"
}
```

The server validates and consumes the token, hashes the new password with bcrypt, updates the password hash, and revokes all refresh sessions. The reset token cannot be reused.

### Success: `200 OK`

```json
{
  "message": "Password reset successfully. Please log in again."
}
```

### Errors

- `400 VALIDATION_ERROR`
- `410 RESET_TOKEN_EXPIRED`
- `410 RESET_TOKEN_USED`
- `404 RESET_TOKEN_NOT_FOUND`
- `422 PASSWORD_POLICY_VIOLATION`

## 12. Change Password While Logged In

### Request

```http
POST /api/v1/auth/password/change
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "currentPassword": "OldPlainTextPassword123!",
  "newPassword": "NewPlainTextPassword123!"
}
```

The server verifies the current password, stores the new bcrypt hash, and revokes all refresh sessions. The current access token remains valid until expiry unless the implementation adds a token-version or denylist strategy.

### Success: `200 OK`

```json
{
  "message": "Password changed successfully. Please log in again on your devices."
}
```

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 INVALID_CURRENT_PASSWORD`
- `422 PASSWORD_POLICY_VIOLATION`
- `429 RATE_LIMITED`

## 13. Get Current User Profile

```http
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

### Success: `200 OK`

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "emailVerified": true,
    "emailVerifiedAt": "2026-09-18T14:20:00.000Z",
    "avatar": null,
    "bio": "",
    "timezone": "Europe/Amsterdam",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:20:00.000Z"
  }
}
```

Errors: `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`.

## 14. Update Current User Profile

### Request

```http
PATCH /api/v1/users/me
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "username": "new_username",
  "avatar": "https://cdn.example.com/avatar.png",
  "bio": "New bio up to 300 characters.",
  "timezone": "Europe/Amsterdam"
}
```

This is a partial update. At least one allowed field is required. Allowed fields are `username`, `avatar`, `bio`, and `timezone`. Send `"avatar": null` to remove the profile picture and `"bio": ""` to clear the biography. Email, role, password, verification status, deletion status, and timestamps cannot be changed through this endpoint.

### Success: `200 OK`

Returns `{ "user": <public user representation> }`.

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `409 USERNAME_ALREADY_EXISTS`
- `422 PROFILE_VALIDATION_ERROR`

## 15. Delete Current Account

### Request

```http
DELETE /api/v1/users/me
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "currentPassword": "PlainTextPassword123!"
}
```

The current password is required. The server sets `isDeleted=true`, prevents future login and normal API access, revokes all refresh sessions, and records an audit event. The user document is not immediately permanently deleted.

### Success: `204 No Content`

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 INVALID_CURRENT_PASSWORD`

## 16. Admin Authorization Rules

All admin endpoints require a valid access token and `role: "admin"`. Public registration can never create an admin. The initial admin is created through a controlled seed/bootstrap process. Role changes and administrative lifecycle operations are audited.

Administrators must not receive password hashes, raw tokens, or unrelated private data. Admin access must not bypass task ownership unless the specific moderation route explicitly permits it.

An administrator must not be allowed to remove the last active administrator without a protected operational override.

## 17. Admin List Users

```http
GET /api/v1/admin/users?q=yara&status=active&role=user&emailVerified=true&page=1&limit=20
Authorization: Bearer <admin_access_token>
```

Query parameters:

- `q`: optional search over normalized username or email.
- `status`: `active` or `deleted`, default `active`.
- `role`: `user` or `admin`.
- `emailVerified`: `true` or `false`.
- `page` and `limit`.

### Success: `200 OK`

```json
{
  "users": [
    {
      "id": "64f1c9b8f1a2c0012345678",
      "email": "user@example.com",
      "username": "yara_dev",
      "role": "user",
      "emailVerified": true,
      "isDeleted": false,
      "avatar": null,
      "bio": "",
      "timezone": "Europe/Amsterdam",
      "createdAt": "2026-09-18T14:13:00.000Z",
      "updatedAt": "2026-09-18T14:20:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`.

## 18. Admin Get User

```http
GET /api/v1/admin/users/:id
Authorization: Bearer <admin_access_token>
```

Success: `200 OK` with `{ "user": <safe administrative user representation> }`.

Errors: `400 INVALID_USER_ID`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`.

## 19. Admin Soft-Delete User

```http
DELETE /api/v1/admin/users/:id
Authorization: Bearer <admin_access_token>
```

The server soft-deletes the target user, revokes all target-user refresh sessions, prevents login, and records an audit event. It must not allow an administrator to remove the last active administrator without an operational override.

Success: `204 No Content`.

Errors: `400 INVALID_USER_ID`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `409 LAST_ADMIN_PROTECTION`.

## 20. Admin Restore User

```http
POST /api/v1/admin/users/:id/restore
Authorization: Bearer <admin_access_token>
```

Restores a soft-deleted user without automatically logging them in. The user must still satisfy email-verification and account policies before login.

Success: `200 OK` with `{ "user": <safe administrative user representation> }`.

Errors: `400 INVALID_USER_ID`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `409 USER_ALREADY_ACTIVE`.

## 21. Admin Change User Role

### Request

```http
PATCH /api/v1/admin/users/:id/role
Authorization: Bearer <admin_access_token>
Content-Type: application/json
```

```json
{
  "role": "admin"
}
```

Allowed roles are `user` and `admin`. The operation records the actor, target, old role, and new role in the audit log. It must protect the last active administrator.

### Success: `200 OK`

Returns `{ "user": <safe administrative user representation> }`.

### Errors

- `400 INVALID_USER_ID` or `VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 USER_NOT_FOUND`
- `409 LAST_ADMIN_PROTECTION`

## 22. Admin Audit Logs

```http
GET /api/v1/admin/audit-logs?action=ROLE_CHANGED&actorId=<id>&targetUserId=<id>&page=1&limit=20
Authorization: Bearer <admin_access_token>
```

This endpoint returns filtered security and administrative audit records, not arbitrary application/server logs. Audit records may include action, actor ID, target user ID, timestamp, request correlation ID, and safe metadata. They must not contain passwords, raw tokens, or sensitive request bodies.

Success: `200 OK` with a paginated `auditLogs` collection.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`.

## 23. Error Mapping

| Condition                                                   | HTTP status | Code                                                                                                                              |
| ----------------------------------------------------------- | ----------: | --------------------------------------------------------------------------------------------------------------------------------- |
| Malformed JSON, identifier, or request validation failure   |         400 | `VALIDATION_ERROR`, `INVALID_USER_ID`, `CSRF_VALIDATION_FAILED`                                                                   |
| Missing or invalid access token                             |         401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `REFRESH_SESSION_REVOKED`                                      |
| Valid identity without permission or wrong current password |         403 | `FORBIDDEN`, `ACCOUNT_DISABLED`, `EMAIL_NOT_VERIFIED`, `INVALID_CURRENT_PASSWORD`                                                 |
| User or token not found                                     |         404 | `USER_NOT_FOUND`, `VERIFICATION_TOKEN_NOT_FOUND`, `RESET_TOKEN_NOT_FOUND`                                                         |
| Duplicate identity or protected admin operation             |         409 | `EMAIL_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS`, `REFRESH_TOKEN_REUSE_DETECTED`, `LAST_ADMIN_PROTECTION`, `USER_ALREADY_ACTIVE` |
| Expired or consumed token                                   |         410 | `VERIFICATION_TOKEN_EXPIRED`, `VERIFICATION_TOKEN_USED`, `RESET_TOKEN_EXPIRED`, `RESET_TOKEN_USED`                                |
| Valid input violates a configured policy                    |         422 | `PASSWORD_POLICY_VIOLATION`, `USERNAME_POLICY_VIOLATION`, `PROFILE_VALIDATION_ERROR`                                              |
| Too many requests                                           |         429 | `RATE_LIMITED`                                                                                                                    |

Login, forgot-password, and verification-email responses must be designed to prevent account enumeration. The implementation may use a generic response even when the table lists an internal domain condition.

## 24. Implementation and Testing Requirements

Before implementing these routes:

1. Add request validation for body, query, cookies, headers, and path parameters.
2. Implement bcrypt hashing and verification, then rename the stored field to `passwordHash` and exclude it from normal queries.
3. Create separate token/session records for refresh sessions, email verification, and password reset. Store only hashes and expiration metadata.
4. Implement atomic refresh-token rotation and reuse detection.
5. Add CSRF/origin protection to cookie-authenticated endpoints.
6. Scope normal user queries by authenticated user and `isDeleted: false`.
7. Add rate limits for login, refresh, verification, password reset, and password change.
8. Add audit records for login security events, role changes, account deletion/restoration, password changes/resets, refresh-token reuse, and administrative actions.
9. Test registration, duplicate identities, password hashing, unverified login rejection, login enumeration resistance, refresh rotation, reuse detection, logout, logout-all, password invalidation, reset invalidation, profile validation, soft deletion, admin authorization, last-admin protection, and audit behavior.
10. Configure secrets, cookie settings, CORS origins, email delivery, and environment-specific values outside source control.

This document must be updated in the same work session whenever an identity, authentication, session, profile, account-lifecycle, role, admin, response, or error behavior changes.
