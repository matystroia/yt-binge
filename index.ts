import express from "express";
import bodyParser from "body-parser";
import { google, youtube_v3 } from "googleapis";
import isoDuration from "iso8601-duration";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PORT = process.env.PORT || 3000;

const youtube = google.youtube({ version: "v3", http2: true });

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "pug");

app.listen(PORT, function () {
  console.log(`App listening on port ${PORT}`);
});

app.get("/", function (_, res) {
  res.render("index", {});
});

app.post("/result", async function (req, res) {
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
    const totalSeconds = await getTimeForChannel(channel);
    return res.render("result", {
      time: getTimeString(totalSeconds),
      title: channel.snippet?.title ?? query,
      url: `https://www.youtube.com/playlist?list=${channel.contentDetails?.relatedPlaylists?.uploads}`,
    });
  } catch (err) {
    return res.render("result", {
      error: `Error while getting channel videos: ${err}`,
    });
  }
});

const getTimeString = (seconds: number): string => {
  const totalTime = secondsToTime(seconds);

  let timeUnits = ["years", "months", "days", "hours", "minutes", "seconds"];
  let ret = "";

  let lastUnit = null;
  let secondToLastUnit = null;
  for (let i = 0; i < 6; i++)
    if (totalTime[i] > 0) {
      secondToLastUnit = lastUnit;
      lastUnit = i;
    }

  for (let i = 0; i < 6; i++) {
    if (totalTime[i] > 0) {
      ret +=
        totalTime[i] +
        " " +
        (totalTime[i] > 1 ? timeUnits[i] : timeUnits[i].slice(0, -1));
      if (i === secondToLastUnit) ret += " and ";
      else if (i !== lastUnit) ret += ", ";
    }
  }

  return ret;
};

const getTimeForChannel = async (
  channel: youtube_v3.Schema$Channel,
): Promise<number> => {
  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) {
    throw new Error("Couldn't find uploads playlist");
  }

  const videoIds = await getPlaylistVideos(uploadsPlaylist);
  console.log(videoIds.length);

  return getVideosLengthTotal(videoIds as any);
};

const secondsToTime = (seconds: number): number[] => {
  let ret = [0, 0, 0, 0, 0];
  for (let t of [31557600, 2629800, 86400, 3600, 60].entries()) {
    if (seconds >= t[1]) {
      ret[t[0]] += Math.floor(seconds / t[1]);
      seconds -= Math.floor(seconds / t[1]) * t[1];
    }
  }
  return [...ret, Math.floor(seconds)];
};

const getChannel = async (
  params: Partial<youtube_v3.Params$Resource$Channels$List>,
) => {
  const response = await youtube.channels.list({
    part: ["snippet", "contentDetails"],
    key: YOUTUBE_API_KEY,
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
      key: YOUTUBE_API_KEY,
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
  let promises = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    promises.push(
      youtube.videos.list({
        part: ["contentDetails"],
        id: videoIds.slice(i, i + 50),
        key: YOUTUBE_API_KEY,
      }),
    );
  }

  const results = await Promise.all(promises);

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
