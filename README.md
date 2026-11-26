# RIGCHEST Student Result Portal

A full-stack web application for managing academic records, examinations, marks, GPA/CGPA, result approval, and publication for **HAJIYA RAKIYA GERAWA COLLEGE OF HEALTH SCIENCE AND TECHNOLOGY KANO (RIGCHEST)**.

## Overview

The College Result Portal is designed to digitize and simplify the complete semester examination result management workflow.

The system provides separate functionality for administrators and students. Administrators can manage academic data, students, examinations, marks, result processing, and result publication. Students can search and view their published semester results through the public result portal.

## Key Features

### Admin Portal

* Secure administrator login
* Role-based access control
* Dashboard with system statistics
* Department management
* Program management
* Regulation management
* Batch management
* Semester management
* Subject management
* Grading policy management
* Curriculum mapping
* Student management
* Bulk student import using Excel
* Exam session management
* Regular examination management
* Revaluation examination management
* Exam registration management
* Current semester student auto-registration
* Arrear candidate registration
* Internal and external mark entry
* Bulk mark import using Excel
* Mark verification workflow
* Mark locking workflow
* Result processing
* GPA calculation
* CGPA calculation
* Arrear tracking
* Result publication workflow
* Versioned result publishing snapshots
* Exam registration PDF export
* Result data management

### Student Result Portal

* No student account login required
* Register number and admin-issued 10-digit Student PIN based result search
* Student PINs are generated on individual creation and Excel import
* Student PINs are stored as bcrypt hashes and can be reset by authorized administrators
* Published semester result viewing
* Subject-wise grade display
* GPA display
* CGPA display
* Credit information
* Arrear information
* Previous semester result history
* Grade sheet PDF download

## Technology Stack

### Frontend

* React
* Vite
* Tailwind CSS
* React Router DOM
* Axios
* XLSX
* JavaScript

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JSON Web Token
* bcryptjs
* Zod
* Multer
* XLSX
* PDFKit
* Helmet
* CORS
* Express Rate Limit
* Morgan
* Dotenv

### Database

MongoDB is used as the primary database with Mongoose as the ODM.

### Deployment

* Frontend: Vercel
* Backend: Render
* Database: MongoDB

## System Architecture

```text
                    ┌─────────────────────────┐
                    │        User Browser     │
                    │                         │
                    │   React + Vite +        │
                    │   Tailwind CSS          │
                    └────────────┬────────────┘
                                 │
                                 │ HTTP / REST API
                                 ▼
                    ┌─────────────────────────┐
                    │      Express.js API     │
                    │                         │
                    │ Authentication          │
                    │ Authorization           │
                    │ Validation              │
                    │ Business Logic          │
                    │ Result Processing       │
                    └────────────┬────────────┘
                                 │
                                 │ Mongoose
                                 ▼
                    ┌─────────────────────────┐
                    │        MongoDB          │
                    │                         │
                    │ Students                │
                    │ Subjects                │
                    │ Exams                   │
                    │ Marks                   │
                    │ Results                 │
                    │ Users                   │
                    └─────────────────────────┘
```

## User Roles

The system supports multiple administrative roles with different permissions.

### SUPER_ADMIN

Full system access including:

* Academic configuration
* Student management
* Exam management
* Mark management
* Result processing
* Result publication
* System administration

### EXAM_CELL_ADMIN

Responsible for examination and result operations including:

* Exam session management
* Student examination registration
* Mark management
* Result processing
* Result publication

### DEPARTMENT_ADMIN

Responsible for department-level academic operations including:

* Student management
* Examination registration
* Mark-related operations

### DATA_ENTRY_OPERATOR

Responsible mainly for entering examination marks.

### VERIFIER

Responsible for:

* Reviewing marks
* Verifying marks
* Locking verified marks
* Processing results

## Result Processing Workflow

```text
Academic Setup
      │
      ▼
Student Management
      │
      ▼
Exam Session Creation
      │
      ▼
Exam Registration
      │
      ▼
Mark Entry
      │
      ▼
Mark Verification
      │
      ▼
Mark Locking
      │
      ▼
Result Processing
      │
      ▼
GPA / CGPA Calculation
      │
      ▼
Result Approval
      │
      ▼
Result Publication
      │
      ▼
Student Result Portal
```

## Academic Setup

Before conducting an examination, the administrator can configure the academic structure.

The system supports:

1. Departments
2. Programs
3. Regulations
4. Batches
5. Semesters
6. Subjects
7. Grading Policies
8. Curriculum Mappings

This structure allows students, subjects, examinations, and results to be associated with the correct academic configuration.

## Student Management

The administrator can:

* Add individual students
* Update student information
* Manage student academic status
* Import multiple students using Excel
* Download an Excel import template
* Associate students with departments
* Associate students with programs
* Associate students with regulations
* Associate students with batches
* Associate students with semesters

Supported academic statuses include:

* ACTIVE
* GRADUATED
* DISCONTINUED

## Examination Management

The system supports different examination workflows.

### Regular Examination

Used for students appearing for their current semester examinations.

### Arrear Examination

Used for students appearing for subjects that they have not previously cleared.

### Revaluation Examination

Used for managing results associated with revaluation processes.

## Exam Registration

Students can be registered for subjects through the examination registration system.

The system supports:

* Current semester registration
* Arrear registration
* Automatic current semester registration
* Individual registration
* Eligibility management
* Registration data export

## Mark Management

The mark management module supports:

* Internal marks
* External marks
* Total marks
* Absent status
* Withheld status
* Malpractice status
* Excel mark import
* Bulk mark entry
* Mark verification
* Mark locking

### Mark Status Workflow

```text
DRAFT
  │
  ▼
VERIFIED
  │
  ▼
LOCKED
```

Locked marks are used for the result processing stage.

## Result Processing

The result processing module automatically processes examination marks based on the configured grading policy.

The system can:

* Determine pass or fail status
* Assign letter grades
* Assign grade points
* Calculate earned credits
* Calculate GPA
* Calculate CGPA
* Track arrears
* Generate semester summaries

The system also considers special examination conditions such as:

* Absent
* Withheld
* Malpractice

## Grading System

The grading policy is configurable according to the academic regulation.

The RIGCHEST implementation uses a **4.0 maximum grade-point scale**. Grade labels, mark ranges (up to 200 total marks), and grade points are configurable by an authorized administrator. Enter only the grade boundaries formally approved by the College; this repository intentionally does not assume or prefill an unapproved grading table.

## GPA and CGPA

The system calculates GPA and CGPA based on the configured grading policies, subject credits, and obtained grade points.

The system maintains semester-level summaries containing information such as:

* GPA
* CGPA
* Total credits
* Earned credits
* Arrear count

## Result Publication

Results are not immediately exposed to students after processing.

The system provides a controlled publication workflow.

```text
Result Processing
       │
       ▼
Result Verification
       │
       ▼
Result Approval
       │
       ▼
Result Publication
       │
       ▼
Public Result Portal
```

Published results are marked as published and can then be accessed through the student result portal.

The system also maintains publish snapshots to track different publication versions.

## Student Result Portal

Students can access the result portal without creating a student account.

The student provides:

* Register Number
* Admin-issued 10-digit Student PIN

Administrators can regenerate a PIN for an existing student. The raw PIN is shown only once when generated or during the immediate bulk-import result; only its bcrypt hash is stored in MongoDB.

The system validates the submitted information and returns only published results.

Students can view:

* Examination session
* Subject-wise grades
* Credits
* GPA
* CGPA
* Arrear information
* Previous semester results

Students can also download their grade sheet as a PDF.

## Authentication and Authorization

The administrator portal uses JWT-based authentication.

The authentication workflow is:

```text
Admin Login
    │
    ▼
Credential Validation
    │
    ▼
JWT Access Token
    │
    ▼
Authenticated API Requests
    │
    ▼
Role Verification
    │
    ▼
Authorized Operation
```

Passwords are securely hashed using bcryptjs.

Role-based middleware controls access to protected administrative operations.

## Security Features

The application includes several security mechanisms:

* JWT authentication
* Password hashing using bcryptjs
* Role-based access control
* Request validation using Zod
* Helmet security headers
* CORS configuration
* API rate limiting
* Environment variable based configuration
* Protected administrative routes
* Published-result filtering
* Centralized error handling

## Project Structure

```text
SRMS_Project/
│
├── backend/
│   ├── index.js                 # Vercel Express entry point
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   │
│   │   ├── config/
│   │   │   ├── constants.js
│   │   │   ├── db.js
│   │   │   └── env.js
│   │   │
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   ├── role.middleware.js
│   │   │   ├── validate.middleware.js
│   │   │   ├── error.middleware.js
│   │   │   └── notFound.middleware.js
│   │   │
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── departments/
│   │   │   ├── programs/
│   │   │   ├── regulations/
│   │   │   ├── batches/
│   │   │   ├── semesters/
│   │   │   ├── subjects/
│   │   │   ├── grading-policies/
│   │   │   ├── curriculum/
│   │   │   ├── students/
│   │   │   ├── exam-sessions/
│   │   │   ├── exam-registrations/
│   │   │   ├── mark-entries/
│   │   │   ├── results/
│   │   │   ├── publish/
│   │   │   ├── public-results/
│   │   │   └── dashboard/
│   │   │
│   │   ├── routes/
│   │   │   └── index.js
│   │   │
│   │   ├── seeds/
│   │   │   ├── seedAdmin.js
│   │   │   ├── resetBatches.js
│   │   │   ├── resetRegulations.js
│   │   │   └── resetSubjects.js
│   │   │
│   │   └── utils/
│   │       ├── apiError.js
│   │       ├── apiResponse.js
│   │       └── asyncHandler.js
│   │
│   ├── uploads/
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   │   ├── App.jsx
│   │   │   └── router.jsx
│   │   ├── components/
│   │   │   ├── common/
│   │   │   └── navigation/
│   │   ├── layouts/
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── AuthLayout.jsx
│   │   │   └── PublicLayout.jsx
│   │   ├── lib/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   └── public-results/
│   │   ├── store/
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── public/
│   │   └── college-logo.png
│   │
│   └── package.json
│
├── atlas-import/
│   ├── admins.json
│   └── users.json
│
└── .gitignore
```

## Database Models

The application uses MongoDB collections for managing different parts of the academic and examination workflow.

| Model             | Purpose                           |
| ----------------- | --------------------------------- |
| User              | Administrator accounts and roles  |
| Department        | College departments               |
| Program           | Academic programs                 |
| Regulation        | Academic regulations              |
| Batch             | Student batches                   |
| Semester          | Semester information              |
| Subject           | Subject information               |
| GradingPolicy     | Grade and mark rules              |
| CurriculumMapping | Subject curriculum mapping        |
| Student           | Student information               |
| ExamSession       | Examination sessions              |
| ExamRegistration  | Student examination registrations |
| MarkEntry         | Examination marks                 |
| ProcessedResult   | Processed subject results         |
| SemesterSummary   | GPA, CGPA and semester summary    |
| PublishSnapshot   | Result publication versions       |

## API Structure

The backend provides REST APIs for:

* Authentication
* Dashboard
* Departments
* Programs
* Regulations
* Batches
* Semesters
* Subjects
* Grading Policies
* Curriculum Mapping
* Students
* Exam Sessions
* Exam Registrations
* Mark Entries
* Result Processing
* Result Publication
* Public Results

All backend API routes are grouped under the `/api` prefix.

## Installation

### Prerequisites

Install the following before running the project:

* Node.js 18 or later
* npm
* MongoDB

### Clone the Repository

```bash
git clone <repository-url>
cd SRMS_Project
```

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file using `.env.example` and configure the required environment variables.

### Frontend Setup

```bash
cd ../frontend
npm install
```

Create a frontend environment file if required.

```text
VITE_API_BASE_URL=http://localhost:5000/api
```

### Start MongoDB

Make sure MongoDB is running locally or configure a MongoDB Atlas connection string.

### Create Admin Account

Run the admin seed command from the backend directory.

```bash
npm run seed:admin
```

Create the initial administrator using environment variables before running the seed command. Set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (at least 12 characters), `INITIAL_ADMIN_NAME`, and `INITIAL_ADMIN_MOBILE`. The seed script does not contain a default username or password. Keep these values private and never commit them to Git.

### Start Backend

```bash
cd backend
npm run dev
```

The backend runs on the configured server port.

### Start Frontend

```bash
cd frontend
npm run dev
```

The frontend runs using the Vite development server.

## Environment Variables

### Backend

```text
PORT=
NODE_ENV=
MONGO_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=
JWT_REFRESH_EXPIRES_IN=
FRONTEND_URL=
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
INITIAL_ADMIN_NAME=
INITIAL_ADMIN_MOBILE=
```

### Frontend

```text
VITE_API_BASE_URL=
```

Never commit `.env` files or production secrets to GitHub.

## Deployment

Production architecture selected for this repository:

- Frontend: GitHub Pages (Vite build from the `frontend` directory)
- Backend: Vercel Node.js / Express deployment (Vercel project root: `backend`)
- Database: MongoDB Atlas only
- Automation: GitHub Actions

### Vercel backend configuration

Set the Vercel project's Root Directory to `backend`. The backend exposes an Express app from `backend/index.js` and connects to MongoDB on incoming requests.

Configure these environment variables in the Vercel dashboard (never commit their values):

```text
NODE_ENV=production
MONGODB_URI=<MongoDB Atlas connection string>
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://kasuwarkanawa.github.io
INITIAL_ADMIN_EMAIL=<college admin email>
INITIAL_ADMIN_PASSWORD=<strong password of at least 12 characters>
INITIAL_ADMIN_NAME=<admin name>
INITIAL_ADMIN_MOBILE=<admin phone>
```

The backend accepts either `MONGODB_URI` or the legacy `MONGO_URI` variable. Restrict the MongoDB Atlas database user's network access appropriately and use a least-privilege database user.

After the first Vercel deployment, copy its API origin and set the GitHub repository variable `VITE_API_BASE_URL` to the full API base URL ending in `/api`, for example `https://your-project.vercel.app/api`. Do not use the example value literally.

### GitHub Pages frontend configuration

In GitHub repository Settings → Pages, select **GitHub Actions** as the deployment source. The workflow `.github/workflows/deploy-pages.yml` builds the frontend and publishes `frontend/dist`. It requires the repository variable `VITE_API_BASE_URL` to be configured first. The Vite base path and SPA fallback are configured for this repository's Pages URL.

**Deployment status:** The deployment configuration is being prepared on a separate branch. The portal is not yet live. Production launch still requires the Vercel project, private environment variables, GitHub Pages settings, MongoDB Atlas access configuration, and end-to-end verification. Run any database migration only after a verified backup.

## Testing

The application should be manually tested across the complete result publishing workflow.

Recommended testing flow:

1. Login as administrator
2. Configure academic data
3. Add students
4. Create an examination session
5. Register students
6. Enter examination marks
7. Verify marks
8. Lock marks
9. Process results
10. Verify GPA and CGPA
11. Publish results
12. Search for the result through the public portal
13. Download the grade sheet PDF

## Verification and Production Readiness

* GitHub Actions runs backend automated tests and a frontend production build on pull requests.
* The current CI run for the RIGCHEST changes completed successfully; this is not a substitute for end-to-end testing with a real MongoDB deployment.
* Public result lookup requires a register number and an admin-issued 10-digit Student PIN. PINs are stored as bcrypt hashes; older student records must have a PIN issued by an administrator before public lookup can succeed.
* Production monitoring, backups, deployment secrets, and a full end-to-end acceptance test remain deployment tasks.

## Future Enhancements

Possible future improvements include:

* Student authentication
* Multiple administrator account management
* Email notifications for result publication
* SMS notifications
* Advanced analytics dashboard
* Result comparison and performance analytics
* Automated end-to-end testing
* Audit log management
* Advanced search and filtering
* Pagination for large datasets
* Improved security using HTTP-only cookies
* Mobile application
* Online revaluation request management
* Result notification system

## Academic Use

This project was developed as a full-stack software project to demonstrate the practical implementation of:

* Full-stack web development
* REST API development
* Database design
* Authentication
* Authorization
* Role-based access control
* Academic data management
* Examination management
* Result processing
* GPA and CGPA calculation
* Excel data processing
* PDF generation
* Cloud deployment

## Institution

HAJIYA RAKIYA GERAWA COLLEGE OF HEALTH SCIENCE AND TECHNOLOGY KANO (RIGCHEST)

## License

This project is intended for academic and educational purposes.
