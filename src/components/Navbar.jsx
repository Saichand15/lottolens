import { NavLink } from 'react-router-dom'
import './Navbar.css'

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-icon">🎱</span>
        <span className="brand-name">LottoLens</span>
      </div>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Dashboard
        </NavLink>
        <NavLink to="/predict" className={({ isActive }) => isActive ? 'nav-link active nav-link-predict' : 'nav-link nav-link-predict'}>
           Predict
        </NavLink>
        <NavLink to="/matrix" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Matrix
        </NavLink>
        <NavLink to="/ticket" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Ticket Builder
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          History
        </NavLink>
        <NavLink to="/analysis" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Analysis
        </NavLink>
        <NavLink to="/inspector" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          🔍 Inspector
        </NavLink>
        <NavLink to="/add" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          + Add Result
        </NavLink>
      </div>
    </nav>
  )
}
