import React from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp, Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- 타입 정의 ---
interface Question {
    question: string;
    answer: string;
}

interface LearningChecklist {
    [key:string]: boolean;
}

interface DeepDive {
    concept: string;
    keyword: string;
}


// --- 헬퍼 및 UI 컴포넌트 ---

const Spinner = () => (
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

const Modal = ({ message, onClose }: { message: string; onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-8 shadow-2xl text-center max-w-sm mx-auto">
            <p className="text-white mb-6 whitespace-pre-wrap">{message}</p>
            <button
                onClick={onClose}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-transform transform hover:scale-105"
            >
                확인
            </button>
        </div>
    </div>
);

const DebugInfo = () => {
    // Vercel 배포 디버깅을 돕기 위한 정보 UI 입니다.
    const getEnvVar = (key: string): string | undefined => {
        try {
            // @ts-ignore
            if (typeof import.meta.env !== 'undefined') {
                // @ts-ignore
                return import.meta.env[key];
            }
        } catch (e) {
            // 'import.meta'가 지원되지 않는 환경 무시
        }
        return undefined;
    };
    
    // @ts-ignore
    const isProd = getEnvVar('PROD');

    if (isProd) {
        return null;
    }

    const firebaseConfigValue = getEnvVar('VITE_FIREBASE_CONFIG') || (typeof window !== 'undefined' ? (window as any).__firebase_config : undefined);
    const geminiKeyValue = getEnvVar('VITE_GEMINI_API_KEY');
    
    let firebaseStatus: string;
    if (!firebaseConfigValue || firebaseConfigValue.trim() === '' || firebaseConfigValue.trim() === '{}') {
        firebaseStatus = "❌ 찾을 수 없음 (환경변수 또는 __firebase_config 확인)";
    } else {
        try {
            JSON.parse(firebaseConfigValue);
            firebaseStatus = "✅ JSON 형식 올바름";
        } catch (e) {
            firebaseStatus = "❌ JSON 형식 오류!";
        }
    }

    const geminiStatus = geminiKeyValue ? "✅ 찾음" : "🤔 찾을 수 없음 (Canvas 환경에서는 자동 제공)";

    return (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg shadow-lg text-xs font-mono z-50 border border-gray-600">
            <h4 className="font-bold text-yellow-300 mb-2">[⚙️ 배포 상태 진단]</h4>
            <p>VITE_FIREBASE_CONFIG: {firebaseStatus}</p>
            <p>VITE_GEMINI_API_KEY: {geminiStatus}</p>
            <p className="mt-2 text-gray-400">이 창은 개발 모드에서만 보입니다.</p>
        </div>
    );
};


const QuestionCard = ({ question, answer, index }: { question: string; answer: string; index: number }) => (
    <div className="bg-white/10 p-4 rounded-lg mt-2 transition-all duration-300 hover:bg-white/20">
        <p className="font-bold text-white">Q{index + 1}. {question}</p>
        <p className="text-sm text-green-300 mt-2">정답: {answer}</p>
    </div>
);

const ChecklistItem = ({ label, isChecked, onToggle }: { label: string; isChecked: boolean; onToggle: () => void }) => (
    <div
        className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 ${isChecked ? 'bg-purple-600 shadow-lg' : 'bg-gray-700 hover:bg-gray-600'}`}
        onClick={onToggle}
    >
        <div className="w-5 h-5 border-2 border-white/50 rounded-sm flex items-center justify-center mr-3 flex-shrink-0">
            {isChecked && <span className="text-white">✔</span>}
        </div>
        <span className={`font-medium ${isChecked ? 'text-white' : 'text-gray-300'}`}>{label}</span>
    </div>
);

const EmotionButton = ({ label, emoji, isSelected, onClick }: { label: string; emoji: string; isSelected: boolean; onClick: () => void }) => (
    <button
        onClick={onClick}
        className={`flex-1 text-center py-3 px-2 rounded-lg transition-all duration-300 border-2 ${isSelected ? 'bg-yellow-500 border-yellow-400 scale-110 shadow-lg' : 'bg-gray-700 border-transparent hover:bg-gray-600'}`}
    >
        <span className="text-2xl">{emoji}</span>
        <span className={`block text-xs mt-1 font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{label}</span>
    </button>
);


// --- 메인 앱 컴포넌트 ---

export default function App() {
    // --- 상태 관리 ---
    const [modalMessage, setModalMessage] = React.useState('');
    const [learningChecklist, setLearningChecklist] = React.useState<LearningChecklist>({
        concentration: false, homework: false, review: false, tidying: false, customProblem: false, mindmap: false,
    });
    const [selectedEmotion, setSelectedEmotion] = React.useState('');
    const [emotionReason, setEmotionReason] = React.useState('');
    const [dailyThought, setDailyThought] = React.useState('');
    const [studyContent, setStudyContent] = React.useState('');
    const [feedback, setFeedback] = React.useState('');
    const [problems, setProblems] = React.useState<Question[]>([]);
    const [deepDive, setDeepDive] = React.useState<DeepDive | null>(null);
    const [goalSuggestion, setGoalSuggestion] = React.useState('');

    const [loadingFeedback, setLoadingFeedback] = React.useState(false);
    const [loadingProblems, setLoadingProblems] = React.useState(false);
    const [loadingDeepDive, setLoadingDeepDive] = React.useState(false);
    const [loadingGoal, setLoadingGoal] = React.useState(false);
    
    const [db, setDb] = React.useState<Firestore | null>(null);
    const [userId, setUserId] = React.useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // --- 정적 데이터 ---
    const checklistItems = [
        { id: 'concentration', label: '수업 집중' }, { id: 'homework', label: '숙제 완료' }, { id: 'review', label: '예습 또는 복습' },
        { id: 'tidying', label: '정리정돈' }, { id: 'customProblem', label: '나만의 문제 만들기' }, { id: 'mindmap', label: '배운 내용 마인드맵으로 그리기' },
    ];
    const emotions = [
        { id: 'good', label: '좋음', emoji: '😄' }, { id: 'ok', label: '괜찮음', emoji: '🙂' }, { id: 'soso', label: '그냥 그럼', emoji: '😐' },
        { id: 'sad', label: '슬픔', emoji: '😢' }, { id: 'tired', label: '피곤함', emoji: '😴' }, { id: 'angry', label: '화남', emoji: '😠' },
    ];
    
    // --- 환경 변수 안전하게 가져오기 ---
    const getEnvVar = React.useCallback((key: string): string | undefined => {
        try {
            // @ts-ignore Vite/Next.js 등 최신 번들러 환경 변수 접근
            if (typeof import.meta.env !== 'undefined') {
                // @ts-ignore
                return import.meta.env[key];
            }
        } catch (e) {
            // `import.meta`가 지원되지 않는 환경에서는 오류를 무시합니다.
        }
        return undefined;
    }, []);

    // --- Firebase 초기화 및 인증 ---
    React.useEffect(() => {
        const firebaseConfigStr = getEnvVar('VITE_FIREBASE_CONFIG') || (typeof window !== 'undefined' ? (window as any).__firebase_config : undefined);
        
        if (!firebaseConfigStr || firebaseConfigStr.trim() === '' || firebaseConfigStr.trim() === '{}') {
            const errorMessage = "Firebase 설정 정보를 찾을 수 없습니다.\nVercel 프로젝트의 'Settings > Environment Variables'에서 'VITE_FIREBASE_CONFIG' 변수가 올바르게 설정되었는지 확인해주세요.";
            setError(errorMessage);
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
                        const message = authError instanceof Error ? authError.message : String(authError);
                        console.error("Firebase 인증 오류:", message);
                        setError(`사용자 인증에 실패했습니다: ${message}`);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (initError) {
            const errorMessage = `Firebase 초기화 오류가 발생했습니다.\n'VITE_FIREBASE_CONFIG' 값이 올바른 JSON 형식인지 확인해주세요.\n\n오류: ${initError instanceof Error ? initError.message : String(initError)}`;
            setError(errorMessage);
            setIsAuthReady(true);
        }
    }, [getEnvVar]);

    // --- Firestore 데이터 로딩 ---
    React.useEffect(() => {
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
                setFeedback(data.aiFeedback || '');
                setProblems(data.aiProblems || []);
                setDeepDive(data.aiDeepDive || null);
                setGoalSuggestion(data.aiGoalSuggestion || '');
            }
        }, (err) => {
            console.error("Firestore 데이터 동기화 오류:", err);
            setError("데이터를 불러오는 중 오류가 발생했습니다.");
        });
        return () => unsubscribe();
    }, [isAuthReady, db, userId]);

    // --- Firestore에 데이터 저장 ---
    const saveData = async (dataToSave: { [key:string]: any }) => {
        if (!db || !userId) return;
        const appId = (typeof window !== 'undefined' ? (window as any).__app_id : undefined) || 'ai-learning-diary';
        const today = new Date().toISOString().slice(0, 10);
        const docRef = doc(db, "artifacts", appId, "users", userId, "daily_logs", today);

        try {
            await setDoc(docRef, { ...dataToSave, lastUpdated: serverTimestamp() }, { merge: true });
        } catch (err) {
            console.error("데이터 저장 오류:", err);
            setModalMessage("데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요.");
        }
    };
    
    // --- UI 이벤트 핸들러 ---
    const handleChecklistToggle = (id: string) => {
        const updated = { ...learningChecklist, [id]: !learningChecklist[id] };
        setLearningChecklist(updated);
        saveData({ learningChecklist: updated });
    };
    const handleEmotionSelect = (id: string) => {
        setSelectedEmotion(id);
        saveData({ selectedEmotion: id });
    };
    const handleBlurSave = (field: string, value: string) => {
        saveData({ [field]: value });
    };

    // --- Gemini API 호출 헬퍼 ---
    const getGeminiApiKey = React.useCallback((): string | null => {
        // 1. Vercel 환경 변수에서 직접 가져오기
        const apiKey = getEnvVar('VITE_GEMINI_API_KEY');
        if (typeof apiKey !== 'undefined') return apiKey;
        
        // 2. Canvas 환경일 경우, __firebase_config가 존재하면 빈 문자열("") 반환하여 자동 키 사용
        if (typeof window !== 'undefined' && typeof (window as any).__firebase_config !== 'undefined') return ""; 
        
        // 3. 둘 다 없으면 null 반환
        return null;
    }, [getEnvVar]);

    const callGeminiAPI = async (prompt: string, generationConfig?: object) => {
        const apiKey = getGeminiApiKey();
        if (apiKey === null) {
            setError("Gemini API 키가 설정되지 않았습니다.\nVercel 환경 변수에서 'VITE_GEMINI_API_KEY'를 설정해주세요.");
            return null;
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            ...(generationConfig && { generationConfig }),
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${await response.text()}`);
            }
            return await response.json();
        } catch (err) {
            console.error('Gemini API 호출 오류:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setModalMessage(`AI 모델 호출 중 오류가 발생했습니다.\n${errorMessage}`);
            return null;
        }
    };

    // --- AI 기능 핸들러 ---
    const handleGetFeedback = async () => {
        if (!selectedEmotion || !dailyThought.trim()) {
            setModalMessage('오늘의 감정과 생각을 모두 입력해주세요!');
            return;
        }
        setLoadingFeedback(true);
        setFeedback('');

        const checkedItems = checklistItems.filter(item => learningChecklist[item.id]).map(item => item.label).join(', ') || '없음';
        const emotionLabel = emotions.find(e => e.id === selectedEmotion)?.label || '';
        const prompt = `당신은 학생들의 성장을 돕는 다정하고 지지적인 AI 학습 튜터입니다. 학생이 작성한 하루 기록을 보고, 따뜻하고 격려가 되는 피드백을 한글로 3~4문장으로 작성해주세요. 학생의 상황을 긍정적으로 해석하고, 잘한 점을 칭찬하며, 앞으로 나아갈 방향을 부드럽게 제시해주세요.\n\n[학생 기록]\n- 학습 체크리스트: ${checkedItems}\n- 오늘의 감정: ${emotionLabel} (${emotionReason || '이유는 작성하지 않음'})\n- 오늘의 생각: ${dailyThought}\n\n[피드백]`;

        const result = await callGeminiAPI(prompt);
        if (result) {
            const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "피드백을 생성하지 못했어요. 다시 시도해주세요.";
            setFeedback(generatedText);
            await saveData({ aiFeedback: generatedText });
        }
        setLoadingFeedback(false);
    };

    const handleGetProblems = async () => {
        if (!studyContent.trim()) {
            setModalMessage('공부한 내용을 먼저 입력해주세요!');
            return;
        }
        setLoadingProblems(true);
        setProblems([]);

        const prompt = `당신은 학생의 학습을 돕는 AI 튜터입니다. 학생이 제공한 학습 내용을 바탕으로, 내용 이해도를 확인할 수 있는 단답형 또는 서술형 문제 3개와 그에 대한 정답을 만들어주세요. 반드시 JSON 형식으로 {"problems": [{"question": "문제 내용", "answer": "정답 내용"}]} 구조를 따라야 합니다. 만약 내용이 너무 짧아 문제 생성이 어렵다면, {"problems": []} 와 같이 빈 배열을 반환해주세요.\n\n[학습 내용]\n${studyContent}`;
        
        const result = await callGeminiAPI(prompt, { responseMimeType: "application/json" });
        if (result) {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    const newProblems = parsed.problems || [];
                    setProblems(newProblems);
                    if (newProblems.length > 0) {
                        await saveData({ aiProblems: newProblems });
                    } else {
                        setModalMessage("입력된 내용으로는 문제를 만들기 충분하지 않은 것 같아요. 좀 더 자세히 써주시겠어요?");
                    }
                } catch(e) {
                    console.error("JSON 파싱 오류:", e);
                    setProblems([{ question: 'AI 응답 형식이 올바르지 않아 문제를 표시할 수 없습니다.', answer: '오류' }]);
                }
            } else { 
                setProblems([{ question: 'AI로부터 유효한 문제 응답을 받지 못했습니다.', answer: '오류' }]);
            }
        }
        setLoadingProblems(false);
    };

    const handleGetDeepDive = async () => {
        if (!studyContent.trim()) {
            setModalMessage('공부한 내용을 먼저 입력해주세요!');
            return;
        }
        setLoadingDeepDive(true);
        setDeepDive(null);
        
        const prompt = `You are a helpful learning assistant. Based on the following learning topic, provide a short, easy-to-understand explanation of a related, more advanced concept, and suggest a single keyword for further searching in Korean. Your response must be in JSON format like {"concept": "...", "keyword": "..."}. If the topic is too vague, return {"concept": "Please provide more specific content.", "keyword": "N/A"}.\n\n[Learning Topic]:\n${studyContent}`;

        const result = await callGeminiAPI(prompt, { responseMimeType: "application/json" });
        if (result) {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
                try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed.keyword === "N/A") {
                        setModalMessage('심화 학습 주제를 찾기 위해 조금 더 자세한 내용이 필요해요!');
                    } else {
                        setDeepDive(parsed);
                        await saveData({ aiDeepDive: parsed });
                    }
                } catch (e) {
                    setModalMessage('AI 응답을 처리하는 데 실패했습니다.');
                }
            } else {
                 setModalMessage("AI로부터 유효한 심화학습 응답을 받지 못했습니다.");
            }
        }
        setLoadingDeepDive(false);
    };

    const handleGetGoalSuggestion = async () => {
        const diarySummary = `체크리스트: ${Object.entries(learningChecklist).filter(([, val]) => val).map(([key]) => checklistItems.find(item => item.id === key)?.label).join(', ') || '없음'}, 감정: ${emotions.find(e => e.id === selectedEmotion)?.label || '선택안함'}, 생각: ${dailyThought || '없음'}`;
        if (Object.values(learningChecklist).every(v => !v) && !selectedEmotion && !dailyThought.trim()) {
            setModalMessage('오늘의 활동을 하나 이상 기록해주세요!');
            return;
        }

        setLoadingGoal(true);
        setGoalSuggestion('');
        
        const prompt = `You are a supportive coach. Based on this student's learning diary, suggest one simple, actionable, and encouraging goal for tomorrow to help them improve. Respond in Korean with only the goal sentence.\n\n[Student's Diary]:\n${diarySummary}`;
        
        const result = await callGeminiAPI(prompt);
        if (result) {
            const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '내일의 목표를 생성하지 못했어요. 다시 시도해주세요.';
            setGoalSuggestion(generatedText);
            await saveData({ aiGoalSuggestion: generatedText });
        }
        setLoadingGoal(false);
    };


    // --- JSX 렌더링 ---
    if (error) {
        return (
            <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center">
                <div className="text-center bg-gray-800 p-8 rounded-lg max-w-lg shadow-2xl">
                    <h2 className="text-2xl font-bold text-red-500 mb-4">🚨 앱에 문제가 발생했습니다</h2>
                    <p className="text-gray-300 bg-gray-900 p-4 rounded-md whitespace-pre-wrap">{error}</p>
                    <p className="text-gray-400 mt-6">페이지를 새로고침하거나 환경 변수 설정을 다시 확인해주세요.</p>
                </div>
            </div>
        )
    }

    if (!isAuthReady) {
        return (
            <div className="bg-gray-900 min-h-screen text-white p-4 flex justify-center items-center">
                <Spinner />
                <p className="ml-4">앱을 안전하게 준비하고 있습니다...</p>
            </div>
        )
    }

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-white p-4 md:p-8 flex justify-center">
            {modalMessage && <Modal message={modalMessage} onClose={() => setModalMessage('')} />}
            <DebugInfo />
            <div className="w-full max-w-2xl pb-16">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">AI 학습 일기</h1>
                    <p className="text-gray-400 mt-2">AI 선생님과 함께 성장하는 하루를 기록해요.</p>
                </header>

                <main className="space-y-8">
                    {/* 기록 섹션 */}
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg space-y-6">
                        <div>
                            <h3 className="text-lg font-bold mb-3 text-purple-300">1. 오늘의 학습 루틴 체크리스트</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {checklistItems.map(item => (
                                    <ChecklistItem key={item.id} label={item.label} isChecked={!!learningChecklist[item.id]} onToggle={() => handleChecklistToggle(item.id)} />
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3 text-yellow-300">2. 오늘의 감정은?</h3>
                            <div className="flex gap-2 mb-3">
                                {emotions.map(emotion => (
                                    <EmotionButton key={emotion.id} label={emotion.label} emoji={emotion.emoji} isSelected={selectedEmotion === emotion.id} onClick={() => handleEmotionSelect(emotion.id)} />
                                ))}
                            </div>
                            <input type="text" className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition" placeholder="왜 그렇게 느꼈나요? (선택 사항)" value={emotionReason} onChange={e => setEmotionReason(e.target.value)} onBlur={e => handleBlurSave('emotionReason', e.target.value)} />
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3 text-pink-300">3. 오늘의 생각 한 줄</h3>
                            <textarea rows={3} className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-pink-500 focus:outline-none transition" placeholder="자유롭게 느낀 점을 기록해보세요." value={dailyThought} onChange={e => setDailyThought(e.target.value)} onBlur={e => handleBlurSave('dailyThought', e.target.value)} />
                        </div>
                        
                        <button onClick={handleGetFeedback} disabled={loadingFeedback} className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md transform hover:scale-105">
                            {loadingFeedback ? <Spinner /> : 'AI 선생님 피드백 받기'}
                        </button>
                    </div>

                    {/* 피드백 섹션 */}
                    {(feedback || loadingFeedback) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-pink-300">💌 AI 선생님의 피드백</h2>
                            <div className="bg-gray-700 p-4 rounded-md min-h-[100px] flex items-center justify-center">
                               {loadingFeedback ? <p className="text-gray-400">선생님께서 피드백을 작성하고 계세요...</p> : <p className="text-gray-300 whitespace-pre-wrap">{feedback}</p>}
                            </div>
                        </div>
                    )}

                    {/* 학습 내용 및 문제/심화학습 섹션 */}
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-lg font-bold mb-3 text-green-300">4. 오늘 배운 내용을 설명해 봅시다</h3>
                        <textarea id="study-content" rows={4} className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-green-500 focus:outline-none transition" placeholder="가장 기억에 남는 내용을 친구에게 설명하듯 써 보세요." value={studyContent} onChange={(e) => setStudyContent(e.target.value)} onBlur={e => handleBlurSave('studyContent', e.target.value)} />
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                             <button onClick={handleGetProblems} disabled={loadingProblems} className="w-full flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md transform hover:scale-105">
                                 {loadingProblems ? <Spinner /> : '📝 관련 문제 만들어줘!'}
                            </button>
                            <button onClick={handleGetDeepDive} disabled={loadingDeepDive} className="w-full flex justify-center items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md transform hover:scale-105">
                                 {loadingDeepDive ? <Spinner /> : '🚀 심화 학습 추천!'}
                            </button>
                        </div>
                    </div>
                    
                    {/* AI 추천 문제 섹션 */}
                    {(problems.length > 0 || loadingProblems) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-green-300">🧠 AI 선생님의 추천 문제</h2>
                            <div className="bg-gray-700 p-4 rounded-md min-h-[100px]">
                                {loadingProblems ? <div className="flex justify-center items-center h-full"><p className="text-gray-400">열심히 문제를 만들고 있어요...</p></div> : problems.map((p, i) => (
                                    <QuestionCard key={i} index={i} question={p.question} answer={p.answer} />
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* AI 심화 학습 섹션 */}
                    {(deepDive || loadingDeepDive) && (
                        <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                            <h2 className="text-xl font-bold mb-3 text-sky-300">🚀 AI의 심화 학습 추천</h2>
                            <div className="bg-gray-700 p-4 rounded-md min-h-[100px]">
                                {loadingDeepDive ? (
                                    <div className="flex justify-center items-center h-full"><p className="text-gray-400">더 깊은 지식을 탐색하고 있어요...</p></div>
                                 ) : deepDive && (
                                    <div>
                                        <p className="text-white">{deepDive.concept}</p>
                                        <p className="text-sm text-sky-300 mt-3">더 알아보기: <span className="font-semibold p-1 bg-sky-900 rounded">{deepDive.keyword}</span></p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 내일의 목표 제안 섹션 */}
                     <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-bold mb-3 text-amber-300">🎯 내일을 위한 AI 추천 목표</h2>
                        <div className="bg-gray-700 p-4 rounded-md min-h-[80px] flex items-center justify-center mb-4">
                            {loadingGoal ? (
                                <p className="text-gray-400">최고의 목표를 추천하기 위해 분석 중이에요...</p>
                             ) : goalSuggestion ? (
                                <p className="text-white text-center font-semibold">{goalSuggestion}</p>
                             ) : (
                                <p className="text-gray-400">오늘의 기록을 바탕으로 목표를 추천해드려요.</p>
                             )}
                        </div>
                        <button onClick={handleGetGoalSuggestion} disabled={loadingGoal} className="w-full flex justify-center items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md transform hover:scale-105">
                           {loadingGoal ? <Spinner /> : '✨ 내일의 목표 추천받기!'}
                        </button>
                    </div>

                </main>
            </div>
        </div>
    );
}
