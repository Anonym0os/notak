import { describe, expect, it } from 'vitest'
import { lecteurDe } from './video'

describe('lecteurDe', () => {
  it('lit les formes d’adresse YouTube', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
      'https://youtu.be/dQw4w9WgXcQ?si=x',
      'https://youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const l = lecteurDe(u)
      expect(l?.id).toBe('dQw4w9WgXcQ')
      expect(l?.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    }
  })
  it('lit Vimeo', () => {
    expect(lecteurDe('https://vimeo.com/76979871')?.src).toContain('player.vimeo.com/video/76979871?dnt=1')
    expect(lecteurDe('https://vimeo.com/channels/staffpicks/76979871')?.id).toBe('76979871')
    expect(lecteurDe('https://player.vimeo.com/video/76979871')?.id).toBe('76979871')
  })
  it('ignore le reste', () => {
    expect(lecteurDe('https://www.youtube.com/')).toBeNull()
    expect(lecteurDe('https://www.youtube.com/watch?v=court')).toBeNull()
    expect(lecteurDe('https://exemple.fr/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(lecteurDe('https://vimeo.com/about')).toBeNull()
    expect(lecteurDe('pas une adresse')).toBeNull()
  })
})
