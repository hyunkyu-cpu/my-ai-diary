import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Download, Upload, BarChart3, Timer, Play, Square, QrCode, FileText, Users, BookOpenCheck } from './icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from './recharts';

// ---------------------------------------------
// ON-채움: 학력증진 실천사례 시연용 단일 파일 React App
// - 초3 책임교육학년제, 온평가/온채움/온한글/온생각 흐름에 맞춘 시연 기능
// - CODEX, 코드 페스티벌, 포트폴리오 발표 등에 바로 붙여 넣기 가능
// ---------------------------------------------

const seedStudents = [
  { id: 1, name: '김가온', grade: 3, readingWPM: 65, numeracy: 6, writingNote: '받침 혼동, 문장 부호 지도 필요' },
  { id: 2, name: '박다음', grade: 3, readingWPM: 92, numeracy: 8, writingNote: '문장 성분 이해 양호' },
  { id: 3, name: '이바름', grade: 3, readingWPM: 48, numeracy: 5, writingNote: '이중모음, 받아쓰기 보정 필요' },
];

const demoGrowth = [
  { month: '3월', reading: 55, numeracy: 5 },
  { month: '5월', reading: 68, numeracy: 6 },
  { month: '7월', reading: 78, numeracy: 7 },
  { month: '9월', reading: 90, numeracy: 8 },
  { month: '11월', reading: 100, numeracy: 9 },
];

function Section({ title, icon, right }: { title: string; icon: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div>{right}</div>
    </div>
  );
}

function DownloadJSON({ data, filename = 'on-chaeum-data.json' }: { data: unknown; filename?: string }) {
  const onClick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" onClick={onClick} className="gap-2">
      <Download size={16} /> 데이터 내보내기
    </Button>
  );
}

function UploadJSON({ onLoad }: { onLoad: (d: any) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        onLoad(parsed);
      } catch (e) {
        alert('JSON 파싱 실패: 올바른 파일인지 확인하세요.');
      }
    };
    reader.readAsText(file);
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="application/json" hidden onChange={handle} />
      <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}>
        <Upload size={16} /> 데이터 불러오기
      </Button>
    </>
  );
}

function ReadingFluency({ onSave }: { onSave: (wpm: number) => void }) {
  const [textWords, setTextWords] = useState(120);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [wpm, setWpm] = useState<number | null>(null);

  const start = () => {
    setSeconds(0);
    setWpm(null);
    setRunning(true);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    const minutes = Math.max(seconds / 60, 0.01);
    const calc = Math.round(textWords / minutes);
    setWpm(calc);
  };

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 space-y-4">
        <Section title="읽기 유창성(분당어절, WPM)" icon={<Timer className="w-5 h-5" />} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>읽은 어절 수(대략)</Label>
            <Input type="number" value={textWords} onChange={(e) => setTextWords(Number(e.target.value || 0))} />
          </div>
          <div>
            <Label>측정 시간(초)</Label>
            <Input readOnly value={seconds} />
          </div>
          <div className="flex items-end gap-2">
            {!running ? (
              <Button onClick={start} className="gap-2"><Play size={16} /> 시작</Button>
            ) : (
              <Button variant="destructive" onClick={stop} className="gap-2"><Square size={16} /> 정지</Button>
            )}
            {wpm && (
              <Badge variant="secondary" className="text-base">WPM: {wpm}</Badge>
            )}
          </div>
        </div>
        {wpm && (
          <div className="flex justify-end">
            <Button onClick={() => onSave(wpm)}>
              결과 저장
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickNumeracy({ onSave }: { onSave: (n: number) => void }) {
  const [q, setQ] = useState<{ id: number; a: number; b: number; op: string; res: number; }[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  useEffect(() => {
    const make = () => {
      const list = [] as { id: number; a: number; b: number; op: string; res: number; }[];
      for (let i = 0; i < 10; i++) {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        const op = ['+', '-', '×'][Math.floor(Math.random() * 3)];
        const res = op === '+' ? a + b : op === '-' ? a - b : a * b;
        list.push({ id: i, a, b, op, res });
      }
      return list;
    };
    setQ(make());
  }, []);

  const correct = useMemo(() => q.filter((it) => String(answers[it.id] ?? '') === String(it.res)).length, [answers, q]);

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 space-y-4">
        <Section title="간편 수리력 체크(10문항)" icon={<BarChart3 className="w-5 h-5" />} right={<Badge>{correct}/10 정답</Badge>} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {q.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <span className="min-w-[84px] text-sm">{it.a} {it.op} {it.b} =</span>
              <Input
                value={answers[it.id] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [it.id]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => onSave(correct)}>결과 저장</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportBuilder({ students, className, notes }: { students: typeof seedStudents; className: string; notes: string }) {
  const [markdown, setMarkdown] = useState('');
  useEffect(() => {
    const avgW = Math.round(students.reduce((s, v) => s + (v.readingWPM ?? 0), 0) / students.length);
    const avgN = Math.round(students.reduce((s, v) => s + (v.numeracy ?? 0), 0) / students.length);
    const lines = [] as string[];
    lines.push(`# ON-채움 학력증진 성과 요약`);
    lines.push(`- 학급: ${className}`);
    lines.push(`- 평균 읽기 유창성(WPM): ${avgW}`);
    lines.push(`- 평균 수리력(10문항 정답): ${avgN}`);
    lines.push(`- 개별 학생 요약:`);
    students.forEach((st) => {
      lines.push(`  - ${st.name}: WPM ${st.readingWPM ?? '-'}, 수리 ${st.numeracy ?? '-'}/10, 메모: ${st.writingNote ?? '-'}`);
    });
    if (notes?.length) {
      lines.push(`\n## 지도 메모\n` + notes);
    }
    setMarkdown(lines.join('\n'));
  }, [students, className, notes]);

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    alert('보고서 텍스트가 복사되었습니다. 문서에 붙여 넣으세요.');
  };

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ON-채움-성과요약.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 space-y-4">
        <Section title="보고서 생성(복사/내려받기)" icon={<FileText className="w-5 h-5" />} right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={copy}>복사</Button>
            <Button onClick={download}>.md 저장</Button>
          </div>
        } />
        <pre className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap leading-6">{markdown}</pre>
      </CardContent>
    </Card>
  );
}

function GrowthChart() {
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 space-y-4">
        <Section title="성장 추이" icon={<BarChart3 className="w-5 h-5" />} />
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={demoGrowth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="reading" name="읽기(WPM)" strokeWidth={2} dot />
              <Line type="monotone" dataKey="numeracy" name="수리(정답수)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function App() {
  const [students, setStudents] = useState(seedStudents);
  const [klass, setKlass] = useState('3학년 1반');
  const [selected, setSelected] = useState(1);
  const [teacherMemo, setTeacherMemo] = useState('');
  const [classCode, setClassCode] = useState('');

  const sel = useMemo(() => students.find((s) => s.id === selected), [students, selected]);

  const saveSel = (patch: Partial<typeof seedStudents[number]>) => {
    setStudents((prev) => prev.map((s) => (s.id === (sel?.id ?? 0) ? { ...s, ...patch } : s)));
  };

  const addStudent = () => {
    const name = prompt('학생 이름을 입력하세요');
    if (!name) return;
    const id = Math.max(...students.map((s) => s.id)) + 1;
    setStudents([...students, { id, name, grade: 3 }]);
    setSelected(id);
  };

  const dataBundle = { klass, students, teacherMemo };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-base">ON-채움</Badge>
          <h1 className="text-2xl font-bold">학력증진 실천사례용 앱</h1>
        </div>
        <div className="flex gap-2">
          <UploadJSON onLoad={(d) => { setKlass(d.klass ?? klass); setStudents(d.students ?? students); setTeacherMemo(d.teacherMemo ?? ''); }} />
          <DownloadJSON data={dataBundle} />
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">대시보드</TabsTrigger>
          <TabsTrigger value="screen">진단/보정</TabsTrigger>
          <TabsTrigger value="ontools">온 시스템</TabsTrigger>
          <TabsTrigger value="report">보고서</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <Section title="학급 설정" icon={<Users className="w-5 h-5" />} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>학급명</Label>
                  <Input value={klass} onChange={(e) => setKlass(e.target.value)} />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={addStudent}>학생 추가</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Section title="학생 목록" icon={<BookOpenCheck className="w-5 h-5" />} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {students.map((s) => (
                  <button key={s.id} onClick={() => setSelected(s.id)} className={`text-left p-3 rounded-xl border hover:shadow-sm ${selected===s.id?"border-primary":"border-muted"}`}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-muted-foreground">WPM {s.readingWPM ?? '-'} · 수리 {s.numeracy ?? '-'}/10</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <GrowthChart />
        </TabsContent>

        <TabsContent value="screen" className="space-y-4">
          {sel && (
            <Card className="border-none shadow-sm">
              <CardContent className="p-4 space-y-3">
                <Section title={`개별 진단·보정: ${sel.name}`} icon={<FileText className="w-5 h-5" />} />
                <ReadingFluency onSave={(w) => saveSel({ readingWPM: w })} />
                <QuickNumeracy onSave={(n) => saveSel({ numeracy: n })} />
                <div className="space-y-2">
                  <Label>쓰기/관찰 메모</Label>
                  <Input value={sel.writingNote ?? ''} onChange={(e) => saveSel({ writingNote: e.target.value })} placeholder="예: 이중모음 구분, 띄어쓰기 보정" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-sm">
            <CardContent className="p-4 space-y-2">
              <Label>학급 메모(지도 전략, 협의회 논의사항 등)</Label>
              <Input value={teacherMemo} onChange={(e) => setTeacherMemo(e.target.value)} placeholder="예: 초3 책임교육학년 집중 보정 주간 운영" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ontools" className="space-y-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Section title="온평가 연동(모의)" icon={<QrCode className="w-5 h-5" />} />
              <p className="text-sm text-muted-foreground">실계정 없이 시연하는 모의 화면입니다. 실제 환경에서는 온평가에서 회차 생성 후 학급코드/QR로 입장합니다.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>학급코드</Label>
                  <Input value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="예: A1B2C3" />
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline">QR 스캔 안내</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Section title="온채움·온한글·온생각 활용 기록" icon={<FileText className="w-5 h-5" />} />
              <p className="text-sm text-muted-foreground">활용한 플랫폼과 보정학습 내역을 간단히 기록해 증빙으로 활용하세요.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input placeholder="예: 온한글 - 받침 보정 6차시" />
                <Input placeholder="예: 온생각 - 사고도구어 2레벨 4세트" />
                <Input placeholder="예: 온채움 - 저해요인 진단 완료" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <ReportBuilder students={students} className={klass} notes={teacherMemo} />
        </TabsContent>
      </Tabs>

      <footer className="text-xs text-muted-foreground pt-4 border-t">© ON-채움 · 시연용. 실제 학생 정보를 입력하지 마세요.</footer>
    </div>
  );
}
