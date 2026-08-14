import { NavLink, useLocation } from 'react-router-dom'
import './Navbar.css'

export default function Navbar() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isPB   = location.pathname.startsWith('/powerball')
  const isMM   = location.pathname.startsWith('/megamillions')
  const isLotto = location.pathname.startsWith('/lotto')

  return (
    <nav className="navbar">
      {/* Brand / Home link */}
      <NavLink to="/" className="navbar-brand">
        <span className="brand-icon">{isPB ? '🔴' : isMM ? '🟡' : isLotto ? '🎱' : '🏠'}</span>
        <span className="brand-name">{isPB ? 'PowerLens' : isMM ? 'MegaLens' : isLotto ? 'LottoLens' : 'LensHub'}</span>
      </NavLink>

      {/* Game switcher — hidden on home */}
      {!isHome && (
        <div className="navbar-switcher">
          <NavLink to="/lotto" className={`switcher-btn ${isLotto ? 'switcher-active' : ''}`}>
            🎱 LottoLens
          </NavLink>
          <NavLink to="/powerball" className={`switcher-btn ${isPB ? 'switcher-active switcher-active-pb' : ''}`}>
            🔴 Powerball
          </NavLink>
          <NavLink to="/megamillions" className={`switcher-btn ${isMM ? 'switcher-active switcher-active-mm' : ''}`}>
            🟡 Mega Millions
          </NavLink>
        </div>
      )}

      {/* Nav links */}
      <div className="navbar-links">
        {isHome && (
          <span className="nav-link nav-link-home">Select a game below ↓</span>
        )}
        {isLotto && (
          <>
            <NavLink to="/lotto" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
            <NavLink to="/lotto/auto" className={({ isActive }) => isActive ? 'nav-link active nav-link-predict' : 'nav-link nav-link-predict'}>🧠 Auto Next</NavLink>
            <NavLink to="/lotto/predict" className={({ isActive }) => isActive ? 'nav-link active nav-link-predict' : 'nav-link nav-link-predict'}>Predict</NavLink>
            <NavLink to="/lotto/matrix" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Matrix</NavLink>
            <NavLink to="/lotto/hotgrid" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>🔥 Hot Grid</NavLink>
            <NavLink to="/lotto/ticket" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Ticket</NavLink>
            <NavLink to="/lotto/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>History</NavLink>
            <NavLink to="/lotto/analysis" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Analysis</NavLink>
            <NavLink to="/lotto/inspector" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>🔍 Inspector</NavLink>
            <NavLink to="/lotto/beam" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>⚡ Beam</NavLink>
            <NavLink to="/lotto/add" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>+ Add</NavLink>
          </>
        )}
        {isPB && (
          <>
            <NavLink to="/powerball" end className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>Dashboard</NavLink>
            <NavLink to="/powerball/predict" className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>🔮 Predict</NavLink>
            <NavLink to="/powerball/matrix" className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>🗂 Matrix</NavLink>
            <NavLink to="/powerball/pb-matrix" className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>🔴 PB Matrix</NavLink>
            <NavLink to="/powerball/history" className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>History</NavLink>
            <NavLink to="/powerball/add" className={({ isActive }) => isActive ? 'nav-link active nav-link-pb' : 'nav-link nav-link-pb'}>+ Add</NavLink>
          </>
        )}
        {isMM && (
          <>
            <NavLink to="/megamillions" end className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>Dashboard</NavLink>
            <NavLink to="/megamillions/predict" className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>🔮 Predict</NavLink>
            <NavLink to="/megamillions/matrix" className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>🗂 Matrix</NavLink>
            <NavLink to="/megamillions/mb-matrix" className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>🟡 MB Matrix</NavLink>
            <NavLink to="/megamillions/history" className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>History</NavLink>
            <NavLink to="/megamillions/add" className={({ isActive }) => isActive ? 'nav-link active nav-link-mm' : 'nav-link nav-link-mm'}>+ Add</NavLink>
          </>
        )}
      </div>
    </nav>
  )
}
