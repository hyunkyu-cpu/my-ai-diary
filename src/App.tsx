import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp, Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- 타입 정의 ---
interface Question { question: string; simple_answer: string; explanation: string; }
interface UserAnswers { [key: number]: string; }
interface RevealedAnswers { [key: number]: boolean; }
interface LearningChecklist { [key:string]: boolean; }
interface CoachingReport {
    summary: string;
    strength: string;
    tip: string;
    comment: string;
}
interface PraiseSticker { message: string; prompt: string; url: string; }

// --- 헬퍼 및 UI 컴포넌트 ---
const Spinner = () => <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>;

const Modal = ({ message, onClose }: { message: string; onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-8 shadow-2xl text-center max-w-sm mx-auto">
            <p className="text-white mb-6 whitespace-pre-wrap">{message}</p>
            <button onClick={onClose} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-transform transform hover:scale-105">확인</button>
        </div>
    </div>
);

const ChecklistItem = ({ label, isChecked, onToggle }: { label: string; isChecked: boolean; onToggle: () => void }) => (
    <div className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 ${isChecked ? 'bg-purple-600 shadow-lg' : 'bg-gray-700 hover:bg-gray-600'}`} onClick={onToggle}>
        <div className="w-5 h-5 border-2 border-white/50 rounded-sm flex items-center justify-center mr-3 flex-shrink-0">{isChecked && <span className="text-white">✔</span>}</div>
        <span className={`font-medium ${isChecked ? 'text-white' : 'text-gray-300'}`}>{label}</span>
    </div>
);

const EmotionButton = ({ label, emoji, isSelected, onClick }: { label: string; emoji: string; isSelected: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`flex-1 text-center py-3 px-2 rounded-lg transition-all duration-300 border-2 ${isSelected ? 'bg-yellow-500 border-yellow-400 scale-110 shadow-lg' : 'bg-gray-700 border-transparent hover:bg-gray-600'}`}>
        <span className="text-2xl">{emoji}</span>
        <span className={`block text-xs mt-1 font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{label}</span>
    </button>
);

const InteractiveQuestionCard = ({ question, simple_answer, explanation, index, userAnswer, onAnswerChange, onCheckAnswer, isRevealed }: { question: string; simple_answer: string; explanation: string; index: number; userAnswer: string; onAnswerChange: (val: string) => void; onCheckAnswer: () => void; isRevealed: boolean; }) => (
    <div className="bg-white/10 p-4 rounded-lg mt-2 transition-all duration-300">
        <p className="font-bold text-white">Q{index + 1}. {question}</p>
        {!isRevealed ? (
            <div className="mt-3 flex gap-2">
                <input type="text" value={userAnswer} onChange={(e) => onAnswerChange(e.target.value)} className="flex-grow bg-gray-900 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-green-500 focus:outline-none transition" placeholder="정답을 입력하세요..." />
                <button onClick={onCheckAnswer} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition">정답 확인</button>
            </div>
        ) : (
            <div className="mt-3 space-y-2 text-sm">
                <p><span className="font-semibold text-green-300">정답:</span> {simple_answer}</p>
                <p className="text-gray-300 pt-2 border-t border-white/10"><span className="font-semibold text-green-400">해설:</span> {explanation}</p>
            </div>
        )}
    </div>
);

const StudentFeedbackCard = ({ report }: { report: CoachingReport }) => (
    <div className="bg-gray-700 p-4 rounded-md space-y-4">
        <div>
            <h4 className="font-bold text-lg text-blue-300">✏️ 오늘 쓴 글 요약</h4>
            <p className="text-gray-200 mt-1">{report.summary}</p>
        </div>
        <div>
            <h4 className="font-bold text-lg text-yellow-300">🌟 잘한 점</h4>
            <p className="text-gray-200 mt-1">{report.strength}</p>
        </div>
        <div>
            <h4 className="font-bold text-lg text-green-300">💡 더 멋지게 쓰는 팁</h4>
            <p className="text-gray-200 mt-1">{report.tip}</p>
        </div>
        <div className="pt-4 border-t border-white/10">
            <h4 className="font-bold text-lg text-pink-300">❤️ 선생님의 한마디</h4>
            <p className="text-gray-200 mt-1">{report.comment}</p>
        </div>
    </div>
);


// --- 메인 앱 컴포넌트 ---
export default function App() {
    // --- 상태 관리 ---
    const [modalMessage, setModalMessage] = useState('');
    const [learningChecklist, setLearningChecklist] = useState<LearningChecklist>({});
    const [selectedEmotion, setSelectedEmotion] = useState('');
    const [emotionReason, setEmotionReason] = useState('');
    const [dailyThought, setDailyThought] = useState('');
    const [studyContent, setStudyContent] = useState('');
    const [coachingReport, setCoachingReport] = useState<CoachingReport | null>(null);
    const [problems, setProblems] = useState<Question[]>([]);
    const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
    const [revealedAnswers, setRevealedAnswers] = useState<RevealedAnswers>({});
    const [praiseSticker, setPraiseSticker] = useState<PraiseSticker | null>(null);
    const [story, setStory] = useState<string>('');

    const [loadingStates, setLoadingStates] = useState({
        analysis: false, problems: false, sticker: false, story: false,
    });
    
    const [db, setDb] = useState<Firestore | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- 정적 데이터 ---
    const checklistItems = [
        { id: 'concentration', label: '수업 집중' }, { id: 'homework', label: '숙제 완료' }, { id: 'review', label: '예습 또는 복습' },
        { id: 'tidying', label: '정리정돈' }, { id: 'customProblem', label: '나만의 문제 만들기' }, { id: 'mindmap', label: '배운 내용 마인드맵으로 그리기' },
    ];
    const emotions = [
        { id: 'good', label: '좋음', emoji: '😄' }, { id: 'ok', label: '괜찮음', emoji: '🙂' }, { id: 'soso', label: '그냥 그럼', emoji: '😐' },
        { id: 'sad', label: '슬픔', emoji: '😢' }, { id: 'tired', label: '피곤함', emoji: '😴' }, { id: 'angry', label: '화남', emoji: '😠' },
    ];
    
    // --- 환경 변수 및 Firebase 초기화 ---
    const getEnvVar = useCallback((key: string): string | undefined => {
        try {
            // @ts-ignore
            if (typeof import.meta.env !== 'undefined') { return import.meta.env[key]; }
        } catch (e) { /* ignore */ }
        return undefined;
    }, []);

    useEffect(() => {
        const firebaseConfigStr = getEnvVar('VITE_FIREBASE_CONFIG') || (typeof window !== 'undefined' ? (window as any).__firebase_config : undefined);
        if (!firebaseConfigStr || firebaseConfigStr.trim() === '' || firebaseConfigStr.trim() === '{}') {
            setError("Firebase 설정 정보를 찾을 수 없습니다.");
            setIsAuthReady(true);
            return;
        }
        try {
            const firebaseConfig = JSON.parse(firebaseConfigStr);
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const firestore = getFirestore(app);
            setDb(firestore);
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        const initialAuthToken = typeof window !== 'undefined' ? (window as any).__initial_auth_token : undefined;
                        if (initialAuthToken) {
                            await signInWithCustomToken(auth, initialAuthToken);
                        } else {
                            await signInAnonymously(auth);
                        }
                    } catch (authError) {
                        setError(`사용자 인증에 실패했습니다: ${authError instanceof Error ? authError.message : String(authError)}`);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (initError) {
            setError(`Firebase 초기화 오류가 발생했습니다: ${initError instanceof Error ? initError.message : String(initError)}`);
            setIsAuthReady(true);
        }
    }, [getEnvVar]);

    // --- 데이터 로딩 및 저장 ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;
        const appId = (typeof window !== 'undefined' ? (window as any).__app_id : undefined) || 'ai-learning-diary';
        const today = new Date().toISOString().slice(0, 10);
        const docRef = doc(db, "artifacts", appId, "users", userId, "daily_logs", today);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLearningChecklist(data.learningChecklist || {});
                setSelectedEmotion(data.selectedEmotion || '');
                setEmotionReason(data.emotionReason || '');
                setDailyThought(data.dailyThought || '');
                setStudyContent(data.studyContent || '');
                setCoachingReport(data.aiCoachingReport || null);
                setProblems(data.aiProblems || []);
                setUserAnswers(data.userAnswers || {});
                setRevealedAnswers(data.revealedAnswers || {});
                setPraiseSticker(data.aiPraiseSticker || null);
                setStory(data.aiStory || '');
            }
        }, (err) => {
            console.error("Firestore 데이터 동기화 오류:", err);
            setError("데이터를 불러오는 중 오류가 발생했습니다.");
        });
        return () => unsubscribe();
    }, [isAuthReady, db, userId]);

    const saveData = useCallback(async (dataToSave: { [key:string]: any }) => {
        if (!db || !userId) return;
        const appId = (typeof window !== 'undefined' ? (window as any).__app_id : undefined) || 'ai-learning-diary';
        const today = new Date().toISOString().slice(0, 10);
        const docRef = doc(db, "artifacts", appId, "users", userId, "daily_logs", today);
        try {
            await setDoc(docRef, { ...dataToSave, lastUpdated: serverTimestamp() }, { merge: true });
        } catch (err) {
            setModalMessage("데이터 저장에 실패했습니다.");
        }
    }, [db, userId]);

    // --- UI 이벤트 핸들러 ---
    const handleChecklistToggle = (id: string) => {
        const updated = { ...learningChecklist, [id]: !learningChecklist[id] };
        setLearningChecklist(updated);
        saveData({ learningChecklist: updated });
    };
    
    const handleUserAnswerChange = (index: number, value: string) => {
        const updated = { ...userAnswers, [index]: value };
        setUserAnswers(updated);
        saveData({ userAnswers: updated });
    };

    const handleCheckAnswer = (index: number) => {
        const updated = { ...revealedAnswers, [index]: true };
        setRevealedAnswers(updated);
        saveData({ revealedAnswers: updated });
    };

    // --- Gemini API 호출 ---
    const getGeminiApiKey = useCallback((): string | null => {
        const apiKey = getEnvVar('VITE_GEMINI_API_KEY');
        if (typeof apiKey !== 'undefined') return apiKey;
        if (typeof window !== 'undefined' && typeof (window as any).__firebase_config !== 'undefined') return ""; 
        return null;
    }, [getEnvVar]);

    const callGeminiAPI = async (prompt: string, model: string = 'gemini-2.0-flash', generationConfig?: object) => {
        const apiKey = getGeminiApiKey();
        if (apiKey === null) {
            setError("Gemini API 키가 설정되지 않았습니다.");
            return null;
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], ...(generationConfig && { generationConfig }) };
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
            return await response.json();
        } catch (err) {
            setModalMessage(`AI 모델 호출 중 오류가 발생했습니다.`);
            return null;
        }
    };
    
    const callImagenAPI = async (prompt: string) => {
        const apiKey = getGeminiApiKey();
        if (apiKey === null) {
            setError("API 키가 설정되지 않았습니다.");
            return null;
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
        const body = { instances: [{ prompt }], parameters: { "sampleCount": 1 } };
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
            return await response.json();
        } catch (err) {
            setModalMessage(`이미지 생성 중 오류가 발생했습니다.`);
            return null;
        }
    };
    
    const setLoading = (key: keyof typeof loadingStates, value: boolean) => {
        setLoadingStates(prev => ({ ...prev, [key]: value }));
    };

    // --- AI 기능 핸들러 ---
    const handleGetWritingCoaching = async () => {
        if (!studyContent.trim()) { 
            setModalMessage('먼저 오늘 배운 내용을 작성해주세요!'); 
            return; 
        }
        setLoading('analysis', true);
        setCoachingReport(null);
        const prompt = `
            너는 초등학생의 학습 글쓰기에 대해 친절하고 이해하기 쉬운 피드백을 제공하는 선생님이야.
            아래 학생의 글쓰기 내용을 참고하여, 4가지 항목에 맞춰 JSON 형식으로 결과를 작성해줘. 모든 결과는 학생이 보고 기분 좋게 다음 글쓰기를 할 수 있도록, 아주 친절하고 따뜻한 말투로 작성해야 해.
            [입력 예시]
            - 학생의 글: "선분에 대해서 공부했다."
            [출력 형식 예시]
            {
              "summary": "우리 친구가 오늘 공부한 내용을 '선분에 대해서 공부했다'고 적어주었어요!",
              "strength": "배운 내용을 잊지 않고 정확하게 적어주었어요. 공부한 내용을 스스로 글로 쓰는 건 정말 대단한 일이에요!",
              "tip": "선분이 우리 주변 어디에서 보였는지(예: 책 모서리, 창틀 등) 한 가지 예시를 글에 써주면 선생님이 우리 친구가 더 잘 이해하고 있구나 느낄 수 있어요!",
              "comment": "오늘도 멋진 글을 써줘서 고마워요! 앞으로도 작은 것이라도 느낀 점을 함께 적으며 우리 친구의 글이 점점 길어지고 풍성해지길 응원할게요! 😊"
            }
            [실제 분석 요청]
            - 학생의 글: "${studyContent}"
        `;
        const result = await callGeminiAPI(prompt, 'gemini-2.0-flash', { responseMimeType: "application/json" });
        if (result) {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    setCoachingReport(parsed);
                    await saveData({ aiCoachingReport: parsed });
                } catch(e) { setModalMessage("코칭 리포트를 처리하는 데 실패했습니다."); }
            }
        }
        setLoading('analysis', false);
    };

    const handleGetProblems = async () => {
        if (!studyContent.trim()) { setModalMessage('공부한 내용을 먼저 입력해주세요!'); return; }
        setLoading('problems', true);
        setProblems([]);
        setRevealedAnswers({});
        setUserAnswers({});
        const prompt = `당신은 초등학교 3학년 학생을 위한 AI 학습 친구입니다. 학생이 공부한 내용을 바탕으로, 아주 쉽고 재미있는 퀴즈 3개를 만들어주세요. 초등학생이 이해할 수 있는 단어만 사용해야 합니다. 각 퀴즈는 질문, 간단한 정답, 그리고 친절하고 쉬운 설명을 포함해야 합니다. 반드시 JSON 형식으로 {"problems": [{"question": "문제 내용", "simple_answer": "간단한 정답", "explanation": "자세한 해설"}]} 구조를 따라야 합니다.\n\n[학습 내용]:\n${studyContent}`;
        const result = await callGeminiAPI(prompt, 'gemini-2.0-flash', { responseMimeType: "application/json" });
        if (result) {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    const newProblems = parsed.problems || [];
                    setProblems(newProblems);
                    if (newProblems.length > 0) {
                        await saveData({ aiProblems: newProblems, userAnswers: {}, revealedAnswers: {} });
                    } else {
                        setModalMessage("입력된 내용으로는 문제를 만들기 충분하지 않은 것 같아요.");
                    }
                } catch(e) { /* ... */ }
            }
        }
        setLoading('problems', false);
    };

    const handleGetPraiseSticker = async () => {
        const diarySummary = `체크리스트: ${Object.entries(learningChecklist).filter(([, val]) => val).map(([key]) => checklistItems.find(item => item.id === key)?.label).join(', ') || '없음'}, 감정: ${emotions.find(e => e.id === selectedEmotion)?.label || '선택안함'}, 생각: ${dailyThought || '없음'}`;
        if (Object.values(learningChecklist).every(v => !v) && !selectedEmotion && !dailyThought.trim()) {
            setModalMessage('오늘의 활동을 하나 이상 기록해야 스티커를 받을 수 있어요!');
            return;
        }
        setLoading('sticker', true);
        setPraiseSticker(null);

        const promptGenPrompt = `당신은 초등학생을 칭찬하는 AI입니다. 학생의 하루 기록을 보고, 칭찬 메시지와 칭찬 스티커 이미지를 만들기 위한 영어 프롬프트를 생성해주세요. 칭찬 메시지는 한글로 1~2문장의 짧고 구체적인 칭찬이어야 합니다. 이미지 프롬프트는 'A cute cartoon gold medal with a smiling face, happy, simple vector art' 와 같이 귀여운 만화 스타일이어야 합니다. 반드시 JSON 형식으로 {"message": "칭찬 메시지", "prompt": "이미지 프롬프트"} 라고 답해주세요.\n\n[학생 기록]:\n${diarySummary}`;
        
        const promptResult = await callGeminiAPI(promptGenPrompt, 'gemini-2.0-flash', { responseMimeType: "application/json" });
        if (promptResult) {
            const jsonText = promptResult.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    const imageResult = await callImagenAPI(parsed.prompt);
                    if (imageResult && imageResult.predictions && imageResult.predictions[0].bytesBase64Encoded) {
                        const imageUrl = `data:image/png;base64,${imageResult.predictions[0].bytesBase64Encoded}`;
                        const newSticker = { message: parsed.message, prompt: parsed.prompt, url: imageUrl };
                        setPraiseSticker(newSticker);
                        await saveData({ aiPraiseSticker: newSticker });
                    }
                } catch(e) { setModalMessage("스티커를 만들다가 오류가 생겼어요."); }
            }
        }
        setLoading('sticker', false);
    };

    const handleGetStory = async () => {
        if (!studyContent.trim()) { setModalMessage('동화를 만들려면 공부한 내용을 먼저 알려주세요!'); return; }
        setLoading('story', true);
        setStory('');
        const prompt = `당신은 아주 재미있는 동화 작가입니다. 초등학교 3학년 학생이 공부한 내용을 주제로, 짧고 신나는 동화 한 편을 써주세요. 주인공이 등장해서 모험을 떠나는 이야기면 좋겠습니다. 어려운 단어는 쓰지 말고, 5~7문장 정도로 짧게 써주세요.\n\n[오늘 배운 내용]:\n${studyContent}\n\n[재미있는 학습 동화]:`;
        const result = await callGeminiAPI(prompt);
        if (result) {
            const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "동화를 만들지 못했어요. 다시 시도해봐요!";
            setStory(generatedText);
            await saveData({ aiStory: generatedText });
        }
        setLoading('story', false);
    };

    // --- 렌더링 ---
    if (error) return ( <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center"><div className="text-center bg-gray-800 p-8 rounded-lg max-w-lg shadow-2xl"><h2 className="text-2xl font-bold text-red-500 mb-4">🚨 앱에 문제가 발생했습니다</h2><p className="text-gray-300 bg-gray-900 p-4 rounded-md whitespace-pre-wrap">{error}</p></div></div>);
    if (!isAuthReady) return ( <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center"><Spinner /><p className="ml-4">앱을 안전하게 준비하고 있습니다...</p></div>);

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-white p-4 md:p-8 flex justify-center">
            {modalMessage && <Modal message={modalMessage} onClose={() => setModalMessage('')} />}
            <div className="w-full max-w-2xl pb-16">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">AI 학습 일기</h1>
                    <p className="text-gray-400 mt-2">AI 선생님과 함께 성장하는 하루를 기록해요.</p>
                </header>

                <main className="space-y-8">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg space-y-6">
                        <div>
                            <h3 className="text-lg font-bold mb-3 text-purple-300">1. 오늘의 학습 루틴 체크리스트</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {checklistItems.map(item => <ChecklistItem key={item.id} label={item.label} isChecked={!!learningChecklist[item.id]} onToggle={() => handleChecklistToggle(item.id)} />)}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold mb-3 text-yellow-300">2. 오늘의 감정은?</h3>
                            <div className="flex gap-2 mb-3">
                                {emotions.map(emotion => <EmotionButton key={emotion.id} label={emotion.label} emoji={emotion.emoji} isSelected={selectedEmotion === emotion.id} onClick={() => setSelectedEmotion(emotion.id)} />)}
                            </div>
                            <input type="text" className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition" placeholder="왜 그렇게 느꼈나요? (선택 사항)" value={emotionReason} onChange={e => setEmotionReason(e.target.value)} onBlur={e => saveData({emotionReason: e.target.value, selectedEmotion})} />
                        </div>
                        <div>
                             <h3 className="text-lg font-bold mb-3 text-pink-300">3. 오늘의 생각 한 줄</h3>
                             <textarea rows={3} className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-pink-500 focus:outline-none transition" placeholder="자유롭게 느낀 점을 기록해보세요." value={dailyThought} onChange={e => setDailyThought(e.target.value)} onBlur={e => saveData({dailyThought: e.target.value})} />
                        </div>
                        <button onClick={handleGetPraiseSticker} disabled={loadingStates.sticker} className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md">
                            {loadingStates.sticker ? <Spinner /> : '✨ 칭찬 스티커 받기'}
                        </button>
                    </div>

                    {(praiseSticker || loadingStates.sticker) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg"><h2 className="text-xl font-bold mb-3 text-yellow-300">🌟 오늘의 칭찬 스티커</h2><div className="bg-gray-700 p-4 rounded-md min-h-[200px] flex flex-col justify-center items-center text-center">{loadingStates.sticker ? <div className="text-center"><Spinner /><p className="mt-2 text-gray-400">스티커를 만들고 있어요...</p></div> : praiseSticker && <> <img src={praiseSticker.url} alt={praiseSticker.prompt} className="rounded-md w-32 h-32 mx-auto" /> <p className="mt-4 text-lg font-semibold text-yellow-200">{praiseSticker.message}</p> </>}</div></div>
                    )}

                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg space-y-4">
                        <div>
                            <h3 className="text-lg font-bold mb-3 text-green-300">오늘 배운 내용을 설명해 봅시다</h3>
                            <textarea rows={4} className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-green-500 focus:outline-none transition" placeholder="오늘 배운 내용을 바탕으로 자유롭게 글을 써보세요." value={studyContent} onChange={(e) => setStudyContent(e.target.value)} onBlur={e => saveData({studyContent: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button onClick={handleGetWritingCoaching} disabled={loadingStates.analysis} className="col-span-1 sm:col-span-2 w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md">
                                {loadingStates.analysis ? <Spinner /> : '✍️ AI 맞춤형 학습 코칭 받기'}
                            </button>
                            <button onClick={handleGetProblems} disabled={loadingStates.problems} className="w-full flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md">
                                {loadingStates.problems ? <Spinner /> : '📝 관련 문제 풀기'}
                            </button>
                            <button onClick={handleGetStory} disabled={loadingStates.story} className="col-span-1 sm:col-span-2 w-full flex justify-center items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md">
                                {loadingStates.story ? <Spinner /> : '✨ 학습 동화 만들기'}
                            </button>
                        </div>
                    </div>

                    {(coachingReport || loadingStates.analysis) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-blue-300">✍️ AI 맞춤형 학습 코칭</h2>
                            {loadingStates.analysis ? (
                                <div className="flex justify-center items-center h-full min-h-[200px]"><p className="text-gray-400">우리 친구의 글을 꼼꼼히 읽어보고 있어요...</p></div>
                            ) : coachingReport && (
                                <StudentFeedbackCard report={coachingReport} />
                            )}
                        </div>
                    )}

                    {(story || loadingStates.story) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg"><h2 className="text-xl font-bold mb-3 text-rose-300">📖 AI 학습 동화</h2><div className="bg-gray-700 p-4 rounded-md min-h-[150px]">{loadingStates.story ? <div className="flex justify-center items-center h-full"><p className="text-gray-400">재미있는 동화를 쓰고 있어요...</p></div> : <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{story}</p>}</div></div>
                    )}

                    {(problems.length > 0 || loadingStates.problems) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-green-300">🧠 AI 추천 문제 풀어보기</h2>
                            <div className="bg-gray-700 p-4 rounded-md min-h-[100px]">
                                {loadingStates.problems ? <div className="flex justify-center items-center h-full"><p className="text-gray-400">문제를 만들고 있어요...</p></div> : problems.map((p, i) => (
                                    <InteractiveQuestionCard
                                        key={i}
                                        index={i}
                                        question={p.question}
                                        simple_answer={p.simple_answer}
                                        explanation={p.explanation}
                                        userAnswer={userAnswers[i] || ''}
                                        onAnswerChange={(val) => handleUserAnswerChange(i, val)}
                                        onCheckAnswer={() => handleCheckAnswer(i)}
                                        isRevealed={!!revealedAnswers[i]}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
