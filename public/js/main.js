function onSubmit() {
    if (document.getElementById('time') != null)
        document.getElementById('time').innerText = '';
    if (document.getElementById('error') != null) {
        document.getElementById('error').innerText = '';
        document.getElementById('error-help').innerText = '';
    }
    document.getElementById('spinner').innerHTML = '<div class="loader"></div><p class="loader-text">API calls take time, you know...<br>You might want to check back later</p>';
}

if (document.getElementById('audio') != null)
    new Audio('Y:\\Git\\yt-binge\\views\\' + document.getElementById('audio').getAttribute('class')).play();