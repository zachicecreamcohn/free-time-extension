let calendarsList = [];

window.onload = async () => {
    calendarsList= await listCalendars();
    // Initialize the multi-select dropdown
    MultiSelectDropdown({
        search: true,
        placeholder: 'Calendars to exclude...',
    });
}


document.getElementById('fetch-times').addEventListener('click', async () => {
    const start = document.getElementById('start').value;
    const end = document.getElementById('end').value;
    const startTime = document.getElementById('start-time').value || "00:00";
    const endTime = document.getElementById('end-time').value || "23:59";
    const showFreeTimes = document.getElementById('free').checked;
    const excludedCalendars = Array.from(document.getElementById('calendar-select').selectedOptions).map(option => option.value);
    console.log('Excluded Calendars:', excludedCalendars);
    if (start && end) {
        try {
            const filteredCalendars = calendarsList.filter(calendar => !excludedCalendars.includes(calendar));
            const freeTimes = await getFreeTimes(start, end, startTime, endTime, filteredCalendars);
            const formattedTimes = formatTimes(freeTimes, start, end, startTime, endTime, showFreeTimes);
            document.getElementById('output').innerHTML = formattedTimes;
        } catch (error) {
            console.error('Error fetching times:', error);
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
    console.log('Fetching Calendars...');
    const token = await getToken();
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();
    const calendarSelect = document.getElementById('calendar-select');
    calendarSelect.innerHTML = ''; // Clear any existing options

    data.items.forEach(calendar => {
        const option = document.createElement('option');
        option.value = calendar.id;
        option.text = calendar.summary;
        calendarSelect.appendChild(option);
    });

    console.log('Fetched Calendars:', data.items);

    return data.items.map(calendar => calendar.id);
}




async function getFreeTimes(start, end, startTime, endTime, calendarIds) {
    const token = await getToken();
    const timeMin = parseDateString(start, startTime).toISOString();
    const timeMax = parseDateString(end, endTime).toISOString();

    console.log('Fetching Free Times with the following parameters:');
    console.log('Start:', timeMin);
    console.log('End:', timeMax);

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            timeMin: timeMin,
            timeMax: timeMax,
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
function formatTimes(calendars, start, end, startTime, endTime, showFreeTimes) {
    let times = [];
    let currentDate = parseDateString(start, "00:00");
    let endDate = parseDateString(end, "23:59");

    console.log('Formatting times for the date range:');
    console.log('Start Date:', currentDate);
    console.log('End Date:', endDate);

    while (currentDate <= endDate) {
        console.log('Processing Date:', currentDate);

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
            if (showFreeTimes) {
                times.push(`${currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'numeric', day: 'numeric' })}<ul><li>${formatTime(startTime)} - ${formatTime(endTime)}</li></ul>`);
            }
        } else {
            if (showFreeTimes) {
                let dayFreeTimes = getDayFreeTimes(currentDate, dayBusyTimes, startTime, endTime);
                times.push(`${currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'numeric', day: 'numeric' })}<ul>`);
                dayFreeTimes.forEach(freeTime => {
                    times.push(`<li>${freeTime}</li>`);
                });
                times.push('</ul>');
            } else {
                times.push(`${currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'numeric', day: 'numeric' })}<ul>`);
                dayBusyTimes.forEach(busyTime => {
                    times.push(`<li>${formatTime(new Date(busyTime.start).toTimeString().slice(0, 5))} - ${formatTime(new Date(busyTime.end).toTimeString().slice(0, 5))}</li>`);
                });
                times.push('</ul>');
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);  // Reset time to start of the day
    }

    return times.join('');
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
            if (startOfBusy > endOfDay) {
                // If the next busy time starts after the end of the day, add free time till endOfDay
                freeTimes.push(`${formatTime(previousEnd.toTimeString().slice(0, 5))} - ${formatTime(endOfDay.toTimeString().slice(0, 5))}`);
            } else {
                // Add free time until the next busy time starts
                freeTimes.push(`${formatTime(previousEnd.toTimeString().slice(0, 5))} - ${formatTime(startOfBusy.toTimeString().slice(0, 5))}`);
            }
        }

        // Move the previous end to the end of the current busy period
        if (endOfBusy > previousEnd) {
            previousEnd = endOfBusy;
        }
    });

    // Add any remaining free time at the end of the day
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

function parseDateString(dateString, timeString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date(year, month - 1, day, hours, minutes);
    return date;
}