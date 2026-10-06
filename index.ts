import express from "express";
import bodyParser from "body-parser";
import { google, youtube_v3 } from "googleapis";
import { rateLimit } from "express-rate-limit";
import isoDuration from "iso8601-duration";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || "";

const youtube = google.youtube({
  version: "v3",
  auth: YOUTUBE_API_KEY,
  http2: true,
});

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "pug");
app.locals.base = BASE_PATH;

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_, res) =>
    res.render("result", {
      error: "Sorry, you've made too many requests! Try again in an hour",
    }),
});

app.get("/", function (_, res) {
  res.render("index", {});
});

app.post("/result", limiter, async function (req, res) {
  const query = req.body.query;
  if (!query) {
    return res.render("result", { error: "Couldn't find channel" });
  }

  let channel;
  try {
    channel = await getChannel({ id: query });
    if (!channel) {
      channel = await getChannel({ forHandle: query });
    }
    if (!channel) {
      channel = await getChannel({ forUsername: query });
    }
    if (!channel) {
      return res.render("result", { error: "Couldn't find channel" });
    }
  } catch (err) {
    return res.render("result", {
      error: `Error while getting channel: ${err}`,
    });
  }

  try {
    const duration = await getDuration(channel);
    return res.render("result", {
      duration: formatDuration(duration),
      trivia: getTrivia(duration),
      channelTitle: channel.snippet?.title ?? query,
      uploadsUrl: `https://www.youtube.com/playlist?list=${channel.contentDetails?.relatedPlaylists?.uploads}`,
    });
  } catch (err) {
    return res.render("result", {
      error: `Error while getting channel videos: ${err}`,
    });
  }
});

const root = express();
root.use(BASE_PATH || "/", app);
root.listen(PORT, function () {
  console.log(`App listening on port ${PORT}`);
});

const getDuration = async (
  channel: youtube_v3.Schema$Channel,
): Promise<number> => {
  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) {
    throw new Error("Couldn't find uploads playlist");
  }

  const videoIds = await getPlaylistVideos(uploadsPlaylist);
  if (videoIds.length === 0) {
    throw new Error("Channel has no videos");
  }

  return getVideosLengthTotal(videoIds as any);
};

const getChannel = async (
  params: Partial<youtube_v3.Params$Resource$Channels$List>,
) => {
  const response = await youtube.channels.list({
    part: ["snippet", "contentDetails"],
    ...params,
  });
  return response.data.items?.[0] || null;
};

const getPlaylistVideos = async (playlistId: string) => {
  const getPage = async (pageToken?: string) =>
    youtube.playlistItems.list({
      playlistId: playlistId,
      part: ["snippet"],
      maxResults: 50,
      pageToken: pageToken,
    });

  const videoIds = [];

  let pageToken;
  do {
    const result = await getPage(pageToken);
    const pageVideoIds = result.data.items!.map(
      (video) => video.snippet?.resourceId?.videoId,
    );
    pageToken = result.data.nextPageToken ?? undefined;

    videoIds.push(...pageVideoIds);
  } while (pageToken);

  return videoIds;
};

const getVideosLengthTotal = async (videoIds: string[]): Promise<number> => {
  const results = await Promise.all(
    Array.from({ length: Math.ceil(videoIds.length / 50) }, (_, i) =>
      youtube.videos.list({
        part: ["contentDetails"],
        id: videoIds.slice(i, i + 50),
      }),
    ),
  );

  return results
    .flatMap((result) => result.data.items)
    .reduce(
      (acc, curr) =>
        acc +
        isoDuration.toSeconds(
          isoDuration.parse(curr?.contentDetails?.duration ?? "PT0M0S"),
        ),
      0,
    );
};

const getTrivia = (seconds: number): string | undefined => {
  // https://en.wikipedia.org/wiki/Orders_of_magnitude_(time)
  const durationTrivia: [number, string][] = [
    [35_730, "the rotational period of Jupiter"],
    [58_000, "one day on Neptune"],
    [62_000, "one day on Uranus"],
    [5_000_000, "the rotational period of Mercury"],
    [7_600_000, "one year on Mercury"],
    [19_400_000, "one year on Venus"],
  ];
  for (let [duration, trivia] of durationTrivia) {
    if (Math.abs(duration - seconds) / duration <= 0.15) {
      return trivia;
    }
  }
};

const formatDuration = (seconds: number): string => {
  const time = secondsToTime(seconds);

  const str = Object.entries(time)
    .map(([unit, n]) => `${n} ${unit}${n !== 1 ? "s" : ""}`)
    .join(", ");

  const commaIndex = str.lastIndexOf(",");
  return str.slice(0, commaIndex) + " and" + str.slice(commaIndex + 1);
};

const secondsToTime = (seconds: number): { [k: string]: number } => {
  const unitSeconds = {
    year: 365.25 * 24 * 60 * 60,
    month: 30.5 * 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    day: 24 * 60 * 60,
    hour: 60 * 60,
    minute: 60,
    second: 1,
  };

  const ret: { [k: string]: number } = {};
  for (let [unit, unit_secs] of Object.entries(unitSeconds)) {
    const units = Math.floor(seconds / unit_secs);
    if (units > 0) {
      ret[unit] = units;
    }
    seconds -= units * unit_secs;
  }

  return ret;
};
