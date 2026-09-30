import { MotionConfig } from 'motion/react'
import { StoreProvider } from './state/StoreProvider'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Gallery } from './components/Gallery'
import { Shop } from './components/Shop'
import { About } from './components/About'
import { Footer } from './components/Footer'
import { ArtworkModal } from './components/ArtworkModal'
import { CartDrawer } from './components/CartDrawer'
import { Studio } from './components/Studio'
import { Toast } from './components/Toast'

// z-index scale: nav 30, modal + cart 40, studio 50, toast 60.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <Nav />
        <main>
          <Hero />
          <Gallery />
          <Shop />
          <About />
        </main>
        <Footer />
        <ArtworkModal />
        <CartDrawer />
        <Studio />
        <Toast />
      </StoreProvider>
    </MotionConfig>
  )
}
