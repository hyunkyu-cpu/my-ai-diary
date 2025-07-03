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
interface StoryData {
    title: string;
    story: string;
    summary: string;
    questions: string[];
}


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

const StoryCard = ({ data }: { data: StoryData }) => (
    <div className="bg-gray-700 p-4 rounded-md space-y-4">
        <div>
            <h4 className="font-bold text-lg text-rose-300">📖 오늘의 학습 동화: {data.title}</h4>
            <p className="text-gray-200 mt-2 whitespace-pre-wrap leading-relaxed">{data.story}</p>
        </div>
        <div className="pt-4 border-t border-white/10">
            <h4 className="font-bold text-lg text-rose-300">📝 오늘 배운 내용 정리</h4>
            <p className="text-gray-200 mt-1">{data.summary}</p>
        </div>
        <div className="pt-4 border-t border-white/10">
            <h4 className="font-bold text-lg text-rose-300">❓ 생각해보기</h4>
            <ul className="list-disc list-inside mt-1 text-gray-200 space-y-1">
                {data.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
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
    const [lifeFeedback, setLifeFeedback] = useState('');
    const [studyContent, setStudyContent] = useState('');
    const [coachingReport, setCoachingReport] = useState<CoachingReport | null>(null);
    const [problems, setProblems] = useState<Question[]>([]);
    const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
    const [revealedAnswers, setRevealedAnswers] = useState<RevealedAnswers>({});
    const [storyData, setStoryData] = useState<StoryData | null>(null);
    const [loadingStates, setLoadingStates] = useState({
        lifeFeedback: false, analysis: false, problems: false, story: false, sendingDiary: false,
    });
    const [db, setDb] = useState<Firestore | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [studentName, setStudentName] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');


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
                setLifeFeedback(data.aiLifeFeedback || '');
                setStudyContent(data.studyContent || '');
                setCoachingReport(data.aiCoachingReport || null);
                setProblems(data.aiProblems || []);
                setUserAnswers(data.userAnswers || {});
                setRevealedAnswers(data.revealedAnswers || {});
                setStoryData(data.aiStoryData || null);
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
    
    const setLoading = (key: keyof typeof loadingStates, value: boolean) => {
        setLoadingStates(prev => ({ ...prev, [key]: value }));
    };

    // --- AI 기능 핸들러 ---
    const handleGetLifeFeedback = async () => {
        if (Object.values(learningChecklist).every(v => !v) && !selectedEmotion && !dailyThought.trim()) {
            setModalMessage('오늘의 활동을 하나 이상 기록해야 피드백을 받을 수 있어요!');
            return;
        }
        setLoading('lifeFeedback', true);
        setLifeFeedback('');
        const checkedItems = checklistItems.filter(item => learningChecklist[item.id]).map(item => item.label).join(', ') || '없음';
        const emotionLabel = emotions.find(e => e.id === selectedEmotion)?.label || '표시 안 함';
        const prompt = `당신은 초등학교 3학년 학생의 AI 담임선생님입니다. 학생의 하루 기록을 보고, 아주 다정하고 따뜻한 격려의 말을 한글로 2~3문장 작성해주세요. 학생의 감정을 공감해주고, 작은 노력도 칭찬해주세요.\n\n[학생 기록]\n- 학습 체크리스트: ${checkedItems}\n- 오늘의 감정: ${emotionLabel} (${emotionReason || '이유 없음'})\n- 오늘의 생각: ${dailyThought}\n\n[선생님의 따뜻한 한마디]:`;
        const result = await callGeminiAPI(prompt);
        if (result) {
            const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "피드백을 생성하지 못했어요.";
            setLifeFeedback(generatedText);
            await saveData({ aiLifeFeedback: generatedText });
        }
        setLoading('lifeFeedback', false);
    };

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

    const handleGetStory = async () => {
        if (!studyContent.trim()) { 
            setModalMessage('동화를 만들려면 공부한 내용을 먼저 알려주세요!'); 
            return; 
        }
        setLoading('story', true);
        setStoryData(null);
        const prompt = `
            너는 초등학교 3학년 학생이 오늘 배운 내용을 더 재미있게 이해할 수 있도록 짧고 따뜻한 학습 동화를 만들어주는 AI야.
            아래 학생의 글과 학습 목표를 참고해서, 4가지 항목을 포함한 JSON 형식으로 동화를 만들어줘.
            1. title: 동화의 제목
            2. story: 초등학교 3학년 학생이 이해할 수 있는 단어와 문장으로, 학습 목표의 핵심 개념을 자연스럽게 포함시킨 5~7문장의 동화
            3. summary: 동화 마지막에 오늘 배운 내용을 한두 문장으로 간단하고 쉽게 정리
            4. questions: 동화를 읽은 후 학생이 스스로 생각해볼 수 있는 질문 1~2개
            
            [입력 예시]
            - 학생의 글: "직선에 대해서 공부했다."
            - 학습 목표: "직선의 정의를 이해하고, 직선과 선분의 차이를 구별할 수 있다."

            [출력 형식 예시]
            {
              "title": "끝없이 여행하는 직선 친구",
              "story": "옛날 옛날에, 끝없이 뻗어 나가는 것을 좋아하는 '직선'이라는 친구가 살았어요. 직선은 양쪽으로 쉬지 않고 쌩쌩 달릴 수 있었죠. 어느 날, '선분'이라는 친구를 만났어요. 선분은 시작하는 점과 끝나는 점이 있어서, 직선처럼 끝없이 달리지는 못했답니다. 대신 정해진 길을 아주 반듯하게 갈 수 있었어요. 직선과 선분은 서로 다르지만, 둘 다 멋진 친구였답니다.",
              "summary": "직선은 양쪽으로 끝없이 뻗어나가는 선이고, 선분은 시작과 끝이 정해진 반듯한 선이에요.",
              "questions": [
                "우리 교실에서 직선처럼 끝없이 뻗어나갈 것 같은 선은 어디에 있을까요?",
                "내 필통 속에 있는 물건 중에서는 선분을 찾을 수 있을까요?"
              ]
            }

            [실제 요청]
            - 학생의 글: "${studyContent}"
            - 학습 목표: "학생이 작성한 글을 바탕으로, 글의 핵심 개념을 학습 목표로 삼아주세요."
        `;
        const result = await callGeminiAPI(prompt, 'gemini-2.0-flash', { responseMimeType: "application/json" });
        if (result) {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    setStoryData(parsed);
                    await saveData({ aiStoryData: parsed });
                } catch(e) { setModalMessage("학습 동화를 처리하는 데 실패했습니다."); }
            }
        }
        setLoading('story', false);
    };

    // ✨ 신규: 선생님께 일기 보내기 함수
    const saveAndSendDiary = async () => {
        if (!studentName) {
            setModalMessage('학생 정보가 없습니다. 이름을 입력하고 [이름 설정] 버튼을 눌러주세요.');
            return;
        }

        const checkedItemsText = checklistItems.filter(item => learningChecklist[item.id]).map(item => item.label).join(', ') || '없음';
        const emotionLabel = emotions.find(e => e.id === selectedEmotion)?.label || '표시 안 함';

        const diaryContent = `[오늘의 학습 루틴]\n${checkedItemsText}\n\n[오늘의 감정]\n- 기분: ${emotionLabel}\n- 이유: ${emotionReason || '기록 없음'}\n\n[오늘의 생각]\n${dailyThought || '기록 없음'}\n\n[오늘 배운 내용]\n${studyContent || '기록 없음'}`;

        setLoading('sendingDiary', true);

        try {
            const response = await fetch("https://us-central1-exalted-yeti2.cloudfunctions.net/addDiary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentId: studentName,
                    content: diaryContent.trim(),
                }),
            });

            if (response.ok) {
                setModalMessage("일기가 선생님께 안전하게 전달되었어요! 😊");
            } else {
                throw new Error("서버에서 오류가 발생했습니다.");
            }
        } catch (error) {
            console.error("일기 전송 오류:", error);
            setModalMessage("오류가 발생하여 일기를 전송하지 못했습니다. 인터넷 연결을 확인해주세요.");
        } finally {
            setLoading('sendingDiary', false);
        }
    };

    // --- 렌더링 ---
    if (error) return ( <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center"><div className="text-center bg-gray-800 p-8 rounded-lg max-w-lg shadow-2xl"><h2 className="text-2xl font-bold text-red-500 mb-4">🚨 앱에 문제가 발생했습니다</h2><p className="text-gray-300 bg-gray-900 p-4 rounded-md whitespace-pre-wrap">{error}</p></div></div>);
    if (!isAuthReady) return ( <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center"><Spinner /><p className="ml-4">앱을 안전하게 준비하고 있습니다...</p></div>);

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-white p-4 md:p-8 flex justify-center">
            {modalMessage && <Modal message={modalMessage} onClose={() => setModalMessage('')} />}
            <div className="w-full max-w-2xl pb-16">
                <header className="text-center mb-8">
                    {/* ✨✨✨ 이 부분이 새로 추가된 이름 설정 UI 입니다 ✨✨✨ */}
                    <div className="bg-gray-700 p-4 rounded-lg mb-8">
                        <h2 className="text-lg font-bold text-teal-300">👋 안녕하세요! {studentName || '학생'}님</h2>
                        <div className="flex gap-2 mt-3">
                            <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                className="flex-grow bg-gray-800 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
                                placeholder="여기에 이름을 입력하세요 (예: 김대수)"
                            />
                            <button
                                onClick={() => setStudentName(tempName)}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition"
                            >
                                이름 설정
                            </button>
                        </div>
                         <p className="text-xs text-gray-400 mt-2">테스트를 위해 이름을 입력하고 '이름 설정'을 눌러주세요.</p>
                    </div>

                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">AI 학습 일기</h1>
                    <p className="text-gray-400 mt-2">AI 선생님과 함께 성장하는 하루를 기록해요.</p>
                </header>

                <main className="space-y-8">
                    {/* ... (나머지 UI는 이전과 동일) ... */}
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
                        <button onClick={handleGetLifeFeedback} disabled={loadingStates.lifeFeedback} className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md">
                            {loadingStates.lifeFeedback ? <Spinner /> : '✨ AI 선생님 피드백 받기'}
                        </button>
                    </div>

                    {(lifeFeedback || loadingStates.lifeFeedback) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg"><h2 className="text-xl font-bold mb-3 text-yellow-300">💌 AI 선생님의 따뜻한 피드백</h2><div className="bg-gray-700 p-4 rounded-md min-h-[100px] flex items-center justify-center">{loadingStates.lifeFeedback ? <p className="text-gray-400">선생님께서 피드백을 작성하고 계세요...</p> : <p className="text-gray-300 whitespace-pre-wrap">{lifeFeedback}</p>}</div></div>
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
                                {loadingStates.story ? <Spinner /> : '📖 학습 동화 만들기'}
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

                    {(storyData || loadingStates.story) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-rose-300">📖 AI 학습 동화</h2>
                            {loadingStates.story ? (
                                <div className="flex justify-center items-center h-full min-h-[200px]"><p className="text-gray-400">재미있는 동화를 만들고 있어요...</p></div>
                            ) : storyData && (
                                <StoryCard data={storyData} />
                            )}
                        </div>
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
                    
                    <div className="mt-12 text-center border-t-2 border-dashed border-gray-700 pt-8">
                         <button
                            onClick={saveAndSendDiary}
                            disabled={loadingStates.sendingDiary}
                            className="w-full max-w-xs mx-auto flex justify-center items-center gap-3 bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 disabled:opacity-50 text-white font-extrabold py-4 px-6 rounded-lg transition duration-300 shadow-xl text-lg"
                        >
                            {loadingStates.sendingDiary ? <Spinner /> : '💌 오늘 일기 저장하기'}
                        </button>
                        <p className="text-gray-500 text-xs mt-4">이 버튼을 누르면 오늘 작성한 모든 내용이 선생님께 전달됩니다.</p>
                    </div>

                </main>
            </div>
        </div>
    );
}

```

---

### ## 2단계: 배포 절차 다시 실행하기

1.  VS Code에서 `App.jsx` 파일의 내용을 위 코드로 **완전히 교체**합니다.
2.  **`Ctrl + S`** 를 눌러 파일을 **저장**합니다.
3.  터미널을 열고 `my-ai-diary` 폴더가 맞는지 확인한 뒤, 아래 명령어들을 **한 줄씩 순서대로** 실행합니다.

    ```bash
    git add .
    ```bash
    git commit -m "임시 이름 설정 기능 추가"
    ```bash
    git push
    ```

4.  Vercel 사이트에서 배포가 완료될 때까지 기다린 후, 앱 페이지에서 **강력 새로고침 (`Ctrl + Shift + R`)**을 해주세요.

이번에는 반드시 화면 맨 위에 이름 입력창이 보일