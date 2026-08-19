import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import Dashboard from './pages/Dashboard'
import MatrixPage from './pages/MatrixPage'
import HotGrid from './pages/HotGrid'
import TicketBuilder from './pages/TicketBuilder'
import History from './pages/History'
import Analysis from './pages/Analysis'
import AddResult from './pages/AddResult'
import NumberInspector from './pages/NumberInspector'
import PredictPage from './pages/PredictPage'
import AutoSequence from './pages/AutoSequence'
import BeamConsensus from './pages/BeamConsensus'
import PBDashboard from './pages/powerball/PBDashboard'
import PBPredict from './pages/powerball/PBPredict'
import PBHistory from './pages/powerball/PBHistory'
import PBAddResult from './pages/powerball/PBAddResult'
import PBMatrixPage from './pages/powerball/PBMatrixPage'
import PBBallMatrixPage from './pages/powerball/PBBallMatrixPage'
import PBBeamPredict from './pages/powerball/PBBeamPredict'
import LottoBeamPredict from './pages/LottoBeamPredict'
import MMBeamPredict from './pages/megamillions/MMBeamPredict'
import MMDashboard from './pages/megamillions/MMDashboard'
import MMPredict from './pages/megamillions/MMPredict'
import MMHistory from './pages/megamillions/MMHistory'
import MMAddResult from './pages/megamillions/MMAddResult'
import MMMatrixPage from './pages/megamillions/MMMatrixPage'
import MMBallMatrixPage from './pages/megamillions/MMBallMatrixPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="app-main">
        <Routes>
          {/* Home — game selector */}
          <Route path="/"  element={<HomePage />} />
          {/* LottoLens routes */}
          <Route path="/lotto"           element={<Dashboard />} />
          <Route path="/lotto/auto"      element={<AutoSequence />} />
          <Route path="/lotto/predict"   element={<PredictPage />} />
          <Route path="/lotto/matrix"    element={<MatrixPage />} />
          <Route path="/lotto/hotgrid"   element={<HotGrid />} />
          <Route path="/lotto/ticket"    element={<TicketBuilder />} />
          <Route path="/lotto/history"   element={<History />} />
          <Route path="/lotto/analysis"  element={<Analysis />} />
          <Route path="/lotto/add"       element={<AddResult />} />
          <Route path="/lotto/inspector" element={<NumberInspector />} />
          <Route path="/lotto/beam"         element={<BeamConsensus />} />
          <Route path="/lotto/beam-predict"  element={<LottoBeamPredict />} />
          {/* Powerball routes */}
          <Route path="/powerball"          element={<PBDashboard />} />
          <Route path="/powerball/predict"    element={<PBPredict />} />
          <Route path="/powerball/beam-predict" element={<PBBeamPredict />} />
          <Route path="/powerball/matrix"   element={<PBMatrixPage />} />
          <Route path="/powerball/pb-matrix" element={<PBBallMatrixPage />} />
          <Route path="/powerball/history"  element={<PBHistory />} />
          <Route path="/powerball/add"      element={<PBAddResult />} />
          {/* Mega Millions routes */}
          <Route path="/megamillions"           element={<MMDashboard />} />
          <Route path="/megamillions/predict"      element={<MMPredict />} />
          <Route path="/megamillions/beam-predict" element={<MMBeamPredict />} />
          <Route path="/megamillions/matrix"    element={<MMMatrixPage />} />
          <Route path="/megamillions/mb-matrix" element={<MMBallMatrixPage />} />
          <Route path="/megamillions/history"   element={<MMHistory />} />
          <Route path="/megamillions/add"       element={<MMAddResult />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}