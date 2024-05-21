document.getElementById('fetch-times').addEventListener('click', async () => {
    const start = document.getElementById('start').value;
    const end = document.getElementById('end').value;
    const startTime = document.getElementById('start-time').value || "00:00";
    const endTime = document.getElementById('end-time').value || "23:59";

    if (start && end) {
        try {
            const calendars = await listCalendars();
            const freeTimes = await getFreeTimes(start, end, startTime, endTime, calendars);
            const formattedFreeTimes = formatFreeTimes(freeTimes, start, end, startTime, endTime);
            document.getElementById('output').innerHTML = formattedFreeTimes;
        } catch (error) {
            console.error('Error fetching free times:', error);
        }
    } else {
        alert('Please select a start and end date.');
    }
});

document.getElementById('copy').addEventListener('click', () => {
    const freeTimesHtml = document.getElementById('output').innerHTML;
    copyToClipboard(freeTimesHtml);
    document.getElementById('copy').textContent = 'Copied!';
    setTimeout(() => {
        document.getElementById('copy').textContent = 'Copy to clipboard';
    }, 1000);
});

async function listCalendars() {
    const token = await getToken();
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();
    return data.items.map(calendar => calendar.id);
}

async function getFreeTimes(start, end, startTime, endTime, calendarIds) {
    const token = await getToken();
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            timeMin: new Date(`${start}T${startTime}`).toISOString(),
            timeMax: new Date(`${end}T${endTime}`).toISOString(),
            items: calendarIds.map(id => ({ id }))
        })
    });

    const data = await response.json();
    return data.calendars;
}

async function getToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({interactive: true}, (token) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
}

function formatFreeTimes(calendars, start, end, startTime, endTime) {
    let freeTimes = [];
    let currentDate = new Date(start);
    let endDate = new Date(end);

    while (currentDate <= endDate) {
        let dayBusyTimes = [];
        for (const calendarId in calendars) {
            let calendarBusyTimes = calendars[calendarId].busy;
            calendarBusyTimes.forEach(busy => {
                let busyStart = new Date(busy.start);
                if (busyStart.toDateString() === currentDate.toDateString()) {
                    dayBusyTimes.push(busy);
                }
            });
        }

        if (dayBusyTimes.length === 0) {
            freeTimes.push(`${currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'numeric', day: 'numeric' })}<ul><li>${formatTime(startTime)} - ${formatTime(endTime)}</li></ul>`);
        } else {
            let dayFreeTimes = getDayFreeTimes(currentDate, dayBusyTimes, startTime, endTime);
            freeTimes.push(`${currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'numeric', day: 'numeric' })}<ul>`);
            dayFreeTimes.forEach(freeTime => {
                freeTimes.push(`<li>${freeTime}</li>`);
            });
            freeTimes.push('</ul>');
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return freeTimes.join('');
}

function getDayFreeTimes(currentDate, busyTimes, startTime, endTime) {
    let freeTimes = [];
    let startOfDay = new Date(currentDate);
    let endOfDay = new Date(currentDate);

    let [startHour, startMinute] = startTime.split(':').map(Number);
    startOfDay.setHours(startHour, startMinute, 0, 0);

    let [endHour, endMinute] = endTime.split(':').map(Number);
    endOfDay.setHours(endHour, endMinute, 0, 0);

    busyTimes.sort((a, b) => new Date(a.start) - new Date(b.start));

    if (busyTimes.length === 0) {
        freeTimes.push(`${formatTime(startOfDay.toTimeString().slice(0, 5))} - ${formatTime(endOfDay.toTimeString().slice(0, 5))}`);
        return freeTimes;
    }

    let previousEnd = startOfDay;
    busyTimes.forEach(busy => {
        let startOfBusy = new Date(busy.start);
        let endOfBusy = new Date(busy.end);

        if (startOfBusy > previousEnd) {
            freeTimes.push(`${formatTime(previousEnd.toTimeString().slice(0, 5))} - ${formatTime(startOfBusy.toTimeString().slice(0, 5))}`);
        }

        if (endOfBusy > previousEnd) {
            previousEnd = endOfBusy;
        }
    });

    if (previousEnd < endOfDay) {
        freeTimes.push(`${formatTime(previousEnd.toTimeString().slice(0, 5))} - ${formatTime(endOfDay.toTimeString().slice(0, 5))}`);
    }

    return freeTimes;
}

function formatTime(time) {
    let [hour, minute] = time.split(':').map(Number);
    let ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function copyToClipboard(html) {
    const blob = new Blob([html], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });
    navigator.clipboard.write([clipboardItem]);
}
