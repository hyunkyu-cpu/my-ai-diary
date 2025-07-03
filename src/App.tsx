<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 학습 일기</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
    </style>
</head>
<body class="bg-gray-900">
    <div id="root"></div>

    <!-- Firebase 및 앱 설정을 위한 Mock 데이터 -->
    <script>
        // 실제 환경에서는 이 값들이 동적으로 제공됩니다.
        window.__firebase_config = JSON.stringify({
            apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            authDomain: "your-project-id.firebaseapp.com",
            projectId: "your-project-id",
            storageBucket: "your-project-id.appspot.com",
            messagingSenderId: "1234567890",
            appId: "1:1234567890:web:abcdef1234567890"
        });
        window.__app_id = 'ai-learning-diary';
        // window.__initial_auth_token = 'your-initial-auth-token'; // 필요시 주석 해제
    </script>

    <script type="text/babel" data-type="module">
        // Firebase 모듈을 ES 모듈 방식으로 가져옵니다.
        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
        import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
        import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

        const { useState, useEffect, useCallback } = React;

        // --- 타입 정의 (TypeScript 구문은 주석 처리) ---
        // interface Question { question: string; simple_answer: string; explanation: string; }
        // interface UserAnswers { [key: number]: string; }
        // interface RevealedAnswers { [key: number]: boolean; }
        // interface LearningChecklist { [key:string]: boolean; }
        // interface CoachingReport { summary: string; strength: string; tip: string; comment: string; }
        // interface StoryData { title: string; story: string; summary: string; questions: string[]; }

        // --- 헬퍼 및 UI 컴포넌트 ---
        const Spinner = () => <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>;

        const Modal = ({ message, onClose }) => (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
                <div className="bg-gray-800 rounded-lg p-8 shadow-2xl text-center max-w-sm mx-auto">
                    <p className="text-white mb-6 whitespace-pre-wrap">{message}</p>
                    <button onClick={onClose} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-transform transform hover:scale-105">확인</button>
                </div>
            </div>
        );

        const ChecklistItem = ({ label, isChecked, onToggle }) => (
            <div className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 ${isChecked ? 'bg-purple-600 shadow-lg' : 'bg-gray-700 hover:bg-gray-600'}`} onClick={onToggle}>
                <div className="w-5 h-5 border-2 border-white/50 rounded-sm flex items-center justify-center mr-3 flex-shrink-0">{isChecked && <span className="text-white">✔</span>}</div>
                <span className={`font-medium ${isChecked ? 'text-white' : 'text-gray-300'}`}>{label}</span>
            </div>
        );

        const EmotionButton = ({ label, emoji, isSelected, onClick }) => (
            <button onClick={onClick} className={`flex-1 text-center py-3 px-2 rounded-lg transition-all duration-300 border-2 ${isSelected ? 'bg-yellow-500 border-yellow-400 scale-110 shadow-lg' : 'bg-gray-700 border-transparent hover:bg-gray-600'}`}>
                <span className="text-2xl">{emoji}</span>
                <span className={`block text-xs mt-1 font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{label}</span>
            </button>
        );

        const InteractiveQuestionCard = ({ question, simple_answer, explanation, index, userAnswer, onAnswerChange, onCheckAnswer, isRevealed }) => (
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

        const StudentFeedbackCard = ({ report }) => (
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

        const StoryCard = ({ data }) => (
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
        function App() {
            // --- 상태 관리 ---
            const [modalMessage, setModalMessage] = useState('');
            const [learningChecklist, setLearningChecklist] = useState({});
            const [selectedEmotion, setSelectedEmotion] = useState('');
            const [emotionReason, setEmotionReason] = useState('');
            const [dailyThought, setDailyThought] = useState('');
            const [lifeFeedback, setLifeFeedback] = useState('');
            const [studyContent, setStudyContent] = useState('');
            const [coachingReport, setCoachingReport] = useState(null);
            const [problems, setProblems] = useState([]);
            const [userAnswers, setUserAnswers] = useState({});
            const [revealedAnswers, setRevealedAnswers] = useState({});
            const [storyData, setStoryData] = useState(null);
            const [loadingStates, setLoadingStates] = useState({
                lifeFeedback: false, analysis: false, problems: false, story: false, sendingDiary: false,
            });
            const [db, setDb] = useState(null);
            const [userId, setUserId] = useState(null);
            const [studentName, setStudentName] = useState('');
            const [isAuthReady, setIsAuthReady] = useState(false);
            const [error, setError] = useState(null);
            const [tempName, setTempName] = useState('');

            // --- 정적 데이터 ---
            const checklistItems = [
                { id: 'concentration', label: '수업 집중' }, { id: 'homework', label: '숙제 완료' }, { id: 'review', label: '예습 또는 복습' },
                { id: 'tidying', label: '정리정돈' }, { id: 'customProblem', label: '나만의 문제 만들기' }, { id: 'mindmap', label: '배운 내용 마인드맵으로 그리기' },
            ];
            const emotions = [
                { id: 'good', label: '좋음', emoji: '😄' }, { id: 'ok', label: '괜찮음', emoji: '🙂' }, { id: 'soso', label: '그냥 그럼', emoji: '😐' },
                { id: 'sad', label: '슬픔', emoji: '😢' }, { id: 'tired', label: '피곤함', emoji: '😴' }, { id: 'angry', label: '화남', emoji: '😠' },
            ];
            
            // --- Firebase 초기화 ---
            useEffect(() => {
                try {
                    const firebaseConfig = JSON.parse(window.__firebase_config);
                    const app = initializeApp(firebaseConfig);
                    const auth = getAuth(app);
                    const firestore = getFirestore(app);
                    setDb(firestore);
                    const unsubscribe = onAuthStateChanged(auth, async (user) => {
                        if (user) {
                            setUserId(user.uid);
                        } else {
                            try {
                                const initialAuthToken = window.__initial_auth_token;
                                if (initialAuthToken) {
                                    await signInWithCustomToken(auth, initialAuthToken);
                                } else {
                                    await signInAnonymously(auth);
                                }
                            } catch (authError) {
                                setError(`사용자 인증에 실패했습니다: ${authError.message}`);
                            }
                        }
                        setIsAuthReady(true);
                    });
                    return () => unsubscribe();
                } catch (initError) {
                    setError(`Firebase 초기화 오류가 발생했습니다: ${initError.message}`);
                    setIsAuthReady(true);
                }
            }, []);

            // --- 데이터 로딩 및 저장 ---
            useEffect(() => {
                if (!isAuthReady || !db || !userId) return;
                const appId = window.__app_id || 'ai-learning-diary';
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

            const saveData = useCallback(async (dataToSave) => {
                if (!db || !userId) return;
                const appId = window.__app_id || 'ai-learning-diary';
                const today = new Date().toISOString().slice(0, 10);
                const docRef = doc(db, "artifacts", appId, "users", userId, "daily_logs", today);
                try {
                    await setDoc(docRef, { ...dataToSave, lastUpdated: serverTimestamp() }, { merge: true });
                } catch (err) {
                    setModalMessage("데이터 저장에 실패했습니다.");
                }
            }, [db, userId]);

            // --- UI 이벤트 핸들러 ---
            const handleChecklistToggle = (id) => {
                const updated = { ...learningChecklist, [id]: !learningChecklist[id] };
                setLearningChecklist(updated);
                saveData({ learningChecklist: updated });
            };
            
            const handleUserAnswerChange = (index, value) => {
                const updated = { ...userAnswers, [index]: value };
                setUserAnswers(updated);
                saveData({ userAnswers: updated });
            };

            const handleCheckAnswer = (index) => {
                const updated = { ...revealedAnswers, [index]: true };
                setRevealedAnswers(updated);
                saveData({ revealedAnswers: updated });
            };

            // --- Gemini API 호출 (Mock) ---
            const callGeminiAPI = async (prompt, model = 'gemini-2.0-flash', generationConfig) => {
                 setModalMessage("데모 버전에서는 AI 기능을 사용할 수 없습니다.");
                 return null;
            };
            
            const setLoading = (key, value) => {
                setLoadingStates(prev => ({ ...prev, [key]: value }));
            };

            // --- AI 기능 핸들러 (호출 부분만 남김) ---
            const handleGetLifeFeedback = async () => { setModalMessage("데모 버전에서는 AI 기능을 사용할 수 없습니다."); };
            const handleGetWritingCoaching = async () => { setModalMessage("데모 버전에서는 AI 기능을 사용할 수 없습니다."); };
            const handleGetProblems = async () => { setModalMessage("데모 버전에서는 AI 기능을 사용할 수 없습니다."); };
            const handleGetStory = async () => { setModalMessage("데모 버전에서는 AI 기능을 사용할 수 없습니다."); };

            // --- 선생님께 일기 보내기 함수 ---
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

        const container = document.getElementById('root');
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
    </script>
</body>
</html>
