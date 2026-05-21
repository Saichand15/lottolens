import { useNavigate } from 'react-router-dom'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1 className="home-title">Welcome to <span>LensHub</span></h1>
        <p className="home-sub">Choose a lottery game to start analysing, predicting & tracking results.</p>
      </div>

      <div className="home-cards">
        {/* LottoLens */}
        <div className="home-card home-card-lotto" onClick={() => navigate('/lotto')}>
          <div className="home-card-glow home-card-glow-lotto" />
          <div className="home-card-icon">🎱</div>
          <div className="home-card-body">
            <h2 className="home-card-title">LottoLens</h2>
            <p className="home-card-desc">5/45 lottery — Matrix analysis, laser predictions, ticket builder & more.</p>
            <div className="home-card-tags">
              <span className="home-tag">5 balls</span>
              <span className="home-tag">1–45</span>
              <span className="home-tag">Matrix</span>
              <span className="home-tag">Predictions</span>
            </div>
          </div>
          <div className="home-card-arrow">→</div>
        </div>

        {/* PowerLens */}
        <div className="home-card home-card-pb" onClick={() => navigate('/powerball')}>
          <div className="home-card-glow home-card-glow-pb" />
          <div className="home-card-icon">🔴</div>
          <div className="home-card-body">
            <h2 className="home-card-title">PowerLens</h2>
            <p className="home-card-desc">US Powerball — 5/69 + Powerball 1/26. Transition analysis & draw history.</p>
            <div className="home-card-tags">
              <span className="home-tag home-tag-pb">5 + PB</span>
              <span className="home-tag home-tag-pb">1–69</span>
              <span className="home-tag home-tag-pb">Powerball</span>
              <span className="home-tag home-tag-pb">Predictions</span>
            </div>
          </div>
          <div className="home-card-arrow home-card-arrow-pb">→</div>
        </div>

        <div className="home-card home-card-mm" onClick={() => navigate('/megamillions')}>
          <div className="home-card-glow home-card-glow-mm" />
          <div className="home-card-icon">🟡</div>
          <div className="home-card-body">
            <h2 className="home-card-title">MegaLens</h2>
            <p className="home-card-desc">US Mega Millions — 5/70 + Mega Ball 1/25. Matrix analysis, prediction, history, and manual sync.</p>
            <div className="home-card-tags">
              <span className="home-tag home-tag-mm">5 + MB</span>
              <span className="home-tag home-tag-mm">1–70</span>
              <span className="home-tag home-tag-mm">Mega Ball</span>
              <span className="home-tag home-tag-mm">History</span>
            </div>
          </div>
          <div className="home-card-arrow home-card-arrow-mm">→</div>
        </div>
      </div>

      <p className="home-footer">⚠ For entertainment & pattern analysis only. Lottery outcomes are random.</p>
    </div>
  )
}
