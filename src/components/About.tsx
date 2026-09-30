import { Reveal } from './Reveal'

// Bio text only describes the work itself. Add biography details
// (training, exhibitions, collections) once confirmed by the artist.
const SUBJECTS = [
  { title: 'Still life', body: 'Fruit, glass and porcelain on a table, lit from one side against a dark ground.' },
  { title: 'Flowers', body: 'Roses, sunflowers and mixed bouquets, painted in thick, loaded strokes.' },
  { title: 'The sea', body: 'Breaking waves, falls and boats drawn up on the sand at sunset.' },
  { title: 'Countryside', body: 'Whitewashed houses, rivers, swans and birds in open landscape.' },
]

export function About() {
  return (
    <section id="about" className="mx-auto max-w-[1440px] scroll-mt-16 border-t border-line px-4 py-24 md:px-10 md:py-40">
      <Reveal>
        <p className="max-w-[26ch] font-serif text-[34px] leading-[1.15] font-light tracking-[-0.01em] md:text-5xl lg:text-[64px]">
          Flowers, fruit and the sea, painted in oil with an open love of{' '}
          <em className="font-normal">color.</em>
        </p>
      </Reveal>

      <div className="mt-20 grid grid-cols-1 gap-12 md:mt-28 md:grid-cols-12 md:gap-10">
        <Reveal className="md:col-span-5">
          <div className="bg-wall p-5">
            <img
              src="/carlos-huangal.jpg"
              alt="Carlos Huangal painting at his easel, palette in hand"
              loading="lazy"
              className="aspect-[4/5] w-full object-cover object-top"
            />
          </div>
        </Reveal>

        <Reveal delay={0.1} className="md:col-span-6 md:col-start-7 md:pt-8">
          <h2 className="font-serif text-4xl font-light md:text-5xl">Carlos Huangal</h2>
          <div className="mt-6 max-w-[60ch] space-y-5 text-[16px] leading-relaxed text-ink-2">
            <p>
              Carlos Huangal paints in oil on canvas, moving between classical still life, flowers and the landscapes and
              coastlines he returns to again and again.
            </p>
            <p>
              ArteTotal is his studio shop. Every painting listed here comes directly from the artist, signed by hand.
            </p>
          </div>

          <h3 className="mt-14 font-serif text-2xl italic">What he paints</h3>
          <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
            {SUBJECTS.map((s) => (
              <div key={s.title}>
                <dt className="font-serif text-xl">{s.title}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-ink-3">{s.body}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}
