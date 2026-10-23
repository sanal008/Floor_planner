import { useState } from 'react'
import Home from './pages/Home.jsx'
import CustomPlacement from './pages/CustomPlacement.jsx'
import RealtimePlacement from './pages/RealtimePlacement.jsx'
import FloorPlan3D from './pages/FloorPlan3D.jsx'

export default function App() {
  const [view, setView] = useState('home')

  return (
    <>
      {view === 'home' && <Home onSelect={setView} />}
      {view === 'custom' && <CustomPlacement onBack={() => setView('home')} />}
      {view === 'realtime' && <RealtimePlacement onBack={() => setView('home')} />}
      {view === 'floorplan' && <FloorPlan3D onBack={() => setView('home')} />}
    </>
  )
}