# Hosted Apply Link Spec

This module gives RecruitDesk its own apply link so agencies can collect applicants directly through
RecruitDesk instead of depending on external form limitations.

## Goal

Provide a RecruitDesk-hosted apply flow that guarantees:

- candidate details intake
- CV upload
- S3 storage
- applicant creation in `Applied Candidates`

## Why This Exists

Some external connectors can send only candidate details.

RecruitDesk-hosted apply links solve this by giving the product full control over:

- file upload
- validation
- job context
- storage
- parsing

## Product Flow

1. Admin creates or selects a JD
2. RecruitDesk generates an apply link for that JD
3. Agency posts that link anywhere
   - website
   - LinkedIn job post
   - Naukri job post
   - WhatsApp
   - email
4. Candidate opens the RecruitDesk-hosted apply page
5. Candidate fills the form and uploads CV
6. RecruitDesk stores CV in S3
7. Applicant lands in `Applied Candidates`
8. Admin assigns the applicant
9. Applicant moves into `Captured Notes`

## URL Shape

Recommended:

- `/apply/<job-id>`

Examples:

- `/apply/call-centre-manager-team-lead`
- `/apply/software-engineer-image-processing`

## Hosted Form Fields

Required:

- candidate name
- email
- phone
- current location
- CV upload

Recommended:

- current company
- current designation
- total experience
- current CTC
- notice period
- major skill / domain
- additional message

Hidden context:

- `companyId`
- `jobId`
- `jdTitle`
- `sourcePlatform = hosted_apply`
- `sourceLabel = RecruitDesk Apply Link`

## Backend Contract

The hosted apply form should still post into:

- `POST /public/applicants/intake`

This keeps one common intake path for:

- hosted apply links
- website forms
- webhooks

## CV Handling

Hosted apply link should guarantee:

1. CV file reaches backend
2. backend stores file in S3
3. applicant metadata stores:
   - `cv_filename`
   - `cv_url`
   - `parse_status`
4. applicant detail shows CV information

## Source Values

Hosted apply links should persist:

- `source = website_apply` or later `hosted_apply`

Recommended long-term value:

- `source = hosted_apply`

This allows filtering between:

- agency website connector
- RecruitDesk-hosted apply link

## UI Outcome

After successful submission:

- applicant appears in `Applied Candidates`
- card shows:
  - candidate name
  - JD
  - source
  - applied date
  - CV filename
  - parse status

## Recommended Build Order

1. create public hosted apply page
2. support job-specific context from URL
3. upload CV directly to backend intake
4. save CV in S3
5. show applicant in inbox
6. later add AI parsing improvements

## Definition of Done

Hosted apply links are complete when:

1. a JD can generate an apply link
2. candidate can apply through that link
3. CV uploads successfully
4. CV is saved in S3
5. applicant appears in `Applied Candidates`
6. admin can assign normally

