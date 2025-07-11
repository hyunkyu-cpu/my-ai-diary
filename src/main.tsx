import React from 'react'
import ReactDOM from 'react-dom/client'
import TeacherApp from './teacher/TeacherApp'
import './index.css' // 이 줄이 반드시 있어야 합니다!

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TeacherApp />
  </React.StrictMode>,
)
