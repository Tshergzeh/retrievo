import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import DocumentUploader from './pages/DocumentUploader';
import NotFound from './pages/NotFound';

function App() {
  return (
    <BrowserRouter>
        <nav style={{ padding: '1rem', background: '#eee' }}>
            <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
            <Link to="/about">About</Link>
            <Link to="/upload">Upload</Link>
        </nav>
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/upload" element={<DocumentUploader />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
    </BrowserRouter>
  );
}

export default App;
