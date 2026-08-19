import { useState, useEffect } from 'react'
import { fetchAllMMDraws } from '../../lib/supabase'
import BeamPredictPage from '../../components/BeamPredictPage'

export default function MMBeamPredict() {
  const [draws,   setDraws]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllMMDraws()
      .then(setDraws)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', height:'60vh', color:'#aaa' }}>
      <div style={{ width:24, height:24, border:'3px solid #333', borderTopColor:'#f5c518', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
      Loading…
    </div>
  )
  if (!draws.length) return <div style={{ padding:40, color:'#888' }}>No draw data found.</div>

  return (
    <BeamPredictPage
      draws={draws}
      maxNumber={70}
      bonusField="mb"
      maxBonus={25}
      bonusLabel="MB"
      gameName="Mega Millions"
      accent="#f5c518"
    />
  )
}
