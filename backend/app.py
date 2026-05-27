import io
import os
import json
import re
import importlib
from datetime import datetime, timedelta
from typing import List

from flask import Flask, jsonify, render_template, request
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from dotenv import load_dotenv

from models import db, Admin, Candidate, Interview, InterviewResult, EmotionRecord, AdminAction, BehaviorReport

try:
    import openai
except ImportError:
    openai = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
frontend_dir = os.path.join(root_dir, 'frontend')
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(
    __name__,
    template_folder=os.path.join(frontend_dir, 'templates'),
    static_folder=os.path.join(frontend_dir, 'static')
)
CORS(app)

# Configuration
raw_database_url = os.getenv('DATABASE_URL', '').strip()
if not raw_database_url or 'your_password' in raw_database_url:
    raw_database_url = 'sqlite:///interview_system.db'
app.config['SQLALCHEMY_DATABASE_URI'] = raw_database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

# Initialize extensions
db.init_app(app)
JWTManager(app)

OWNER_PASSCODE = os.getenv('OWNER_PASSCODE', 'owner-secret-2026')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_CLIENT = None
if OPENAI_API_KEY and openai:
    openai.api_key = OPENAI_API_KEY
    if hasattr(openai, 'OpenAI'):
        OPENAI_CLIENT = openai.OpenAI(api_key=OPENAI_API_KEY)

LANGUAGE_LABELS = {
    'en': 'English',
    'hi': 'हिन्दी',
    'pa': 'ਪੰਜਾਬੀ'
     
}

UI_TEXT = {
    'en': {
        'start': 'Start Interview',
        'resumePlaceholder': 'Paste your resume text here...',
        'namePlaceholder': 'Candidate name',
        'languageLabel': 'Language',
        'thankYou': 'Thank you for the interview. We will inform you about your result.',
        'loadReviews': 'Load reviews'
    },
    'hi': {
        'start': 'Start Interview',
        'resumePlaceholder': 'Paste your resume text here...',
        'namePlaceholder': 'Candidate name',
        'languageLabel': 'Language',
        'thankYou': 'Thank you for the interview. We will inform you about your result.',
        'loadReviews': 'Load reviews'
    },
    'pa': {
        'start': 'Start Interview',
        'resumePlaceholder': 'Paste your resume text here...',
        'namePlaceholder': 'Candidate name',
        'languageLabel': 'Language',
        'thankYou': 'Thank you for the interview. We will inform you about your result.',
        'loadReviews': 'Load reviews'
    }
}

AVAILABLE_ROLES = {
    'python_dev': 'Python Developer',
    'web_dev': 'Web Developer',
    'data_analyst': 'Data Analyst',
    'java_dev': 'Java Developer',
    'ml_engineer': 'AI/ML Engineer',
    'frontend_dev': 'Frontend Developer',
    'backend_dev': 'Backend Developer',
    'hr_interview': 'HR Interview',
    'sql_dev': 'SQL Developer',
    'devops': 'DevOps Engineer',
    'fullstack': 'Full Stack Developer'
}

ROLE_FOCUS_AREAS = {
    'python_dev': ['OOP', 'Python Concepts', 'Libraries', 'APIs', 'DSA Basics', 'Error Handling', 'Testing'],
    'web_dev': ['HTML', 'CSS', 'JavaScript', 'React', 'APIs', 'Responsive Design', 'Performance'],
    'data_analyst': ['SQL', 'Power BI', 'Python', 'Statistics', 'Data Cleaning', 'Excel', 'Visualization'],
    'java_dev': ['OOP', 'Java Concepts', 'Collections', 'Exception Handling', 'Multithreading', 'JVM', 'Spring'],
    'ml_engineer': ['Machine Learning', 'Deep Learning', 'Python', 'TensorFlow', 'Model Training', 'Data Preprocessing'],
    'frontend_dev': ['React', 'JavaScript', 'CSS', 'UI/UX', 'Performance', 'Accessibility', 'Testing'],
    'backend_dev': ['Node.js', 'APIs', 'Databases', 'Authentication', 'Scalability', 'Caching', 'Testing'],
    'hr_interview': ['Communication', 'Experience', 'Goals', 'Team Fit', 'Challenges', 'Motivation'],
    'sql_dev': ['Query Optimization', 'Normalization', 'Indexing', 'Stored Procedures', 'Performance'],
    'devops': ['Docker', 'Kubernetes', 'CI/CD', 'Cloud', 'Infrastructure', 'Monitoring', 'Automation'],
    'fullstack': ['Frontend', 'Backend', 'Databases', 'APIs', 'Deployment', 'Architecture']
}

LOCAL_QUESTIONS = {
    'en': {
        'JavaScript': 'Describe a JavaScript project from your resume and how you solved a challenge.',
        'React': 'Explain a React pattern you used to keep your app fast and maintainable.',
        'Node.js': 'How did you design a reliable backend service using Node.js?',
        'Python': 'Tell me about a Python project you delivered and what impact it had.',
        'SQL': 'Share a complex SQL query you wrote and why it was important.',
        'AWS': 'Which AWS services did you use and how did they improve your product?',
        'Docker': 'How do you use Docker to ensure consistent environments?',
        'leadership': 'How do you support team collaboration and leadership?',
        'design': 'How do you convert requirements into a strong technical design?',
        'UX': 'How do you balance user experience with performance limits?',
        'testing': 'How do you ensure quality with testing and automation?',
        'Agile': 'How do you contribute to sprint planning and agile delivery?'
    }
}

def extract_text_from_pdf(uploaded_file) -> str:
    if not pdfplumber:
        return ''
    try:
        uploaded_file.stream.seek(0)
        pdf_bytes = io.BytesIO(uploaded_file.read())
        with pdfplumber.open(pdf_bytes) as pdf:
            return '\n'.join(page.extract_text() or '' for page in pdf.pages)
    except Exception:
        return ''

def extract_text_from_image(uploaded_file) -> str:
    if not Image or not pytesseract:
        return ''
    try:
        uploaded_file.stream.seek(0)
        image = Image.open(uploaded_file)
        return pytesseract.image_to_string(image)
    except Exception:
        return ''

def read_resume_text() -> str:
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        resume_text = request.form.get('resumeText', '') or ''
        resume_file = request.files.get('resumeFile')
        if resume_file:
            filename = resume_file.filename.lower()
            if filename.endswith('.pdf'):
                file_text = extract_text_from_pdf(resume_file)
            elif filename.endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff')):
                file_text = extract_text_from_image(resume_file)
            else:
                file_text = ''
            return file_text.strip() or resume_text
        return resume_text
    data = request.json or {}
    return data.get('resumeText', '') or ''

def get_ai_text(prompt: str, max_tokens: int) -> str:
    if OPENAI_CLIENT:
        response = OPENAI_CLIENT.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=max_tokens
        )
        return response.choices[0].message.content.strip()
    response = openai.ChatCompletion.create(
        model='gpt-4o-mini',
        messages=[{'role': 'user', 'content': prompt}],
        max_tokens=max_tokens
    )
    return response.choices[0].message.content.strip()

def score_local_answer(question: str, answer: str) -> dict:
    """Score answers when AI evaluation is unavailable."""
    clean_answer = answer.strip()
    if not clean_answer or clean_answer == '(No answer recorded)':
        return {
            'technical_accuracy': 1,
            'communication': 1,
            'relevance': 1,
            'confidence': 1,
            'feedback': 'No answer was recorded.',
            'improvement_tip': 'Provide a clear answer with an example.'
        }
    
    words = re.findall(r"[A-Za-z0-9+#.-]+", clean_answer.lower())
    word_count = len(words)
    question_terms = {word for word in re.findall(r"[A-Za-z0-9+#.-]+", question.lower()) if len(word) > 3}
    answer_terms = set(words)
    overlap = len(question_terms & answer_terms)
    filler_count = sum(1 for word in words if word in {'um', 'uh', 'like', 'basically'})
    
    length_score = min(10, max(3, round(word_count / 6)))
    relevance_score = min(10, max(2, 3 + overlap + (1 if word_count > 25 else 0)))
    communication_score = min(10, max(2, round(length_score - (filler_count * 0.8) + (1 if word_count >= 20 else 0))))
    confidence_score = min(10, max(2, round(communication_score + (1 if word_count >= 30 else 0) - (1 if filler_count >= 4 else 0))))
    technical_score = min(10, max(2, round((length_score + relevance_score) / 2)))
    
    if word_count < 12:
        feedback = 'Answer is very short.'
        tip = 'Include context, actions, and measurable results.'
    elif filler_count >= 4:
        feedback = 'Too many filler words.'
        tip = 'Remove um/uh and speak clearly.'
    else:
        feedback = 'Good response with room for improvement.'
        tip = 'Highlight accomplishments and outcomes.'
    
    return {
        'technical_accuracy': technical_score,
        'communication': communication_score,
        'relevance': relevance_score,
        'confidence': confidence_score,
        'feedback': feedback,
        'improvement_tip': tip
    }

def evaluate_answer(question: str, answer: str, skill_level: str, job_role: str) -> dict:
    """Evaluate answer using AI or fallback to local scoring."""
    local_score = score_local_answer(question, answer)
    if not answer.strip() or answer.strip() == '(No answer recorded)':
        return local_score
    
    if not (OPENAI_API_KEY and openai):
        return local_score
    
    try:
        prompt = (
            f"Evaluate for {skill_level} candidate in {job_role}:\n"
            f"Q: {question}\nA: {answer}\n\n"
            "Return JSON: {\"technical_accuracy\":1-10,\"communication\":1-10,\"relevance\":1-10,\"confidence\":1-10,\"feedback\":\"...\",\"improvement_tip\":\"...\"}"
        )
        result_text = get_ai_text(prompt, 200)
        evaluation = json.loads(result_text)
        
        return {
            'technical_accuracy': max(1, min(10, int(round(evaluation.get('technical_accuracy', 5))))),
            'communication': max(1, min(10, int(round(evaluation.get('communication', 5))))),
            'relevance': max(1, min(10, int(round(evaluation.get('relevance', 5))))),
            'confidence': max(1, min(10, int(round(evaluation.get('confidence', 5))))),
            'feedback': evaluation.get('feedback', local_score['feedback']),
            'improvement_tip': evaluation.get('improvement_tip', local_score['improvement_tip'])
        }
    except Exception:
        return local_score

def make_questions_for_role(role_key: str, resume_text: str, skill_level: str, difficulty: str, language: str = 'en', count: int = 7) -> List[dict]:
    """Generate role-specific questions."""
    focus_areas = ROLE_FOCUS_AREAS.get(role_key, ['Technical Skills', 'Problem Solving', 'Experience'])
    
    if OPENAI_API_KEY and openai:
        try:
            prompt = (
                f"Create {count} interview questions for a {skill_level} {AVAILABLE_ROLES.get(role_key, 'candidate')} "
                f"with {difficulty} difficulty. Focus areas: {', '.join(focus_areas)}. "
                f"Resume excerpt: {resume_text[:500]}\n"
                "Return only numbered questions, one per line."
            )
            text_response = get_ai_text(prompt, 400)
            questions = [line.strip('0123456789.- ').strip() for line in text_response.splitlines() if line.strip()]
            if len(questions) >= count:
                return [{'id': f'q{i+1}', 'prompt': questions[i]} for i in range(count)]
        except Exception:
            pass
    
    # Fallback to generic questions
    generic_qs = [
        f"Describe your experience with {focus_areas[0] if focus_areas else 'technical skills'}.",
        f"Tell us about a project where you used {focus_areas[1] if len(focus_areas) > 1 else 'your skills'}.",
        "What was your biggest technical challenge?",
        "How do you stay updated with latest technologies?",
        "Describe your approach to problem solving.",
        "Tell us about your team collaboration experience.",
        "What are your career goals for the next 2-3 years?"
    ]
    while len(generic_qs) < count:
        generic_qs.append(f"Explain another important experience related to {AVAILABLE_ROLES.get(role_key, 'this role')}.")
    return [{'id': f'q{i+1}', 'prompt': generic_qs[i]} for i in range(count)]


def extract_skills(resume_text: str) -> List[str]:
    """Simple local skill extraction used for the candidate UI."""
    known_skills = [
        'Python', 'JavaScript', 'React', 'Node.js', 'SQL', 'Java', 'AWS',
        'Docker', 'Kubernetes', 'Flask', 'Django', 'HTML', 'CSS', 'Machine Learning'
    ]
    resume_lower = resume_text.lower()
    return [skill for skill in known_skills if skill.lower() in resume_lower][:12]


def ensure_default_admin() -> None:
    """Create a local default admin account when the database is empty."""
    default_email = os.getenv('DEFAULT_ADMIN_EMAIL', 'admin@interviewsystem.com')
    default_password = os.getenv('DEFAULT_ADMIN_PASSWORD', 'admin123')
    if Admin.query.filter_by(email=default_email).first():
        return

    admin = Admin(email=default_email, name=os.getenv('DEFAULT_ADMIN_NAME', 'Admin User'))
    admin.set_password(default_password)
    db.session.add(admin)
    db.session.commit()

# ==================== CANDIDATE ROUTES ====================

@app.route('/')
def home():
    return render_template('index.html', languages=LANGUAGE_LABELS, roles=AVAILABLE_ROLES, ui_text=UI_TEXT)

@app.route('/admin/login.html')
def admin_login_page():
    """Serve admin login page."""
    return render_template('admin-login.html')

@app.route('/admin/dashboard.html')
def admin_dashboard_page():
    """Serve admin dashboard page."""
    return render_template('admin-dashboard.html')

@app.route('/api/roles', methods=['GET'])
def get_roles():
    """Get available interview roles."""
    return jsonify({'roles': AVAILABLE_ROLES})

@app.route('/api/questions', methods=['POST'])
def api_questions():
    """Generate questions for selected role."""
    resume_text = read_resume_text()
    data = request.form if request.content_type and request.content_type.startswith('multipart/form-data') else (request.json or {})
    
    role_key = data.get('role') or data.get('selectedRole', 'python_dev')
    language = data.get('language', 'en')
    question_count = int(data.get('questionCount', 7))
    skill_level = data.get('skillLevel', 'mid-level')
    difficulty = data.get('difficulty', 'medium')
    candidate_email = data.get('candidateEmail', '')
    candidate_name = data.get('candidateName', '')
    
    if not resume_text.strip():
        return jsonify({'error': 'Resume text required.'}), 400
    
    # Create candidate record
    try:
        candidate = Candidate(
            name=candidate_name,
            email=candidate_email,
            resume_text=resume_text,
            selected_role=role_key,
            skill_level=skill_level,
            difficulty=difficulty,
            language=language
        )
        db.session.add(candidate)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        candidate_id = None
    else:
        candidate_id = candidate.id
    
    questions = make_questions_for_role(role_key, resume_text, skill_level, difficulty, language, question_count)
    return jsonify({
        'questions': questions,
        'skills': extract_skills(resume_text),
        'resumeText': resume_text,
        'candidateId': candidate_id,
        'roleLabel': AVAILABLE_ROLES.get(role_key, 'Technical Interview')
    })


@app.route('/api/evaluate', methods=['POST'])
def api_evaluate():
    """Evaluate answers without saving, used by the candidate summary screen."""
    data = request.json or {}
    answers = data.get('answers', [])
    skill_level = data.get('skillLevel', 'mid-level')
    job_role = data.get('jobRole', 'general')

    evaluations = [
        evaluate_answer(item.get('question', ''), item.get('answer', ''), skill_level, job_role)
        for item in answers
    ]
    return jsonify({'evaluations': evaluations})

@app.route('/api/submit-interview', methods=['POST'])
def submit_interview():
    """Submit completed interview with all answers and behavior data."""
    data = request.json or {}
    candidate_id = data.get('candidateId')
    answers = data.get('answers', [])
    behavior_report_data = data.get('behaviorReport', {})
    skill_level = data.get('skillLevel', 'mid-level')
    job_role = data.get('jobRole', 'general')
    
    if not candidate_id:
        return jsonify({'error': 'Candidate ID required'}), 400
    
    try:
        candidate = Candidate.query.get(candidate_id)
        if not candidate:
            return jsonify({'error': 'Candidate not found'}), 404
        
        # Create interview record
        interview = Interview(candidate_id=candidate_id, status='in_progress')
        db.session.add(interview)
        db.session.flush()
        
        # Store all answers and scores
        all_scores = []
        for idx, ans in enumerate(answers, 1):
            score = evaluate_answer(ans.get('question', ''), ans.get('answer', ''), skill_level, job_role)
            
            result = InterviewResult(
                interview_id=interview.id,
                question_number=idx,
                question_text=ans.get('question', ''),
                answer_text=ans.get('answer', ''),
                technical_accuracy=score['technical_accuracy'],
                communication=score['communication'],
                relevance=score['relevance'],
                confidence=score['confidence'],
                feedback=score['feedback'],
                improvement_tip=score['improvement_tip']
            )
            db.session.add(result)
            all_scores.append(score)
        
        # Store behavior report
        if behavior_report_data:
            behavior = BehaviorReport(
                interview_id=interview.id,
                overall_confidence=behavior_report_data.get('confidence', 50),
                overall_stress=behavior_report_data.get('stress', 50),
                eye_contact_avg=behavior_report_data.get('eyeContact', 0),
                voice_stability_avg=behavior_report_data.get('voiceStability', 0),
                communication_score=behavior_report_data.get('communicationScore', 50),
                nervousness_score=behavior_report_data.get('nervousnessScore', 50),
                blink_count=behavior_report_data.get('blinkCount', 0),
                blink_rate_avg=behavior_report_data.get('blinkRate', 0),
                speaking_speed_avg=behavior_report_data.get('speakingSpeed', 0),
                filler_count=behavior_report_data.get('fillerCount', 0),
                dominant_emotion=behavior_report_data.get('dominantEmotion', 'Calm'),
                suggestions=json.dumps(behavior_report_data.get('suggestions', []))
            )
            db.session.add(behavior)
        
        interview.status = 'completed'
        interview.completed_at = datetime.utcnow()
        db.session.commit()
        
        # Candidate completion emails are handled outside the server in this deployment.
        avg_score = round(sum(s['confidence'] for s in all_scores) / len(all_scores)) if all_scores else 0
        
        return jsonify({
            'success': True,
            'interviewId': interview.id,
            'averageScore': avg_score,
            'scores': all_scores
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/reviews', methods=['GET'])
def api_reviews():
    """Legacy owner-review endpoint backed by the database."""
    passcode = request.args.get('passcode', '')
    if passcode != OWNER_PASSCODE:
        return jsonify({'error': 'Unauthorized'}), 401

    reviews = []
    interviews = Interview.query.order_by(Interview.completed_at.desc().nullslast(), Interview.started_at.desc()).limit(50).all()
    for interview in interviews:
        candidate = interview.candidate
        behavior = BehaviorReport.query.filter_by(interview_id=interview.id).first()
        reviews.append({
            'candidateName': candidate.name if candidate else 'Anonymous',
            'resumeText': candidate.resume_text if candidate else '',
            'answers': [
                {'question': result.question_text, 'answer': result.answer_text or ''}
                for result in interview.results
            ],
            'behaviorReport': behavior.to_dict() if behavior else None,
            'createdAt': (interview.completed_at or interview.started_at).isoformat()
        })

    return jsonify({'reviews': reviews})

# ==================== ADMIN ROUTES ====================

@app.route('/admin/login', methods=['POST'])
def admin_login():
    """Admin login endpoint."""
    data = request.json or {}
    email = data.get('email', '')
    password = data.get('password', '')
    
    admin = Admin.query.filter_by(email=email).first()
    if not admin or not admin.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    access_token = create_access_token(identity=admin.id, additional_claims={'role': 'admin'})
    return jsonify({
        'access_token': access_token,
        'admin': admin.to_dict()
    })

@app.route('/admin/candidates', methods=['GET'])
@jwt_required()
def get_candidates():
    """Get all candidates with filtering."""
    admin_id = get_jwt_identity()
    
    # Verify admin
    admin = Admin.query.get(admin_id)
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 401
    
    role_filter = request.args.get('role', '')
    score_min = request.args.get('scoreMin', type=int)
    search = request.args.get('search', '')
    
    query = Candidate.query
    
    if role_filter:
        query = query.filter_by(selected_role=role_filter)
    if search:
        query = query.filter((Candidate.name.ilike(f'%{search}%')) | (Candidate.email.ilike(f'%{search}%')))
    
    candidates = query.all()
    
    # Add interview stats to each candidate
    result = []
    for c in candidates:
        interview = Interview.query.filter_by(candidate_id=c.id).order_by(Interview.completed_at.desc()).first()
        if interview and interview.results:
            avg_score = round(sum(r.average_score() for r in interview.results) / len(interview.results))
        else:
            avg_score = 0
        
        result.append({
            **c.to_dict(),
            'avgScore': avg_score,
            'interviewStatus': interview.status if interview else 'not_started',
            'interviewId': interview.id if interview else None
        })
    
    return jsonify({'candidates': result})

@app.route('/admin/candidate/<candidate_id>', methods=['GET'])
@jwt_required()
def get_candidate_details(candidate_id):
    """Get detailed candidate profile with all interview data."""
    admin_id = get_jwt_identity()
    admin = Admin.query.get(admin_id)
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 401
    
    candidate = Candidate.query.get(candidate_id)
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
    
    interviews = Interview.query.filter_by(candidate_id=candidate_id).all()
    
    interviews_data = []
    for interview in interviews:
        results = InterviewResult.query.filter_by(interview_id=interview.id).all()
        behavior = BehaviorReport.query.filter_by(interview_id=interview.id).first()
        
        interviews_data.append({
            'id': interview.id,
            'status': interview.status,
            'completedAt': interview.completed_at.isoformat() if interview.completed_at else None,
            'results': [r.to_dict() for r in results],
            'behavior': behavior.to_dict() if behavior else None,
            'avgScore': round(sum(r.average_score() for r in results) / len(results)) if results else 0
        })
    
    return jsonify({
        'candidate': candidate.to_dict(),
        'interviews': interviews_data
    })

@app.route('/admin/select-hr/<candidate_id>', methods=['POST'])
@jwt_required()
def select_for_hr(candidate_id):
    """Select candidate for HR round and send email."""
    admin_id = get_jwt_identity()
    admin = Admin.query.get(admin_id)
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 401
    
    candidate = Candidate.query.get(candidate_id)
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
    
    try:
        action = AdminAction(
            admin_id=admin_id,
            candidate_id=candidate_id,
            action='selected_hr_round',
            status='selected'
        )
        db.session.add(action)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Candidate marked selected. Gmail compose is handled client-side.',
            'actionId': action.id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Failed to send email', 'error': str(e)}), 500

@app.route('/admin/reject/<candidate_id>', methods=['POST'])
@jwt_required()
def reject_candidate(candidate_id):
    """Reject candidate and send rejection email."""
    admin_id = get_jwt_identity()
    admin = Admin.query.get(admin_id)
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 401
    
    candidate = Candidate.query.get(candidate_id)
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
    
    try:
        action = AdminAction(
            admin_id=admin_id,
            candidate_id=candidate_id,
            action='rejected',
            status='rejected'
        )
        db.session.add(action)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Candidate marked rejected. Gmail compose is handled client-side.',
            'actionId': action.id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Failed to send email', 'error': str(e)}), 500

@app.route('/admin/analytics', methods=['GET'])
@jwt_required()
def get_analytics():
    """Get dashboard analytics."""
    admin_id = get_jwt_identity()
    admin = Admin.query.get(admin_id)
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 401
    
    total_candidates = Candidate.query.count()
    completed_interviews = Interview.query.filter_by(status='completed').count()
    
    selected_actions = AdminAction.query.filter_by(action='selected_hr_round').count()
    rejected_actions = AdminAction.query.filter_by(action='rejected').count()
    
    # Calculate average scores
    results = db.session.query(InterviewResult).all()
    avg_confidence = round(sum(r.confidence for r in results) / len(results)) if results else 0
    
    # Get role distribution
    role_dist = db.session.query(Candidate.selected_role, db.func.count()).group_by(Candidate.selected_role).all()
    role_data = {AVAILABLE_ROLES.get(role[0], role[0]): role[1] for role in role_dist}
    
    return jsonify({
        'totalCandidates': total_candidates,
        'completedInterviews': completed_interviews,
        'selectedForHR': selected_actions,
        'rejected': rejected_actions,
        'averageConfidenceScore': avg_confidence,
        'roleDistribution': role_data
    })

# ==================== DATABASE INITIALIZATION ====================

@app.cli.command()
def init_db():
    """Initialize the database."""
    with app.app_context():
        db.create_all()
        ensure_default_admin()
        print("Database initialized. Default admin: admin@interviewsystem.com / admin123")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        ensure_default_admin()

    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
