import { describe, expect, it } from 'vitest'
import { adresseDeLecture, demarreSeul, formeDe, lecteurDe } from './lecteurs'

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

describe('les autres lecteurs', () => {
  const cas: [string, string, string][] = [
    ['https://www.loom.com/share/0123456789abcdef0123456789abcdef', 'video', 'loom.com/embed/0123456789abcdef0123456789abcdef'],
    ['https://www.dailymotion.com/video/x8abcd1', 'video', 'dailymotion.com/embed/video/x8abcd1'],
    ['https://dai.ly/x8abcd1', 'video', 'embed/video/x8abcd1'],
    ['https://www.tiktok.com/@quelquun/video/7212345678901234567', 'video', 'tiktok.com/embed/v2/7212345678901234567'],
    ['https://open.spotify.com/intl-fr/track/4uLU6hMCjMI75M1A2tKUQC?si=x', 'audio', 'open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['https://soundcloud.com/artiste/un-morceau', 'audio', 'w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartiste%2Fun-morceau'],
    ['https://music.apple.com/fr/album/un-album/1440818839?i=1440818840', 'audio', 'embed.music.apple.com/fr/album/un-album/1440818839?i=1440818840'],
    ['https://www.deezer.com/fr/track/3135556', 'audio', 'widget.deezer.com/widget/auto/track/3135556'],
    ['https://www.google.com/maps/place/Tour+Eiffel/@48.8583701,2.2944813,17z', 'carte', 'q=Tour+Eiffel'],
    ['https://www.google.fr/maps/@48.85,2.29,12z', 'carte', 'z=12'],
    ['https://www.openstreetmap.org/#map=15/48.85837/2.29448', 'carte', 'marker=48.85837%2C2.29448'],
    ['https://www.figma.com/design/AbCdEf123/Maquette?node-id=1', 'riche', 'figma.com/embed?embed_host=notak&url='],
    ['https://miro.com/app/board/uXjVO1234=/', 'riche', 'miro.com/app/live-embed/uXjVO1234=/'],
    ['https://codepen.io/quelquun/pen/abcdEF', 'riche', 'codepen.io/quelquun/embed/abcdEF'],
    ['https://docs.google.com/presentation/d/1AbC_dEf/edit#slide=id.p', 'riche', 'presentation/d/1AbC_dEf/embed'],
  ]
  it.each(cas)('%s', (url, genre, morceau) => {
    const l = lecteurDe(url)
    expect(l?.genre).toBe(genre)
    expect(l?.src).toContain(morceau)
  })

  it('un morceau a une hauteur fixe, une liste plus haute', () => {
    expect(lecteurDe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')?.hauteur).toBe(152)
    expect(lecteurDe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.hauteur).toBe(352)
    expect(lecteurDe('https://soundcloud.com/artiste/sets/une-liste')?.hauteur).toBe(450)
  })

  it('ignore les pages qui ne sont pas des contenus', () => {
    for (const u of [
      'https://soundcloud.com/discover/sets/x',
      'https://soundcloud.com/artiste',
      'https://open.spotify.com/search/truc',
      'https://www.google.com/search?q=maps',
      'https://www.figma.com/pricing',
      'https://www.openstreetmap.org/',
      'https://www.loom.com/share/court',
    ]) expect(lecteurDe(u), u).toBeNull()
  })

  it('lecture automatique muette, et en boucle', () => {
    const yt = lecteurDe('https://youtu.be/dQw4w9WgXcQ?t=1m30s')!
    expect(yt.src).toContain('start=90')
    expect(yt.src).not.toContain('mute=1')
    const auto = new URL(yt.adresse({ auto: true, boucle: true }))
    expect(auto.searchParams.get('mute')).toBe('1')
    expect(auto.searchParams.get('loop')).toBe('1')
    expect(auto.searchParams.get('playlist')).toBe('dQw4w9WgXcQ')
    const vimeo = new URL(lecteurDe('https://vimeo.com/76979871')!.adresse({ boucle: true }))
    expect(vimeo.searchParams.get('loop')).toBe('1')
    expect(vimeo.searchParams.get('muted')).toBeNull()
  })
})

describe('la boîte du lecteur', () => {
  it('un morceau garde sa hauteur fixe, une vidéo ses proportions', () => {
    expect(formeDe(lecteurDe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!)).toEqual({ height: 152 })
    expect(formeDe(lecteurDe('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC')!)).toEqual({ height: 352 })
    expect(formeDe(lecteurDe('https://youtu.be/dQw4w9WgXcQ')!)).toEqual({ aspectRatio: String(16 / 9) })
    expect(formeDe(lecteurDe('https://www.youtube.com/shorts/dQw4w9WgXcQ')!)).toEqual({ aspectRatio: String(9 / 16) })
  })

  it('une carte s’ouvre seule, une vidéo seulement si on le demande', () => {
    const carte = lecteurDe('https://www.openstreetmap.org/#map=12/48.85/2.35')!
    const video = lecteurDe('https://youtu.be/dQw4w9WgXcQ')!
    const morceau = lecteurDe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!
    expect(demarreSeul(carte, {})).toBe(true)
    expect(demarreSeul(video, {})).toBe(false)
    expect(demarreSeul(video, { lectureAuto: true })).toBe(true)
    expect(demarreSeul(morceau, { lectureAuto: true })).toBe(false)
  })

  it('la lecture automatique coupe le son, le clic non', () => {
    const video = lecteurDe('https://youtu.be/dQw4w9WgXcQ')!
    expect(new URL(adresseDeLecture(video, { lectureAuto: true }, false)).searchParams.get('mute')).toBe('1')
    expect(new URL(adresseDeLecture(video, { lectureAuto: true }, true)).searchParams.has('mute')).toBe(false)
    expect(new URL(adresseDeLecture(video, { boucle: true }, true)).searchParams.get('loop')).toBe('1')
    expect(adresseDeLecture(lecteurDe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!, { boucle: true }, true)).toBe(
      'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
    )
  })
})
