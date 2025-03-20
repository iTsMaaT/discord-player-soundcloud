import { Soundcloud, SoundcloudTrack, SoundcloudPlaylist } from "soundcloud.ts";
import {
    BaseExtractor,
    Playlist,
    Track,
    Util,
    GuildQueueHistory,
    ExtractorSearchContext,
    ExtractorStreamable,
} from "discord-player";

const soundcloudTrackRegex = /^(https?:\/\/(m\.|www\.)?soundcloud\.com\/([\w-]+)\/([\w-]+)(.+)?)$/;
const soundcloudShortenedTrackRegex = /^https:\/\/on\.soundcloud\.com\/[a-zA-Z1-9]{0,17}$/;
const soundcloudPlaylistRegex = /^(https?:\/\/(m\.|www\.)?soundcloud\.com\/([\w-]+)\/sets\/([\w-]+)(.+)?)$/;

const isUrl = (query: string): boolean => {
    try {
        return ["http:", "https:"].includes(new URL(query).protocol);
    } catch {
        return false;
    }
};

export interface SoundcloudExtractorInit {
    clientId?: string;
    oauthToken?: string;
    proxy?: string;
}

const filterSoundCloudPreviews = (tracks: SoundcloudTrack[],
): SoundcloudTrack[] => {
    const filtered = tracks.filter(t => t.policy?.toUpperCase() === "ALLOW" || !(t.duration === 30000 && t.full_duration > 30000));
    return filtered.length > 0 ? filtered : tracks;
};

export class SoundcloudExtractor extends BaseExtractor<SoundcloudExtractorInit> {
    static identifier = "com.discord-player.soundcloudextractor";
    static instance: SoundcloudExtractor | null = null;

    public internal = new Soundcloud(this.options.clientId, this.options.oauthToken);

    async activate() {
        this.protocols = ["scsearch", "soundcloud"];
        SoundcloudExtractor.instance = this;
    }

    async deactivate() {
        this.protocols = [];
        SoundcloudExtractor.instance = null;
    }

    async validate(query: string): Promise<boolean> {
        return !isUrl(query) ||
            [soundcloudTrackRegex, soundcloudShortenedTrackRegex, soundcloudPlaylistRegex].some(regex => regex.test(query));
    }

    async getRelatedTracks(track: Track, history: GuildQueueHistory) {
        const data = await this.internal.tracks.related(track.url, 5).catch(() => []);
        if (!data.length) return this.createResponse();

        const unique = filterSoundCloudPreviews(data).filter(t => !history.tracks.some(h => h.url === t.permalink_url));
        return this.createResponse(null, (unique.length ? unique : data).map(t => this.buildTrack(t, { requestedBy: track.requestedBy! }))); // Use buildTrack here and pass the requestedBy from the track object
    }

    buildPlaylist(data: SoundcloudPlaylist, context: ExtractorSearchContext): Playlist {
        return new Playlist(this.context.player, {
            title: data.title,
            description: data.description ?? "",
            thumbnail: data.artwork_url ?? (data.tracks && data.tracks[0]?.artwork_url),
            type: "playlist",
            source: "soundcloud",
            author: { name: data.user.username, url: data.user.permalink_url },
            tracks: data.tracks.map(song => this.buildTrack(song, context)),
            id: data.id.toString(),
            url: data.permalink_url,
            rawPlaylist: data,
        });
    }

    buildTrack(trackInfo: SoundcloudTrack, context: ExtractorSearchContext, playlist?: Playlist): Track {
        return new Track(this.context.player, {
            title: trackInfo.title,
            url: trackInfo.permalink_url,
            duration: Util.buildTimeCode(Util.parseMS(trackInfo.duration)),
            description: trackInfo.description ?? "",
            thumbnail: trackInfo.artwork_url,
            views: trackInfo.playback_count,
            author: trackInfo.user.username,
            requestedBy: context.requestedBy,
            source: "soundcloud",
            engine: trackInfo,
            metadata: trackInfo,
            requestMetadata: async () => trackInfo,
            cleanTitle: trackInfo.title,
            playlist: playlist,
        });
    }

    async handle(query: string, context: ExtractorSearchContext) {
        if (soundcloudPlaylistRegex.test(query)) {
            const data = await this.internal.playlists.get(query).catch(() => null);
            if (!data) return this.createResponse();

            const playlist = this.buildPlaylist(data, context);

            // Temporary not working, plays only the first track
            return this.createResponse(null, playlist.tracks);
        }

        if (soundcloudTrackRegex.test(query) || soundcloudShortenedTrackRegex.test(query)) {
            const trackInfo = await this.internal.tracks.get(query).catch(() => null);
            return trackInfo ? { playlist: null, tracks: [this.buildTrack(trackInfo, context)] } : this.createResponse();
        }

        // Default case - search
        let tracks = await this.internal.tracks.search({ q: query }).then(t => t.collection).catch(() => []);
        if (!tracks.length) tracks = await this.internal.tracks.searchAlt(query).catch(() => []);
        if (!tracks.length) return this.createResponse();

        return {
            playlist: null,
            tracks: filterSoundCloudPreviews(tracks).filter(t => t.streamable).map(t => this.buildTrack(t, context)),
        };
    }

    public async bridge(
        track: Track,
        sourceExtractor: BaseExtractor | null,
    ): Promise<ExtractorStreamable | null> {
        if (sourceExtractor?.identifier === this.identifier) 
            return this.stream(track);
        
    
        const query =
          sourceExtractor?.createBridgeQuery(track) ??
          `${track.author} - ${track.title}`;
    
        const info = await this.handle(query, {
            requestedBy: track.requestedBy,
        });
    
        if (!info.tracks.length) return null;
    
        const result = await this.stream(info.tracks[0]);
    
        if (result) {
            track.bridgedTrack = info.tracks[0];
            track.bridgedExtractor = this;
        }
    
        return result;
    }
    
    async stream(info: Track): Promise<ExtractorStreamable> {
        if (!(info instanceof Track)) throw new Error("Invalid track object");
        const url = await this.internal.util.streamLink(info.url).catch(() => null);
        if (!url) throw new Error("Could not extract stream from this track source");
        return url;
    }
}