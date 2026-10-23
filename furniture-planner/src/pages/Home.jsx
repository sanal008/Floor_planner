import ThreeBackground from '../components/ThreeBackground.jsx'

export default function Home({ onSelect }) {
  return (
    <main className="home">
      <ThreeBackground />

      <nav className="nav">
        <div className="brand">
          <span className="brand-mark">F</span>
          <span className="brand-name">FurniturePlanner</span>
        </div>
        <div className="nav-links">
          <span>Home</span>
          <span>About</span>
          <span>Contact</span>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">3D Interior Design Studio</p>
        <h1 className="title">
          Design your dream
          <br />
          <span className="gradient-text">space, your way</span>
        </h1>
        <p className="subtitle">
          Place furniture virtually in real time or precisely plan a custom
          layout — all inside an immersive 3D environment.
        </p>
      </section>

      <section className="options">
        <button className="option-card" onClick={() => onSelect('custom')}>
          <div className="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18" />
              <path d="M3 12h18" />
              <circle cx="12" cy="12" r="3.2" />
              <circle cx="12" cy="5.5" r="1.2" fill="currentColor" />
              <circle cx="12" cy="18.5" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <h2>Custom Placement</h2>
          <p>
            Manually position, rotate and arrange furniture with precision in a
            fully editable 3D room.
          </p>
          <span className="cta">
            Start Designing
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </button>

        <button className="option-card accent" onClick={() => onSelect('realtime')}>
          <div className="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <circle cx="12" cy="12" r="3.4" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              <path d="M6 9h.01M6 15h.01M18 9h.01M18 15h.01" />
            </svg>
          </div>
          <h2>Real-time Camera Placement</h2>
          <p>
            Scan your room with your camera and watch furniture map onto the
            real world in real time.
          </p>
          <span className="cta">
            Try Live Preview
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </button>

        <button className="option-card" onClick={() => onSelect('floorplan')}>
          <div className="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" />
              <path d="M4 21V9l8-5 8 5v12" />
              <path d="M9 21v-6h6v6" />
              <path d="M9 10h.01M12 10h.01M15 10h.01" />
            </svg>
          </div>
          <h2>Floor Plan → 3D</h2>
          <p>
            Upload a 2D building or floor-plan image and watch it reconstructed
            as an interactive 3D model.
          </p>
          <span className="cta">
            Build in 3D
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </button>
      </section>

      <footer className="home-footer">
        <span>© 2026 FurniturePlanner — Build interiors without limits.</span>
      </footer>
    </main>
  )
}