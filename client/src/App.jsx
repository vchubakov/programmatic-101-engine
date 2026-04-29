import { Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Dashboard from './pages/Dashboard.jsx';
import News from './pages/News.jsx';
import Education from './pages/Education.jsx';
import Personal from './pages/Personal.jsx';
import Memes from './pages/Memes.jsx';
import Schedule from './pages/Schedule.jsx';
import Settings from './pages/Settings.jsx';
import ReviewQueue from './pages/ReviewQueue.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/news" element={<News />} />
          <Route path="/education" element={<Education />} />
          <Route path="/personal" element={<Personal />} />
          <Route path="/memes" element={<Memes />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
