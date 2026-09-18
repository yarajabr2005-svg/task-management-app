```markdown
# User API Contracts

> This document defines the complete HTTP API surface for all user‑related operations in the Task Management System.  
> It covers authentication, authorization, profile management, account lifecycle, and administrative user operations.  
> These contracts are designed according to industry standards used in modern backend systems (e.g., Stripe, GitHub, Notion), and follow the project’s architectural decisions:
>
> - JWT access tokens + refresh tokens
> - Refresh‑token rotation with reuse detection
> - Soft deletion for accounts
> - Email verification before login
> - Evolving the schema only when the corresponding feature exists
> - Separation of domain errors from transport‑layer HTTP errors
>
> This file is meant to be consumed by backend developers, frontend developers, and QA engineers. It defines the **shape**, **behavior**, and **semantics** of every user‑related endpoint.

---

# Conventions

### Base URL

All endpoints are prefixed with:
```

/api/v1

```

### Authentication
- **Access token**
  Sent via HTTP header:
```

Authorization: Bearer <access_token>

```
Short‑lived (15 minutes).
Used for all authenticated operations.

- **Refresh token**
Sent and stored as a **Secure, HttpOnly cookie**:
```

refresh_token=<jwt>

```
Long‑lived (7 days).
Rotated on every refresh.
Reuse detection triggers global session invalidation.

### Content Type
All requests and responses use:

```

Content-Type: application/json

````

### Error Envelope
```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human readable message.",
    "details": {
      "field": "optional extra info"
    }
  }
}
````

---

# 1. Register User

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/register`
- **Auth:** Public

### Request Body

```json
{
  "email": "user@example.com",
  "password": "PlainTextPassword123",
  "username": "yara_dev"
}
```

### Success Response — 201 Created

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "avatar": null,
    "bio": "",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:13:00.000Z"
  }
}
```

### Error Responses

- **400** — invalid body  
  `VALIDATION_ERROR`
- **409** — email or username already exists  
  `EMAIL_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS`
- **422** — password or username violates policy  
  `PASSWORD_POLICY_VIOLATION`, `USERNAME_POLICY_VIOLATION`

---

# 2. Login

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/login`
- **Auth:** Public

### Request Body

```json
{
  "email": "user@example.com",
  "password": "PlainTextPassword123"
}
```

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "avatar": null,
    "bio": "",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:13:00.000Z"
  },
  "accessToken": "jwt-access-token-string",
  "accessTokenExpiresAt": "2026-09-18T14:28:00.000Z"
}
```

Refresh token is set via:

```
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Lax
```

### Error Responses

- **400**  
  `VALIDATION_ERROR`
- **401**  
  `INVALID_CREDENTIALS`
- **403**  
  `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`

---

# 3. Logout (current session)

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/logout`
- **Auth:** Access token required

### Success Response — 204 No Content

### Error Responses

- **401**  
  `UNAUTHENTICATED`

---

# 4. Logout All Sessions (with optional password confirmation)

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/logout-all`
- **Auth:** Access token required

### Request Body (optional)

```json
{
  "password": "PlainTextPassword123"
}
```

### Success Response — 204 No Content

### Error Responses

- **401**  
  `UNAUTHENTICATED`
- **403**  
  `INVALID_CURRENT_PASSWORD`

---

# 5. Refresh Access Token

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/refresh`
- **Auth:** Refresh token cookie

### Success Response — 200 OK

```json
{
  "accessToken": "new-jwt-access-token",
  "accessTokenExpiresAt": "2026-09-18T14:28:00.000Z"
}
```

### Error Responses

- **401**  
  `INVALID_REFRESH_TOKEN`
- **409**  
  `REFRESH_TOKEN_REUSE_DETECTED`

---

# 6. Email Verification — Request

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/verify-email/request`
- **Auth:** Access token required

### Success Response — 202 Accepted

```json
{
  "message": "Verification email sent if account exists and is not already verified."
}
```

---

# 7. Email Verification — Confirm

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/verify-email/confirm`
- **Auth:** Public

### Request Body

```json
{
  "token": "verification-token-from-email"
}
```

### Success Response — 200 OK

```json
{
  "message": "Email verified successfully."
}
```

### Error Responses

- **400**  
  `VALIDATION_ERROR`
- **410**  
  `VERIFICATION_TOKEN_EXPIRED`
- **404**  
  `VERIFICATION_TOKEN_NOT_FOUND`

---

# 8. Forgot Password

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/password/forgot`
- **Auth:** Public

### Success Response — 202 Accepted

```json
{
  "message": "If the account exists, a reset email has been sent."
}
```

---

# 9. Reset Password (via email)

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/password/reset`
- **Auth:** Public

### Request Body

```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewPlainTextPassword123"
}
```

### Success Response — 200 OK

```json
{
  "message": "Password reset successfully."
}
```

### Error Responses

- **400**  
  `VALIDATION_ERROR`
- **410**  
  `RESET_TOKEN_EXPIRED`
- **404**  
  `RESET_TOKEN_NOT_FOUND`

---

# 10. Change Password (logged‑in)

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/auth/password/change`
- **Auth:** Access token required

### Request Body

```json
{
  "currentPassword": "OldPlainTextPassword123",
  "newPassword": "NewPlainTextPassword123"
}
```

### Success Response — 200 OK

```json
{
  "message": "Password changed successfully."
}
```

### Error Responses

- **401**  
  `UNAUTHENTICATED`
- **403**  
  `INVALID_CURRENT_PASSWORD`
- **422**  
  `PASSWORD_POLICY_VIOLATION`

---

# 11. Get Current User Profile

### Endpoint

- **Method:** `GET`
- **Route:** `/api/v1/users/me`
- **Auth:** Access token required

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "avatar": null,
    "bio": "",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:13:00.000Z"
  }
}
```

---

# 12. Update Current User Profile

### Endpoint

- **Method:** `PATCH`
- **Route:** `/api/v1/users/me`
- **Auth:** Access token required

### Request Body

```json
{
  "username": "new_username",
  "avatar": "https://example.com/avatar.png",
  "bio": "New bio up to 300 characters."
}
```

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "new_username",
    "role": "user",
    "avatar": "https://example.com/avatar.png",
    "bio": "New bio up to 300 characters.",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T15:00:00.000Z"
  }
}
```

### Error Responses

- **401**  
  `UNAUTHENTICATED`
- **409**  
  `USERNAME_ALREADY_EXISTS`
- **422**  
  `PROFILE_VALIDATION_ERROR`

---

# 13. Delete Account (soft delete + optional password confirmation)

### Endpoint

- **Method:** `DELETE`
- **Route:** `/api/v1/users/me`
- **Auth:** Access token required

### Request Body (optional)

```json
{
  "password": "PlainTextPassword123"
}
```

### Success Response — 204 No Content

### Error Responses

- **401**  
  `UNAUTHENTICATED`
- **403**  
  `INVALID_CURRENT_PASSWORD`

---

# 14. Admin: List Users

### Endpoint

- **Method:** `GET`
- **Route:** `/api/v1/admin/users`
- **Auth:** Access token + admin role

### Query Params

- `q` — search term
- `status` — `active` | `deleted`
- `page`, `limit`

### Success Response — 200 OK

```json
{
  "users": [
    {
      "id": "64f1c9b8f1a2c0012345678",
      "email": "user@example.com",
      "username": "yara_dev",
      "role": "user",
      "isDeleted": false,
      "createdAt": "2026-09-18T14:13:00.000Z",
      "updatedAt": "2026-09-18T14:13:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

# 15. Admin: Get User by ID

### Endpoint

- **Method:** `GET`
- **Route:** `/api/v1/admin/users/:id`
- **Auth:** Access token + admin role

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "isDeleted": false,
    "avatar": null,
    "bio": "",
    "createdAt": "2026-09-18T14:13:00.000Z",
    "updatedAt": "2026-09-18T14:13:00.000Z"
  }
}
```

---

# 16. Admin: Soft Delete User

### Endpoint

- **Method:** `DELETE`
- **Route:** `/api/v1/admin/users/:id`
- **Auth:** Access token + admin role

### Success Response — 204 No Content

---

# 17. Admin: Restore User

### Endpoint

- **Method:** `POST`
- **Route:** `/api/v1/admin/users/:id/restore`
- **Auth:** Access token + admin role

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "user",
    "isDeleted": false
  }
}
```

---

# 18. Admin: Promote/Demote User

### Endpoint

- **Method:** `PATCH`
- **Route:** `/api/v1/admin/users/:id/role`
- **Auth:** Access token + admin role

### Request Body

```json
{
  "role": "admin"
}
```

### Success Response — 200 OK

```json
{
  "user": {
    "id": "64f1c9b8f1a2c0012345678",
    "email": "user@example.com",
    "username": "yara_dev",
    "role": "admin"
  }
}
```

---

# Error Mapping

### Domain → HTTP → Error Code

| Domain Exception         | HTTP Status       | Example Codes                                                                     |
| ------------------------ | ----------------- | --------------------------------------------------------------------------------- |
| ValidationError          | 400 Bad Request   | `VALIDATION_ERROR`                                                                |
| AuthenticationError      | 401 Unauthorized  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                          |
| AuthorizationError       | 403 Forbidden     | `FORBIDDEN`, `ACCOUNT_DISABLED`, `INVALID_CURRENT_PASSWORD`                       |
| ResourceNotFoundError    | 404 Not Found     | `USER_NOT_FOUND`, `TOKEN_NOT_FOUND`                                               |
| ConflictError            | 409 Conflict      | `EMAIL_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS`, `REFRESH_TOKEN_REUSE_DETECTED` |
| GoneError                | 410 Gone          | `VERIFICATION_TOKEN_EXPIRED`, `RESET_TOKEN_EXPIRED`                               |
| UnprocessableEntityError | 422 Unprocessable | `PASSWORD_POLICY_VIOLATION`, `PROFILE_VALIDATION_ERROR`, `ROLE_VALIDATION_ERROR`  |

### Error Envelope Example

```json
{
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "A user with this email already exists.",
    "details": {
      "email": "user@example.com"
    }
  }
}
```

---

# End of File

```

```
