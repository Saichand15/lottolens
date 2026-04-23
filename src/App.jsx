import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import MatrixPage from './pages/MatrixPage'
import TicketBuilder from './pages/TicketBuilder'
import History from './pages/History'
import Analysis from './pages/Analysis'
import AddResult from './pages/AddResult'
import NumberInspector from './pages/NumberInspector'
import PredictPage from './pages/PredictPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/predict"    element={<PredictPage />} />
          <Route path="/matrix"     element={<MatrixPage />} />
          <Route path="/ticket"     element={<TicketBuilder />} />
          <Route path="/history"    element={<History />} />
          <Route path="/analysis"   element={<Analysis />} />
          <Route path="/add"        element={<AddResult />} />
          <Route path="/inspector"  element={<NumberInspector />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}