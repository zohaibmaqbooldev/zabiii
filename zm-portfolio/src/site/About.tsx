import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Reveal } from '../components/ui';
import { useProfile } from '../lib/portfolio';
import { SectionHead } from './SectionHead';

export function About() {
  const p = useProfile();
  const facts = [
    { icon: 'cap', label: 'Education', value: p.educationLabel },
    { icon: 'code', label: 'Focus', value: p.focus },
    { icon: 'pin', label: 'Location', value: p.location },
    { icon: 'arrow-up-right', label: 'Goal', value: p.goal },
  ];

  return (
    <section id="about" className="section about" aria-labelledby="about-title">
      <div className="container">
        <SectionHead
          index="01"
          label="About"
          id="about-title"
          title={
            <>
              Learning by <span className="serif accent">building</span>,<br className="hide-sm" /> one real project at a time.
            </>
          }
        />

        <div className="about__grid">
          <Reveal className="about__media">
            <SmartImage
              src={p.aboutImage || '/images/profile-720.webp'}
              alt={`${p.name}`}
              ratio="4 / 5"
              sizes="(max-width: 900px) 92vw, 38vw"
              className="about__img"
              position="50% 18%"
              fallbackLabel={p.name}
            />
            <div className="about__caption mono">
              <span>{p.name}</span>
              <span>{p.location}</span>
            </div>
          </Reveal>

          <div className="about__body">
            <Reveal as="div" className="about__lede">
              <p>{p.about}</p>
            </Reveal>
            <dl className="spec">
              {facts.map((f, i) => (
                <Reveal key={f.label} as="div" className="spec__cell" delay={100 + i * 70}>
                  <dt className="mono">
                    <Icon name={f.icon} size={14} /> {f.label}
                  </dt>
                  <dd>{f.value}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
