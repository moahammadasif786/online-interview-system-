const languageSelector = document.getElementById('languageSelector');
const candidateNameInput = document.getElementById('candidateName');
const candidateEmailInput = document.getElementById('candidateEmail');
const resumeFileInput = document.getElementById('resumeFile');
const resumeTextInput = document.getElementById('resumeText');
const fileHint = document.getElementById('fileHint');
const questionCountSelect = document.getElementById('questionCount');
const voiceStyleSelect = document.getElementById('voiceStyle');
const skillLevelSelect = document.getElementById('skillLevel');
const difficultySelect = document.getElementById('difficulty');
const startButton = document.getElementById('startButton');
const questionSection = document.getElementById('questionSection');
const summarySection = document.getElementById('summarySection');
const reviewSummary = document.getElementById('reviewSummary');
const currentQuestionEl = document.getElementById('currentQuestion');
const questionCounterEl = document.getElementById('questionCounter');
const progressInner = document.getElementById('progressInner');
const timerBadge = document.getElementById('timerBadge');
const answerText = document.getElementById('answerText');
const speakButton = document.getElementById('speakButton');
const nextButton = document.getElementById('nextButton');
const statusText = document.getElementById('statusText');
const thankYouText = document.getElementById('thankYouText');
const ownerPasscode = document.getElementById('ownerPasscode');
const loadReviewsButton = document.getElementById('loadReviewsButton');
const ownerMessage = document.getElementById('ownerMessage');
const ownerReviews = document.getElementById('ownerReviews');
const cameraPreview = document.getElementById('cameraPreview');
const currentEmotionEl = document.getElementById('currentEmotion');
const confidenceStatusEl = document.getElementById('confidenceStatus');
const confidenceScoreEl = document.getElementById('confidenceScore');
const confidenceMeter = document.getElementById('confidenceMeter');
const stressScoreEl = document.getElementById('stressScore');
const stressMeter = document.getElementById('stressMeter');
const eyeContactScoreEl = document.getElementById('eyeContactScore');
const voiceStabilityScoreEl = document.getElementById('voiceStabilityScore');
const blinkCountEl = document.getElementById('blinkCount');
const blinkRateEl = document.getElementById('blinkRate');
const speakingSpeedEl = document.getElementById('speakingSpeed');
const nervousnessLevelEl = document.getElementById('nervousnessLevel');

const LANGUAGES = Object.keys(languages);
const fillerWords = new Set(['um', 'uh', 'like', 'basically']);
let questions = [];
let currentIndex = 0;
let timerId = null;
let countdown = 120;
let answers = [];
let recognition = null;
let voiceSelection = 'female';
let speechVoice = null;
let language = 'en';
let extractedSkills = [];
let answersWithScores = [];
let extractedResumeText = '';
let behaviorReport = null;
let mediaStream = null;
let audioContext = null;
let analyser = null;
let audioData = null;
let analyticsTimer = null;
let analysisCanvas = document.createElement('canvas');
let analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
let analytics = createAnalyticsState();
let selectedRole = 'python_dev';
let candidateId = null;
let availableRoles = {};

function createAnalyticsState() {
  return {
    startedAt: 0,
    samples: [],
    emotionTimeline: [],
    blinkCount: 0,
    lastBlinkAt: 0,
    lastBrightness: null,
    lastCenter: null,
    movementValues: [],
    eyeContactValues: [],
    audioLevels: [],
    speakingStartedAt: null,
    spokenWords: 0,
    fillerCount: 0,
    silenceMs: 0,
    lastTranscriptAt: 0,
    current: {
      emotion: 'Calm',
      confidence: 0,
      stress: 0,
      eyeContact: 0,
      voiceStability: 0,
      blinkRate: 0,
      speakingSpeed: 0,
      nervousness: 'Calm'
    }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function setLanguageOptions() {
  LANGUAGES.forEach((code) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = languages[code];
    languageSelector.appendChild(option);
  });
}

function updatePlaceholders() {
  candidateNameInput.placeholder = uiText[language].namePlaceholder;
  resumeTextInput.placeholder = uiText[language].resumePlaceholder;
  startButton.textContent = uiText[language].start;
  document.querySelector('label[for="languageSelector"]').textContent = uiText[language].languageLabel;
  document.getElementById('loadReviewsButton').textContent = uiText[language].loadReviews;
  thankYouText.textContent = uiText[language].thankYou;
}

function chooseSpeechVoice() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = language === 'hi' ? 'hi' : language === 'pa' ? 'pa' : 'en';
  let candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (voiceSelection === 'female') {
    const female = candidates.filter((voice) => /female|woman|zira|samantha|alloy|audrey|olivia/i.test(voice.name));
    if (female.length) candidates = female;
  } else if (voiceSelection === 'soft') {
    const soft = candidates.filter((voice) => /soft|alloy|delicate|serene|samantha/i.test(voice.name));
    if (soft.length) candidates = soft;
  }
  speechVoice = candidates[0] || voices[0] || null;
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-US';
  if (speechVoice) utterance.voice = speechVoice;
  window.speechSynthesis.speak(utterance);
}

function startTimer() {
  countdown = 120;
  timerBadge.textContent = formatTime(countdown);
  clearInterval(timerId);
  timerId = setInterval(() => {
    countdown -= 1;
    timerBadge.textContent = formatTime(countdown);
    if (countdown <= 0) {
      clearInterval(timerId);
      statusText.textContent = 'Time is up. Moving to the next question.';
      moveToNextQuestion();
    }
  }, 1000);
}

function formatTime(seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

async function startBehaviorAnalysis() {
  stopBehaviorAnalysis();
  analytics = createAnalyticsState();
  analytics.startedAt = Date.now();
  updateAnalyticsDashboard();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusText.textContent = 'Camera or microphone is not available in this browser.';
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: true
    });
    cameraPreview.srcObject = mediaStream;
    await cameraPreview.play().catch(() => {});
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioData = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    analyticsTimer = setInterval(sampleBehaviorAnalytics, 900);
    statusText.textContent = 'Camera and microphone are active. Real-time behavior analysis is running.';
  } catch (error) {
    statusText.textContent = 'Camera/microphone permission was not granted. Interview can continue without behavior analytics.';
  }
}

function stopBehaviorAnalysis() {
  clearInterval(analyticsTimer);
  analyticsTimer = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  audioContext = null;
  analyser = null;
  audioData = null;
}

function sampleBehaviorAnalytics() {
  const visual = sampleCameraBehavior();
  const voice = sampleVoiceBehavior();
  const elapsedMinutes = Math.max((Date.now() - analytics.startedAt) / 60000, 0.05);
  const blinkRate = Math.round(analytics.blinkCount / elapsedMinutes);
  const movement = average(analytics.movementValues.slice(-12));
  const eyeContact = visual.eyeContact;
  const voiceStability = voice.voiceStability;
  const stress = clamp(Math.round((100 - eyeContact) * 0.25 + movement * 0.5 + blinkRate * 1.2 + (100 - voiceStability) * 0.3 + voice.silenceStress), 0, 100);
  const confidence = clamp(Math.round(eyeContact * 0.35 + voiceStability * 0.25 + (100 - stress) * 0.25 + visual.faceStability * 0.15), 0, 100);
  const emotion = classifyEmotion(confidence, stress, blinkRate, voice.speakingSpeed);
  const nervousness = classifyNervousness(stress);

  analytics.current = {
    emotion,
    confidence,
    stress,
    eyeContact,
    voiceStability,
    blinkRate,
    speakingSpeed: voice.speakingSpeed,
    nervousness
  };
  analytics.samples.push({ time: new Date().toISOString(), ...analytics.current });
  analytics.emotionTimeline.push({ time: Date.now(), emotion, confidence, stress });
  updateAnalyticsDashboard();
}

function sampleCameraBehavior() {
  if (!cameraPreview.videoWidth || !analysisContext) {
    return { eyeContact: 45, faceStability: 45 };
  }

  analysisCanvas.width = 96;
  analysisCanvas.height = 72;
  analysisContext.drawImage(cameraPreview, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const frame = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
  let totalBrightness = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightTotal = 0;

  for (let index = 0; index < frame.length; index += 4) {
    const brightness = (frame[index] + frame[index + 1] + frame[index + 2]) / 3;
    totalBrightness += brightness;
    const weight = Math.max(0, 255 - brightness);
    const pixel = index / 4;
    const x = pixel % analysisCanvas.width;
    const y = Math.floor(pixel / analysisCanvas.width);
    weightedX += x * weight;
    weightedY += y * weight;
    weightTotal += weight;
  }

  const brightnessAverage = totalBrightness / (frame.length / 4);
  const center = weightTotal
    ? { x: weightedX / weightTotal, y: weightedY / weightTotal }
    : { x: analysisCanvas.width / 2, y: analysisCanvas.height / 2 };
  const xOffset = Math.abs(center.x - analysisCanvas.width / 2) / (analysisCanvas.width / 2);
  const yOffset = Math.abs(center.y - analysisCanvas.height / 2) / (analysisCanvas.height / 2);
  const eyeContact = clamp(Math.round(100 - (xOffset * 55 + yOffset * 35)), 0, 100);

  let movement = 0;
  if (analytics.lastCenter) {
    movement = Math.hypot(center.x - analytics.lastCenter.x, center.y - analytics.lastCenter.y);
  }
  analytics.lastCenter = center;
  analytics.movementValues.push(movement * 10);
  analytics.movementValues = analytics.movementValues.slice(-40);

  if (
    analytics.lastBrightness &&
    brightnessAverage < analytics.lastBrightness * 0.82 &&
    Date.now() - analytics.lastBlinkAt > 900
  ) {
    analytics.blinkCount += 1;
    analytics.lastBlinkAt = Date.now();
  }
  analytics.lastBrightness = brightnessAverage;
  analytics.eyeContactValues.push(eyeContact);
  analytics.eyeContactValues = analytics.eyeContactValues.slice(-60);

  return {
    eyeContact,
    faceStability: clamp(Math.round(100 - average(analytics.movementValues.slice(-8))), 0, 100)
  };
}

function sampleVoiceBehavior() {
  let level = 0;
  if (analyser && audioData) {
    analyser.getByteTimeDomainData(audioData);
    let sum = 0;
    for (const value of audioData) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    level = Math.sqrt(sum / audioData.length);
  }

  analytics.audioLevels.push(level);
  analytics.audioLevels = analytics.audioLevels.slice(-60);
  const recentLevels = analytics.audioLevels.slice(-12);
  const mean = average(recentLevels);
  const variance = average(recentLevels.map((value) => Math.abs(value - mean)));
  const isSpeaking = level > 0.025;
  if (!analytics.speakingStartedAt && isSpeaking) analytics.speakingStartedAt = Date.now();
  if (!isSpeaking) analytics.silenceMs += 900;
  const speakingMinutes = analytics.speakingStartedAt ? Math.max((Date.now() - analytics.speakingStartedAt) / 60000, 0.05) : 0.05;
  const speakingSpeed = Math.round(analytics.spokenWords / speakingMinutes);
  const voiceStability = clamp(Math.round(100 - variance * 900 - analytics.fillerCount * 2), 0, 100);
  const silenceStress = analytics.silenceMs > 12000 ? 18 : analytics.silenceMs > 7000 ? 9 : 0;
  return { voiceStability, speakingSpeed, silenceStress };
}

function classifyEmotion(confidence, stress, blinkRate, speakingSpeed) {
  if (confidence >= 78 && stress < 35) return 'Confident';
  if (stress < 30 && confidence >= 55) return 'Calm';
  if (stress >= 78) return 'Stressed';
  if (blinkRate >= 30 || stress >= 65) return 'Anxious';
  if (confidence < 35 && stress >= 55) return 'Fearful';
  if (speakingSpeed > 150 && stress < 55) return 'Happy';
  if (confidence < 45) return 'Confused';
  return 'Nervous';
}

function classifyNervousness(stress) {
  if (stress >= 75) return 'Highly Stressed';
  if (stress >= 55) return 'Nervous';
  if (stress >= 35) return 'Slightly Nervous';
  return 'Calm';
}

function confidenceStatus(confidence) {
  if (confidence >= 75) return 'High Confidence';
  if (confidence >= 45) return 'Medium Confidence';
  return 'Low Confidence';
}

function updateAnalyticsDashboard() {
  const current = analytics.current;
  currentEmotionEl.textContent = `Emotion: ${current.emotion}`;
  confidenceStatusEl.textContent = confidenceStatus(current.confidence);
  confidenceScoreEl.textContent = `${current.confidence}%`;
  confidenceMeter.style.width = `${current.confidence}%`;
  stressScoreEl.textContent = `${current.stress}%`;
  stressMeter.style.width = `${current.stress}%`;
  eyeContactScoreEl.textContent = `${current.eyeContact}%`;
  voiceStabilityScoreEl.textContent = `${current.voiceStability}%`;
  blinkCountEl.textContent = analytics.blinkCount;
  blinkRateEl.textContent = `${current.blinkRate}/min`;
  speakingSpeedEl.textContent = `${current.speakingSpeed} wpm`;
  nervousnessLevelEl.textContent = current.nervousness;
}

async function startInterview() {
  const resumeText = resumeTextInput.value.trim();
  const resumeFile = resumeFileInput.files[0];
  const candidateName = candidateNameInput.value.trim();
  const candidateEmail = candidateEmailInput.value.trim();

  if (!candidateName) {
    statusText.textContent = 'Please enter your name.';
    return;
  }

  if (!candidateEmail) {
    statusText.textContent = 'Please enter your email address.';
    return;
  }

  if (!resumeText && !resumeFile) {
    statusText.textContent = 'Please paste your resume text or upload a PDF/image file first.';
    return;
  }

  startButton.disabled = true;
  statusText.textContent = 'Starting camera, microphone, and resume analysis...';
  await startBehaviorAnalysis();

  let requestOptions;
  if (resumeFile) {
    const formData = new FormData();
    formData.append('resumeFile', resumeFile);
    formData.append('language', language);
    formData.append('resumeText', resumeText);
    formData.append('questionCount', questionCountSelect.value);
    formData.append('skillLevel', skillLevelSelect.value);
    formData.append('role', selectedRole);
    formData.append('difficulty', difficultySelect.value);
    formData.append('candidateName', candidateName);
    formData.append('candidateEmail', candidateEmail);
    requestOptions = { method: 'POST', body: formData };
  } else {
    requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText,
        language,
        questionCount: questionCountSelect.value,
        skillLevel: skillLevelSelect.value,
        role: selectedRole,
        difficulty: difficultySelect.value,
        candidateName,
        candidateEmail
      })
    };
  }

  statusText.textContent = 'Extracting skills and generating customized questions...';
  const response = await fetch('/api/questions', requestOptions);

  if (!response.ok) {
    startButton.disabled = false;
    stopBehaviorAnalysis();
    const payload = await response.json().catch(() => ({}));
    statusText.textContent = payload.error || 'Unable to generate questions yet. Please try again.';
    return;
  }

  const payload = await response.json();
  candidateId = payload.candidateId;
  extractedSkills = payload.skills || [];
  extractedResumeText = payload.resumeText || resumeText;
  questions = payload.questions.slice(0, Number(questionCountSelect.value));
  currentIndex = 0;
  answers = [];
  answersWithScores = [];
  behaviorReport = null;
  document.getElementById('roleSelectionSection').classList.add('hidden');
  document.getElementById('resumeSection').classList.add('hidden');
  questionSection.classList.remove('hidden');
  summarySection.classList.add('hidden');
  statusText.textContent = '';
  showQuestion();
}

function showQuestion() {
  if (!questions[currentIndex]) return;
  currentQuestionEl.textContent = questions[currentIndex].prompt;
  questionCounterEl.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  progressInner.style.width = `${((currentIndex + 1) / questions.length) * 100}%`;
  answerText.value = '';
  analytics.silenceMs = 0;
  analytics.lastTranscriptAt = 0;
  statusText.textContent = '';
  speakText(questions[currentIndex].prompt);
  startTimer();
}

function moveToNextQuestion() {
  answers.push({
    question: questions[currentIndex].prompt,
    answer: answerText.value.trim() || '(No answer recorded)'
  });
  currentIndex += 1;
  if (currentIndex >= questions.length) {
    finishInterview();
    return;
  }
  showQuestion();
}

function finishInterview() {
  clearInterval(timerId);
  behaviorReport = buildBehaviorReport();
  stopBehaviorAnalysis();
  questionSection.classList.add('hidden');
  summarySection.classList.remove('hidden');
  displaySummary();
  displayBehaviorReport();
  evaluateAnswersAndSendReview();
  startButton.disabled = false;
}

async function evaluateAnswersAndSendReview() {
  statusText.textContent = 'Evaluating your answers with AI...';
  const evaluation = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillLevel: skillLevelSelect.value,
      jobRole: selectedRole,
      difficulty: difficultySelect.value,
      answers,
      extractedSkills
    })
  });

  if (evaluation.ok) {
    const payload = await evaluation.json();
    answersWithScores = payload.evaluations || [];
    displayEvaluationScores();
  }

  await sendReview();
  statusText.textContent = '';
}

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function displayEvaluationScores() {
  const cards = reviewSummary.querySelectorAll('.review-card');
  cards.forEach((card, index) => {
    const score = answersWithScores[index];
    if (!score) return;
    const panel = document.createElement('div');
    panel.className = 'score-panel';
    appendText(panel, 'h4', 'AI Evaluation');
    const grid = document.createElement('div');
    grid.className = 'score-grid';
    appendText(grid, 'div', `Technical: ${score.technical_accuracy}/10`);
    appendText(grid, 'div', `Communication: ${score.communication}/10`);
    appendText(grid, 'div', `Relevance: ${score.relevance}/10`);
    appendText(grid, 'div', `Confidence: ${score.confidence}/10`);
    panel.appendChild(grid);
    appendText(panel, 'p', `Feedback: ${score.feedback}`);
    appendText(panel, 'p', `Tip: ${score.improvement_tip}`);
    card.appendChild(panel);
  });
}

function displaySummary() {
  reviewSummary.innerHTML = '';
  answers.forEach((item, index) => {
    const block = document.createElement('div');
    block.className = 'review-card';
    appendText(block, 'h3', `Q${index + 1}: ${item.question}`);
    appendText(block, 'p', item.answer);
    reviewSummary.appendChild(block);
  });
}

function buildBehaviorReport() {
  const samples = analytics.samples;
  const confidence = Math.round(average(samples.map((sample) => sample.confidence)));
  const stress = Math.round(average(samples.map((sample) => sample.stress)));
  const eyeContact = Math.round(average(samples.map((sample) => sample.eyeContact)));
  const voiceStability = Math.round(average(samples.map((sample) => sample.voiceStability)));
  const speakingSpeed = Math.round(average(samples.map((sample) => sample.speakingSpeed)));
  const blinkRate = Math.round(average(samples.map((sample) => sample.blinkRate)));
  const communication = clamp(Math.round((voiceStability * 0.45) + (eyeContact * 0.25) + (100 - stress) * 0.2 + Math.min(speakingSpeed, 150) * 0.1), 0, 100);
  const nervousnessScore = clamp(Math.round(stress * 0.7 + blinkRate), 0, 100);
  const emotionCounts = samples.reduce((counts, sample) => {
    counts[sample.emotion] = (counts[sample.emotion] || 0) + 1;
    return counts;
  }, {});
  const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Calm';

  return {
    confidence,
    confidenceStatus: confidenceStatus(confidence),
    stress,
    stressState: classifyNervousness(stress),
    eyeContact,
    voiceStability,
    voiceStabilityScore: voiceStability,
    communicationScore: communication,
    nervousnessScore,
    blinkCount: analytics.blinkCount,
    blinkRate,
    speakingSpeed,
    fillerCount: analytics.fillerCount,
    dominantEmotion,
    emotionalTimeline: analytics.emotionTimeline.slice(-80),
    suggestions: buildBehaviorSuggestions(confidence, stress, eyeContact, voiceStability, blinkRate, speakingSpeed, analytics.fillerCount)
  };
}

function buildBehaviorSuggestions(confidence, stress, eyeContact, voiceStability, blinkRate, speakingSpeed, fillerCount) {
  const suggestions = [];
  if (confidence < 55) suggestions.push('Practice concise STAR-format answers to sound more certain.');
  if (stress > 55) suggestions.push('Use a short pause and controlled breathing before answering difficult questions.');
  if (eyeContact < 55) suggestions.push('Keep your face centered and look toward the camera while speaking.');
  if (voiceStability < 60) suggestions.push('Speak at a steady pace and finish each sentence fully before moving on.');
  if (blinkRate > 25) suggestions.push('High blink rate was detected; relax your eyes and avoid scanning around the screen.');
  if (speakingSpeed > 165) suggestions.push('Slow down slightly so important technical details are easier to understand.');
  if (fillerCount > 3) suggestions.push('Reduce filler words such as um, uh, like, and basically.');
  if (!suggestions.length) suggestions.push('Strong behavior profile. Keep the same steady eye contact and structured answers.');
  return suggestions;
}

function displayBehaviorReport() {
  if (!behaviorReport) return;
  const report = document.createElement('div');
  report.className = 'behavior-report';
  appendText(report, 'h3', 'Advanced Behavior Report');

  const grid = document.createElement('div');
  grid.className = 'report-grid';
  [
    ['Confidence', `${behaviorReport.confidence}% (${behaviorReport.confidenceStatus})`],
    ['Stress State', `${behaviorReport.stress}% (${behaviorReport.stressState})`],
    ['Dominant Emotion', behaviorReport.dominantEmotion],
    ['Eye Contact', `${behaviorReport.eyeContact}%`],
    ['Voice Stability', `${behaviorReport.voiceStabilityScore}%`],
    ['Communication', `${behaviorReport.communicationScore}%`],
    ['Nervousness', `${behaviorReport.nervousnessScore}%`],
    ['Blink Rate', `${behaviorReport.blinkRate}/min`],
    ['Speaking Speed', `${behaviorReport.speakingSpeed} wpm`],
    ['Filler Words', String(behaviorReport.fillerCount)]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    appendText(item, 'span', label);
    appendText(item, 'strong', value);
    grid.appendChild(item);
  });
  report.appendChild(grid);

  appendText(report, 'h4', 'Suggestions for Improvement');
  const list = document.createElement('ul');
  behaviorReport.suggestions.forEach((suggestion) => appendText(list, 'li', suggestion));
  report.appendChild(list);
  reviewSummary.prepend(report);
}

async function sendReview() {
  await fetch('/api/submit-interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidateId: candidateId,
      answers: answers,
      behaviorReport: behaviorReport,
      skillLevel: skillLevelSelect.value,
      jobRole: selectedRole
    })
  });
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speakButton.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.addEventListener('result', (event) => {
    const transcript = event.results[0][0].transcript;
    answerText.value = answerText.value ? `${answerText.value} ${transcript}` : transcript;
    const words = transcript.toLowerCase().match(/[a-z']+/g) || [];
    analytics.spokenWords += words.length;
    analytics.fillerCount += words.filter((word) => fillerWords.has(word)).length;
    analytics.lastTranscriptAt = Date.now();
    analytics.silenceMs = 0;
    statusText.textContent = 'Voice answer recorded.';
  });

  recognition.addEventListener('error', (event) => {
    statusText.textContent = `Speech recognition error: ${event.error}. Please try again.`;
  });

  recognition.addEventListener('end', () => {
    if (!answerText.value.trim()) {
      statusText.textContent = 'No speech was captured. Try again.';
    } else {
      speakText('Answer recorded.');
    }
  });
}

function startVoiceAnswer() {
  if (!recognition) return;
  statusText.textContent = 'Listening...';
  recognition.start();
}

async function loadReviews() {
  ownerMessage.textContent = '';
  ownerReviews.innerHTML = '';
  const passcode = ownerPasscode.value.trim();
  if (!passcode) {
    ownerMessage.textContent = 'Please enter the owner passcode.';
    return;
  }

  const response = await fetch(`/api/reviews?passcode=${encodeURIComponent(passcode)}`);
  if (!response.ok) {
    ownerMessage.textContent = 'Invalid passcode or no reviews available.';
    return;
  }

  const payload = await response.json();
  if (!payload.reviews.length) {
    ownerMessage.textContent = 'No reviews have been submitted yet.';
    return;
  }

  payload.reviews.forEach((review) => {
    const card = document.createElement('div');
    card.className = 'owner-review-card';
    appendText(card, 'h3', `${review.candidateName} - ${new Date(review.createdAt).toLocaleString()}`);
    const resume = review.resumeText || '';
    appendText(card, 'p', `${resume.slice(0, 220)}${resume.length > 220 ? '...' : ''}`);

    if (review.behaviorReport) {
      appendText(card, 'h4', 'Behavior Report');
      appendText(card, 'p', `Confidence ${review.behaviorReport.confidence}% | Stress ${review.behaviorReport.stress}% | Emotion ${review.behaviorReport.dominantEmotion}`);
    }

    review.answers.forEach((item) => {
      const answer = document.createElement('div');
      answer.className = 'review-answer';
      appendText(answer, 'strong', item.question);
      appendText(answer, 'p', item.answer);
      card.appendChild(answer);
    });
    ownerReviews.appendChild(card);
  });
}

function handleFileSelection() {
  const file = resumeFileInput.files[0];
  const hasFile = Boolean(file);
  resumeTextInput.disabled = hasFile;
  fileHint.textContent = hasFile
    ? `Selected file: ${file.name}. Resume text input is optional while file upload is active.`
    : 'Use a PDF or image file to extract resume text automatically.';
}

function loadVoiceSettings() {
  voiceSelection = voiceStyleSelect.value;
  chooseSpeechVoice();
}

async function loadRoles() {
  try {
    const response = await fetch('/api/roles');
    const data = await response.json();
    availableRoles = data.roles;
    displayRoleSelection();
  } catch (error) {
    console.error('Error loading roles:', error);
  }
}

function displayRoleSelection() {
  const roleGrid = document.getElementById('roleGrid');
  roleGrid.innerHTML = '';
  
  const roleEmojis = {
    'python_dev': '🐍',
    'web_dev': '🌐',
    'data_analyst': '📊',
    'java_dev': '☕',
    'ml_engineer': '🤖',
    'frontend_dev': '🎨',
    'backend_dev': '⚙️',
    'hr_interview': '💼',
    'sql_dev': '🗄️',
    'devops': '🚀',
    'fullstack': '🔗'
  };
  
  Object.entries(availableRoles).forEach(([key, label]) => {
    const card = document.createElement('div');
    card.className = `role-card ${key === selectedRole ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="role-emoji">${roleEmojis[key] || '💻'}</div>
      <div class="role-name">${label}</div>
    `;
    card.addEventListener('click', () => selectRole(key, card));
    roleGrid.appendChild(card);
  });
  
  document.getElementById('continueAfterRoleBtn').style.display = 'block';
}

function selectRole(roleKey, cardElement) {
  selectedRole = roleKey;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
}

function continueAfterRoleSelection() {
  document.getElementById('roleSelectionSection').classList.add('hidden');
  document.getElementById('resumeSection').classList.remove('hidden');
}

languageSelector.addEventListener('change', (event) => {
  language = event.target.value;
  updatePlaceholders();
  chooseSpeechVoice();
  initSpeechRecognition();
});
document.getElementById('continueAfterRoleBtn').addEventListener('click', continueAfterRoleSelection);
resumeFileInput.addEventListener('change', handleFileSelection);
voiceStyleSelect.addEventListener('change', loadVoiceSettings);
startButton.addEventListener('click', startInterview);
speakButton.addEventListener('click', startVoiceAnswer);
nextButton.addEventListener('click', () => {
  clearInterval(timerId);
  moveToNextQuestion();
});
loadReviewsButton.addEventListener('click', loadReviews);

loadRoles();
setLanguageOptions();
languageSelector.value = language;
loadVoiceSettings();
updatePlaceholders();
initSpeechRecognition();
handleFileSelection();
updateAnalyticsDashboard();
if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', chooseSpeechVoice);
}
