# C2H Employee Portal Build Spec

## Goal

Add a focused employee portal to the existing RecruitDesk portal for C2H employees. The first rollout should support:

- employee login
- attendance check-in/check-out with GPS coordinates
- monthly leave balance and leave requests
- employee document uploads
- company-side payroll and statutory document uploads
- tax regime selection (`old` / `new`)

This design is intentionally narrow so one employee can onboard within 2 days and the same structure can scale to more employees later.

## Recommended approach

Build this as a third portal mode inside the existing portal app, alongside:

- recruiter portal
- client portal
- employee portal

Why this is the lowest-risk option:

- existing portal auth patterns already exist in `src/auth-store.js`
- existing portal shell and routing already exist in `portal-react/src/App.jsx`
- existing file storage helper already exists in `src/storage.js`
- existing server routing style already exists in `server.js`

## MVP scope

### Employee-facing

- login with employee code / username + password
- dashboard with today attendance state
- check-in with browser geolocation
- check-out with browser geolocation
- leave balance card
- apply leave form
- tax regime selector
- upload employee documents
- view company-uploaded documents

### Admin-facing

- create employee login
- map employee to company and work location
- attendance register
- approve / reject leave
- upload salary docs, salary slips, Form 16, policy docs
- review employee uploaded docs

## Portal placement

### URL strategy

Add these routes:

- `/employee`
- `/employee-login`
- `/employee-portal`

Use the same portal app bundle (`public/portal-app`) and route by URL mode the same way client portal detection currently works.

### Frontend mode strategy

Current app already switches between recruiter and client modes. Extend that mode detection to support:

- `recruiter`
- `client`
- `employee`

Suggested local storage keys:

- `recruitdesk_portal_token`
- `recruitdesk_client_portal_token`
- `recruitdesk_employee_portal_token`
- `recruitdesk_auth_mode`

## Data model

Use the SQL migration in `sql/employee_portal.sql`.

### Core tables

- `employee_portal_users`
- `employee_profiles`
- `employee_work_sites`
- `employee_attendance_logs`
- `employee_leave_policies`
- `employee_leave_ledger`
- `employee_leave_requests`
- `employee_tax_preferences`
- `employee_documents`

### Design notes

- `employee_portal_users` stores login identity.
- `employee_profiles` stores employment metadata.
- `employee_work_sites` stores expected office/client location and geo-fence radius.
- `employee_attendance_logs` stores check-in/check-out coordinates and device details.
- `employee_leave_policies` stores accrual policy like `1 leave per month`.
- `employee_leave_ledger` stores balance movement.
- `employee_leave_requests` stores applied / approved / rejected leave.
- `employee_tax_preferences` stores old/new regime history.
- `employee_documents` stores both employee-uploaded and company-uploaded files in one table with `visibility` and `uploaded_by_role`.

## Authentication

### New backend auth functions

Add to `src/auth-store.js`:

- `createEmployeeUser`
- `resetEmployeeUserPassword`
- `loginEmployee`
- `getEmployeeSessionUser`
- `requireEmployeeSessionUser`
- `listCompanyEmployees`
- `saveEmployeeProfile`
- `getEmployeeProfile`

### Token model

Follow the same signed token pattern already used for client portal sessions:

- token type: `employee_portal`
- payload: `employeeUserId`, `employeeId`, `companyId`, `companyName`, `employeeCode`, `fullName`

### New auth endpoints

Add to `server.js`:

- `POST /employee-auth/login`
- `GET /employee-auth/me`
- `GET /company/employees`
- `POST /company/employees`
- `POST /company/employees/password`

## Attendance module

### Employee actions

- `POST /employee/attendance/check-in`
- `POST /employee/attendance/check-out`
- `GET /employee/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`

### Request payload

```json
{
  "latitude": 28.6139,
  "longitude": 77.2090,
  "accuracyMeters": 18,
  "addressLabel": "Client office",
  "note": "Reached office",
  "device": {
    "userAgent": "Mozilla/5.0",
    "platform": "Android"
  }
}
```

### Validation rules

- reject check-in if already checked in and no open check-out exists
- reject check-out if no open shift exists
- calculate distance from assigned work site if latitude/longitude exist
- mark status as:
  - `on_site`
  - `outside_radius`
  - `remote`
- store raw coordinates even if outside radius

### Admin endpoints

- `GET /company/employee-attendance?employeeId=...&from=...&to=...`
- `GET /company/employee-attendance/daily-summary?date=YYYY-MM-DD`

## Leave module

### Policy

For phase 1, use:

- accrual: `1 leave per month`
- no carry-forward logic in MVP
- monthly credit via manual admin action or simple scheduled backfill later

### Employee actions

- `GET /employee/leave/balance`
- `GET /employee/leave/requests`
- `POST /employee/leave/requests`

### Admin actions

- `GET /company/employee-leave?employeeId=...`
- `POST /company/employee-leave/:requestId/approve`
- `POST /company/employee-leave/:requestId/reject`
- `POST /company/employee-leave/credit`

### Leave request payload

```json
{
  "startDate": "2026-05-12",
  "endDate": "2026-05-12",
  "leaveType": "paid_leave",
  "reason": "Personal work"
}
```

### Approval logic

- on apply:
  - create `employee_leave_requests` row with `pending`
- on approve:
  - verify enough balance
  - update request to `approved`
  - insert negative row in `employee_leave_ledger`
- on reject:
  - mark request `rejected`
  - no ledger deduction

## Tax regime module

### Employee actions

- `GET /employee/tax-preference`
- `POST /employee/tax-preference`

### Payload

```json
{
  "regime": "new",
  "effectiveFrom": "2026-04-01",
  "declarationNote": "Chosen during onboarding"
}
```

Store the current selection plus history of updates.

## Document center

### Shared document table

Use `employee_documents` with:

- `visibility = employee`
  - employee can see and upload
- `visibility = company`
  - company uploads, employee can view
- `document_owner = employee_upload` or `company_upload`

### Employee upload categories

- `pan`
- `aadhaar`
- `bank_proof`
- `photo`
- `address_proof`
- `resume`
- `fbp_bill`
- `tax_declaration`
- `other`

### Company upload categories

- `offer_letter`
- `salary_structure`
- `salary_slip`
- `form16`
- `policy_document`
- `reimbursement_statement`
- `other`

### Endpoints

- `GET /employee/documents`
- `POST /employee/documents`
- `GET /company/employee-documents?employeeId=...`
- `POST /company/employee-documents`

### Storage model

Reuse existing file storage helper:

- upload file through `storeUploadedFile`
- persist returned provider/key/url metadata in `employee_documents.file_payload`

Suggested metadata payload in DB:

```json
{
  "provider": "s3",
  "key": "employee-docs/company/employee/file.pdf",
  "url": "https://...",
  "filename": "file.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 204800
}
```

## Frontend screens

### New employee portal screens

- `EmployeeLoginScreen`
- `EmployeePortalApp`
- `EmployeeDashboard`
- `EmployeeAttendancePage`
- `EmployeeLeavePage`
- `EmployeeDocumentsPage`
- `EmployeeProfilePage`

### Recruiter/admin portal additions

Add one new nav section in recruiter portal:

- `Employees`

Suggested pages:

- `Employee Admin`
- `Attendance Register`
- `Leave Desk`
- `Employee Documents`

## Frontend behavior details

### Attendance UX

- show `Check In` button if no open shift
- show `Check Out` button if checked in
- show permission prompt help text if location blocked
- show coordinates and accuracy after successful mark

### Leave UX

- show `Available`, `Pending`, `Used`
- disable submission if leave dates are invalid
- show request history

### Documents UX

- separate tabs:
  - `Upload My Docs`
  - `My Payroll Docs`
- show upload status, upload date, and file preview/download link

## Build order

### Day 1

- add SQL tables
- add employee auth functions
- add employee login route and session handling
- add employee profile CRUD
- add attendance APIs
- add employee attendance page

### Day 2

- add leave APIs and balance logic
- add tax regime APIs
- add document APIs
- add admin pages for attendance, leave, and documents

## Suggested API contract list

### Auth

- `POST /employee-auth/login`
- `GET /employee-auth/me`

### Employee self-service

- `GET /employee/me`
- `GET /employee/dashboard`
- `POST /employee/attendance/check-in`
- `POST /employee/attendance/check-out`
- `GET /employee/attendance`
- `GET /employee/leave/balance`
- `GET /employee/leave/requests`
- `POST /employee/leave/requests`
- `GET /employee/tax-preference`
- `POST /employee/tax-preference`
- `GET /employee/documents`
- `POST /employee/documents`

### Admin

- `GET /company/employees`
- `POST /company/employees`
- `POST /company/employees/password`
- `GET /company/employee-attendance`
- `GET /company/employee-leave`
- `POST /company/employee-leave/credit`
- `POST /company/employee-leave/:requestId/approve`
- `POST /company/employee-leave/:requestId/reject`
- `GET /company/employee-documents`
- `POST /company/employee-documents`

## Security notes

- employee tokens must only access rows for their own `employee_id` and `company_id`
- recruiter/admin routes must always scope by `company_id`
- payroll documents should never be visible to other employees
- location data is sensitive, so avoid exposing raw coordinates in broad list APIs unless needed

## Phase 2 ideas

- selfie verification on attendance
- periodic live location while on shift
- leave calendar
- monthly payroll packet auto-publish
- acknowledgement tracking for salary slips / policy docs
- geo-fence exception reporting

## Recommended first production rollout

For the onboarding happening in 2 days, use this exact slice:

- one employee account
- one work site
- check-in/check-out with coordinates
- leave request with 1 leave per month
- tax regime selection
- employee document uploads
- admin payroll uploads

This gives the client a working employee ops portal without expanding into full HRMS complexity.
