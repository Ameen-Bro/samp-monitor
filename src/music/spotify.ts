/**
 * Spotify URL parser & metadata resolver (zero API keys required).
 * Extracts song titles and artist names from public Spotify tracks, albums, and playlists,
 * so they can be seamlessly streamed via the audio pipeline.
 */

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  searchQuery: string;
}

export interface SpotifyPlaylistInfo {
  name: string;
  tracks: SpotifyTrackInfo[];
}

export function isSpotifyUrl(url: string): boolean {
  return /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+(\?.*)?$/i.test(url.trim());
}

export function getSpotifyType(url: string): 'track' | 'album' | 'playlist' | null {
  const match = url.trim().match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (!match) return null;
  return match[1].toLowerCase() as 'track' | 'album' | 'playlist';
}

export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
  const match = url.trim().match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (!match) return null;
  return { type: match[1].toLowerCase() as any, id: match[2] };
}

/**
 * Resolves a Spotify track URL into song title and artist.
 */
export async function resolveSpotifyTrack(url: string): Promise<SpotifyTrackInfo | null> {
  try {
    const res = await fetch(url.trim(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

    if (!titleMatch) return null;

    const title = titleMatch[1].trim();
    let artist = '';
    if (descMatch) {
      // Format usually: "Artist · Album · Song · Year" or "Artist · Song · Year"
      const parts = descMatch[1].split('·').map((p) => p.trim());
      if (parts.length > 0) {
        artist = parts[0];
      }
    }

    const searchQuery = artist ? `${artist} - ${title}` : title;
    return { title, artist, searchQuery };
  } catch {
    return null;
  }
}

/**
 * Resolves a Spotify album or playlist into an array of track queries.
 */
export async function resolveSpotifyPlaylist(url: string): Promise<SpotifyPlaylistInfo | null> {
  const parsed = extractSpotifyId(url);
  if (!parsed || (parsed.type !== 'playlist' && parsed.type !== 'album')) return null;

  try {
    const embedUrl = `https://open.spotify.com/embed/${parsed.type}/${parsed.id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (nextDataMatch) {
      const data = JSON.parse(nextDataMatch[1]);
      const entity = data.props?.pageProps?.state?.data?.entity;
      const name = entity?.name || (parsed.type === 'album' ? 'Spotify Album' : 'Spotify Playlist');
      const trackList = entity?.trackList || [];

      const tracks: SpotifyTrackInfo[] = trackList.map((t: any) => {
        const title = t.title || 'Unknown';
        const artist = t.subtitle || '';
        return {
          title,
          artist,
          searchQuery: artist ? `${artist} - ${title}` : title,
        };
      });

      return { name, tracks };
    }

    // Fallback if embed doesn't have JSON: parse meta title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const playlistName = titleMatch ? titleMatch[1] : 'Spotify Collection';
    return { name: playlistName, tracks: [] };
  } catch {
    return null;
  }
}
