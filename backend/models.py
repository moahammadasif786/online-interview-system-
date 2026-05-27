from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import uuid

db = SQLAlchemy()


class Admin(db.Model):
    __tablename__ = 'admins'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'created_at': self.created_at.isoformat()
        }


class Candidate(db.Model):
    __tablename__ = 'candidates'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    resume_text = db.Column(db.Text, nullable=True)
    resume_file_path = db.Column(db.String(512), nullable=True)
    selected_role = db.Column(db.String(100), nullable=False)
    skill_level = db.Column(db.String(50), default='mid-level')
    job_role = db.Column(db.String(100), default='general')
    difficulty = db.Column(db.String(50), default='medium')
    language = db.Column(db.String(10), default='en')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    interviews = db.relationship('Interview', backref='candidate', lazy=True, cascade='all, delete-orphan')
    admin_actions = db.relationship('AdminAction', backref='candidate', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'selected_role': self.selected_role,
            'skill_level': self.skill_level,
            'created_at': self.created_at.isoformat()
        }


class Interview(db.Model):
    __tablename__ = 'interviews'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = db.Column(db.String(36), db.ForeignKey('candidates.id'), nullable=False, index=True)
    questions_asked = db.Column(db.Text, nullable=True)  # JSON array
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(50), default='in_progress')  # in_progress, completed, abandoned
    
    results = db.relationship('InterviewResult', backref='interview', lazy=True, cascade='all, delete-orphan')
    emotions = db.relationship('EmotionRecord', backref='interview', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'started_at': self.started_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'status': self.status
        }


class InterviewResult(db.Model):
    __tablename__ = 'interview_results'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = db.Column(db.String(36), db.ForeignKey('interviews.id'), nullable=False, index=True)
    question_number = db.Column(db.Integer, nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    answer_text = db.Column(db.Text, nullable=True)
    technical_accuracy = db.Column(db.Integer, default=5)  # 1-10
    communication = db.Column(db.Integer, default=5)  # 1-10
    relevance = db.Column(db.Integer, default=5)  # 1-10
    confidence = db.Column(db.Integer, default=5)  # 1-10
    feedback = db.Column(db.Text, nullable=True)
    improvement_tip = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def average_score(self):
        return round((self.technical_accuracy + self.communication + self.relevance + self.confidence) / 4)
    
    def to_dict(self):
        return {
            'id': self.id,
            'question_number': self.question_number,
            'question_text': self.question_text,
            'answer_text': self.answer_text,
            'technical_accuracy': self.technical_accuracy,
            'communication': self.communication,
            'relevance': self.relevance,
            'confidence': self.confidence,
            'average_score': self.average_score(),
            'feedback': self.feedback,
            'improvement_tip': self.improvement_tip
        }


class EmotionRecord(db.Model):
    __tablename__ = 'emotion_records'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = db.Column(db.String(36), db.ForeignKey('interviews.id'), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    emotion = db.Column(db.String(50), nullable=False)
    confidence_score = db.Column(db.Integer)  # 0-100
    stress_level = db.Column(db.Integer)  # 0-100
    eye_contact = db.Column(db.Integer)  # 0-100
    voice_stability = db.Column(db.Integer)  # 0-100
    blink_rate = db.Column(db.Integer)  # per minute
    speaking_speed = db.Column(db.Integer)  # wpm
    nervousness = db.Column(db.String(50))  # Calm, Slightly Nervous, Nervous, Highly Stressed
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'emotion': self.emotion,
            'confidence_score': self.confidence_score,
            'stress_level': self.stress_level,
            'eye_contact': self.eye_contact,
            'voice_stability': self.voice_stability,
            'blink_rate': self.blink_rate,
            'speaking_speed': self.speaking_speed,
            'nervousness': self.nervousness
        }


class AdminAction(db.Model):
    __tablename__ = 'admin_actions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id = db.Column(db.String(36), db.ForeignKey('admins.id'), nullable=False)
    candidate_id = db.Column(db.String(36), db.ForeignKey('candidates.id'), nullable=False, index=True)
    action = db.Column(db.String(50), nullable=False)  # selected_hr_round, rejected
    status = db.Column(db.String(50), default='pending')  # pending, email_sent, email_failed
    email_sent_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    admin = db.relationship('Admin')
    
    def to_dict(self):
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'candidate_id': self.candidate_id,
            'action': self.action,
            'status': self.status,
            'email_sent_at': self.email_sent_at.isoformat() if self.email_sent_at else None,
            'created_at': self.created_at.isoformat()
        }


class BehaviorReport(db.Model):
    __tablename__ = 'behavior_reports'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = db.Column(db.String(36), db.ForeignKey('interviews.id'), unique=True, nullable=False)
    overall_confidence = db.Column(db.Integer)  # 0-100
    overall_stress = db.Column(db.Integer)  # 0-100
    eye_contact_avg = db.Column(db.Integer)  # 0-100
    voice_stability_avg = db.Column(db.Integer)  # 0-100
    communication_score = db.Column(db.Integer)  # 0-100
    nervousness_score = db.Column(db.Integer)  # 0-100
    blink_count = db.Column(db.Integer)
    blink_rate_avg = db.Column(db.Integer)  # per minute
    speaking_speed_avg = db.Column(db.Integer)  # wpm
    filler_count = db.Column(db.Integer)
    dominant_emotion = db.Column(db.String(50))
    suggestions = db.Column(db.Text)  # JSON array
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'interview_id': self.interview_id,
            'overall_confidence': self.overall_confidence,
            'overall_stress': self.overall_stress,
            'eye_contact_avg': self.eye_contact_avg,
            'voice_stability_avg': self.voice_stability_avg,
            'communication_score': self.communication_score,
            'nervousness_score': self.nervousness_score,
            'blink_count': self.blink_count,
            'dominant_emotion': self.dominant_emotion,
            'created_at': self.created_at.isoformat()
        }
