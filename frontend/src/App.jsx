import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

import Home from './pages/Home';
import AdminPanel from './pages/AdminPanel';
import ViewerPanel from './pages/ViewerPanel';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/:id" element={<AdminPanel />} />
        <Route path="/sorteio/:id" element={<ViewerPanel />} />
      </Routes>
    </BrowserRouter>
  );
}