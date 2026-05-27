# AI Interview System

An enterprise-level Python-based interview management system with role-specific questions, admin dashboard, and automated email communications.

## Features

### Candidate Interview Features
- **11 Role-Based Interview Paths**: Python Developer, Web Developer, Data Analyst, Java Developer, AI/ML Engineer, Frontend Developer, Backend Developer, SQL Developer, DevOps Engineer, Full Stack Developer, and HR Interview
- **Resume-driven Question Generation**: AI-powered questions tailored to resume content and selected role
- **Voice-Driven Interview**: Browser speech recognition and synthesis
- **Behavioral Analytics**: Real-time emotion detection, eye contact tracking, speaking speed analysis, blink rate monitoring
- **Multi-Language Support**: English, Hindi, Punjabi
- **Smart Scoring**: Advanced heuristic-based answer evaluation with AI fallback
- **Resume Upload**: Automatic text extraction from PDF or image files

### Admin Dashboard Features
- **Candidate Management**: View all candidates with filtering and search
- **Detailed Profiles**: Complete interview history, answers, scores, and behavior metrics
- **Selection/Rejection Actions**: HR round selection or rejection with automated email notifications
- **Analytics Dashboard**: Candidate statistics, role distribution, confidence scores, conversion metrics
- **JWT Authentication**: Secure admin access with 7-day token expiration

### System Features
- **MySQL Database**: Persistent data storage with comprehensive audit trails
- **Email Automation**: Selection, rejection, and completion notifications
- **RESTful API**: Complete REST API for both candidates and admins
- **Role-Based Access Control**: JWT tokens with admin verification

## Technical Stack

- **Backend**: Flask 2.3.0+ with SQLAlchemy ORM
- **Database**: MySQL with mysql-connector-python
- **Authentication**: Flask-JWT-Extended (7-day expiration)
- **Email**: Flask-Mail with Gmail SMTP
- **AI Integration**: OpenAI API (gpt-4o-mini model)
- **Frontend**: HTML5, CSS3, JavaScript with Chart.js for analytics
- **Security**: Bcrypt password hashing, JWT tokens

## Setup & Installation

### 1. Prerequisites
- Python 3.11+
- MySQL Server running locally
- OpenAI API key (for AI question generation)
- Gmail account with app password (for email notifications)

### 2. Environment Setup

```bash
# Clone/download the project and navigate to the folder
cd interview project
cd backend

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Create .env file from template
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` file and add:

```env
# Database
DATABASE_URL=mysql+mysqlconnector://root:password@localhost/interview_system

# JWT
JWT_SECRET_KEY=your-very-long-random-secret-key-2024-change-in-production

# OpenAI (optional but recommended)
OPENAI_API_KEY=sk-...

# Email actions are handled by client-side Gmail compose from the admin dashboard.
# No server-side SMTP configuration is required for this deployment.
```

### 4. Database Setup

```bash
# Create MySQL database
mysql -u root -p
> CREATE DATABASE interview_system;
> EXIT;

# Initialize database tables and default admin
flask init-db
```

This creates:
- All database tables
- Default admin account: `admin@interviewsystem.com` / `admin123` (⚠️ Change in production!)

### 5. Run the Application

From the `backend` folder:

```bash
python app.py
```

If you prefer running from the project root, use:

```bash
python backend/app.py
```

If `waitress` is installed, this starts a production-ready Waitress server on `http://0.0.0.0:5000`.

Application runs at `http://localhost:5000`

## Usage

### For Candidates

1. **Open** `http://localhost:5000`
2. **Select Interview Role** from 11 available positions
3. **Enter Details**: Name, email, resume (PDF/image/text)
4. **Configure Interview**: Question count, voice style, skill level, difficulty
5. **Start Interview**: Answer voice questions in 2-minute segments
6. **Review Results**: View score breakdown and behavior analytics
7. **Submit**: Receive confirmation email

### For Admins

1. **Login** at `http://localhost:5000/admin/login.html`
   - Email: `admin@interviewsystem.com`
   - Password: `admin123` (default)

2. **Dashboard** - View key metrics:
   - Total candidates and completed interviews
   - Selection/rejection counts
   - Average confidence scores
   - Role distribution chart

3. **Manage Candidates**:
   - Search and filter by role
   - View detailed profiles with all interview data
   - Click "Select for HR" or "Reject" buttons
   - Automated emails sent to candidates

4. **Analytics**: Performance metrics and conversion funnels

## API Endpoints

### Public Endpoints (Candidate)
- `GET /` - Candidate interview interface
- `GET /api/roles` - List all available roles
- `POST /api/questions` - Start interview, generate role-specific questions (returns `candidateId`)
- `POST /api/submit-interview` - Submit completed interview

### Admin Endpoints (JWT Required)
- `POST /admin/login` - Admin authentication
- `GET /admin/candidates` - List all candidates (with filters)
- `GET /admin/candidate/<id>` - Detailed candidate profile
- `POST /admin/select-hr/<id>` - Select candidate for HR round
- `POST /admin/reject/<id>` - Reject candidate
- `GET /admin/analytics` - Dashboard metrics

## Scoring System

Answers are evaluated on 4 dimensions (1-10 scale):
- **Technical Accuracy**: Correctness of technical content
- **Communication**: Clarity and articulation
- **Relevance**: Direct answer to question asked
- **Confidence**: Conviction and certainty in response

Scoring considers:
- Answer length (word count analysis)
- Filler word detection (um, uh, like, basically)
- Term overlap with question
- AI evaluation when available (fallback to heuristics)

## Security Notes

### Production Checklist
- [ ] Change default admin password immediately
- [ ] Generate strong `JWT_SECRET_KEY` (minimum 32 random characters)
- [ ] Use environment variables, never commit `.env`
- [ ] Set `DATABASE_URL` with strong credentials
- [ ] Enable HTTPS in production
- [ ] Admin email actions now use Gmail compose client-side

### JWT Token
- Issued on successful admin login
- Valid for 7 days
- Must be included in `Authorization: Bearer <token>` header for admin endpoints

## Database Schema

**Key Tables:**
- `admin` - Admin user accounts with bcrypt hashed passwords
- `candidate` - Interview candidates with role and skill level
- `interview` - Interview sessions with status tracking
- `interview_result` - Individual questions with scores
- `emotion_record` - Real-time behavior metrics
- `admin_action` - HR decisions with email status
- `behavior_report` - Aggregated behavior analysis

## Notes

- All reviews are stored in MySQL database, persistent across restarts
- AI questions generated via OpenAI API; fallback to generic questions if API unavailable
- Admin email actions open Gmail compose in the browser; no server-side SMTP password is required
- Behavior analytics optional; system works without camera/microphone access
- Images without Tesseract OCR cannot be processed; use PDF or paste text

## Troubleshooting

**Database connection error**: Ensure MySQL is running and credentials in `.env` are correct
**Email action not opening**: Make sure you are using the admin dashboard buttons, which open Gmail compose in the browser.
**No AI questions**: Check OPENAI_API_KEY is set; system uses fallback questions otherwise
**Admin login fails**: Default admin email is `admin@interviewsystem.com`, password `admin123`

