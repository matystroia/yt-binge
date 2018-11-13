const express = require('express');
const bodyParser = require('body-parser');
const {google} = require('googleapis');
const isoDuration = require('iso8601-duration')

const app = express();
const youtube = google.youtube('v3');
const API_KEY = 'AIzaSyBd6Db7sSjJXHj21-t4Dyp2gAE217UKQQA';

app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
    res.render('index', {});
});

app.listen(3000, function () {
    console.log('App listening on port 3000!')
});

app.post('/', function (req, res) {
    getChannel(req.body.channelId, function (channel) {
        if (channel === null) {
            res.render('index', {error: "Channel doesn't exist."});
            return;
        }

        let channelTitle = channel['snippet']['title'];
        let uploadsPlaylist = channel['contentDetails']['relatedPlaylists']['uploads'];
        let videos = [];

        getPlaylistVideos(null, uploadsPlaylist, videos, function (videoIds) {
            getVideoLengths(videoIds, function (videoLengths) {
                let totalSeconds = 0;
                videoLengths.forEach(function (videoLength) {
                    totalSeconds += isoDuration.toSeconds(isoDuration.parse(videoLength));
                });

                let totalTime = secondsToTime(totalSeconds);
                let timeUnits = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
                let timeText = '';

                let lastUnit = null;
                let secondToLastUnit = null;
                for (let i = 0; i < 6; i++)
                    if (totalTime[i] > 0) {
                        secondToLastUnit = lastUnit;
                        lastUnit = i;
                    }

                for (let i = 0; i < 6; i++) {
                    if (totalTime[i] > 0) {
                        timeText += totalTime[i] + ' ' + (totalTime[i] > 1 ? timeUnits[i] : timeUnits[i].slice(0, -1));
                        if (i === secondToLastUnit)
                            timeText += ' and ';
                        else if (i !== lastUnit)
                            timeText += ', ';
                    }
                }

                res.render('index', {
                    time: timeText,
                    title: channelTitle,
                    url: 'https://www.youtube.com/playlist?list=' + uploadsPlaylist
                });
            });
        })
    });
});

function secondsToTime(seconds) {
    let ret = [0, 0, 0, 0, 0];
    for (let t of [31557600, 2629800, 86400, 3600, 60].entries()) {
        if (seconds >= t[1]) {
            ret[t[0]] += Math.floor(seconds / t[1]);
            seconds -= Math.floor(seconds / t[1]) * t[1];
        }
    }
    ret.push(Math.floor(seconds));

    return ret;
}

function getChannel(channelId, callback) {
    youtube.channels.list({
        'id': channelId,
        'part': 'snippet,contentDetails',
        'key': API_KEY
    }, function (err, response) {
        if (response.data['pageInfo']['totalResults'] === 0) {
            youtube.channels.list({
                'forUsername': channelId,
                'part': 'snippet,contentDetails',
                'key': API_KEY
            }, function (err, response) {
                if (response.data['pageInfo']['totalResults'] === 0)
                    callback(null);
                else
                    callback(response.data['items'][0]);
            });
        }
        else
            callback(response.data['items'][0]);
    });
}

function getPlaylistVideos(token, playlistId, videoIds, callback) {
    youtube.playlistItems.list({
        'playlistId': playlistId,
        'part': 'snippet',
        'maxResults': 50,
        'pageToken': token == null ? '' : token,
        'key': API_KEY
    }, function (err, response) {
        videoIds.push(...response.data['items'].map(_ => _['snippet']['resourceId']['videoId']));
        if ('nextPageToken' in response.data)
            getPlaylistVideos(response.data['nextPageToken'], playlistId, videoIds, callback);
        else
            callback(videoIds);
    });
}

function getVideoLengths(videoIds, callback) {
    let lengths = [];
    let c = 0;

    for (let i = 0; i < videoIds.length; i += 50) {
        c++;

        youtube.videos.list({
            'part': 'contentDetails',
            'id': videoIds.slice(i, i + 50).join(','),
            'key': API_KEY
        }, function (err, response) {
            lengths.push(...response.data['items'].map(_ => _['contentDetails']['duration']));
            c--;
            if (c === 0)
                callback(lengths);
        });
    }
}
