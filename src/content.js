const icon = (n) => `dc-icon--${n}`;
const sections = [
    'gem', // Treasures from God’s Word
    'wheat', // Apply Yourself to the Field Ministry
    'sheep' // Living as Christians
].reduce((previous, section) => ({ ...previous, [section]: icon(section) }), {});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSource') {
        const meetings = [];

        document.querySelectorAll('div.pub-mwb:not(:has(> div#f1))').forEach((meeting) => {
            const data = {
                label: getText('[data-pid="1"]', meeting),
                theme: getText('[data-pid="2"]', meeting),
                songs: []
            };

            Array.from(meeting.querySelectorAll(`.${icon('music')} strong:first-child`)).forEach((song) => {
                data.songs.push(getSong(song.textContent));
            });

            let section = null;
            Array.from(meeting.querySelector('div.bodyTxt').querySelectorAll('div, h3')).forEach((item) => {

                item.classList.forEach((name) => {
                    if (Object.values(sections).includes(name)) {
                        section = Object.keys(sections).find(k => sections[k] === name);
                        data[section] = [];
                    }
                });

                const isHeading = item.tagName === 'H3';
                const isBaseDiv = item.tagName === 'DIV' && item.classList.contains('du-fontSize--base');
                const looksLikeNumberedTitle = /^\d+\./.test(item.textContent.trim());

                if (section && (isHeading || isBaseDiv) && looksLikeNumberedTitle) {
                    /* ^\(                < matches ( on the beginning of the string
                     *     ([^()]*)       < capturing group 1, everything but [ and ]
                     * \)                 < matches )
                     * \s*                < matches 0 or more whitespaces
                     * ([^]*)             < capturing group 2, rest of the string
                     */
                    const info = item.nextElementSibling.textContent.trim().match(/^\(([^()]*)\)\s*([^]*)/); // next element contains descr
                    const title = item.textContent.trim().match(/^(\d+)\.(.*)/); // set part number apart
                    const number = getDigit(title[1]);
                    const entry = {
                        time: getDigit(info[1]),
                        title: title[2].trim(),
                        number
                    };
                    if (info[2]) {
                        const description = info[2].trim();
                        /* ([^]*)\(            < capturing group 1, everything untill (
                         * ((?:lmd|th).*)      < capturing group 2, everything starting with lmd or th
                         * \)$                 < matches ) right before the end of line
                         */
                        const hasLesson = description.match(/([^]*)\(((?:lmd|th).*)\)$/);
                        if (hasLesson) {
                            entry.lesson = hasLesson[2].trim();
                            if (number === 3) { // number 3 is always bible reading
                                entry.assignment = hasLesson[1].trim();
                            } else {
                                // "Explaining Your Beliefs" might be either a talk or a demonstration
                                const isTalkOrEYB = hasLesson[1].trim().match(/(^[^.]*).(?:.*)\—(?:[^]*)\: (.*)$/);
                                if (isTalk(entry.title) || (isTalkOrEYB && isTalk(isTalkOrEYB[1]))) {
                                    entry.theme = isTalkOrEYB[2].trim();
                                }
                            }
                        }
                    }

                    data[section].push(entry);
                }
            });

            meetings.push(Object.entries({
                week: getElement('#todayWeek')?.value || null,
                label: data.label,
                theme: data.theme,
                opening_song: data.songs[0],
                opening_talk: data.gem[0],
                spiritual_gems: data.gem[1],
                bible_reading: data.gem[2],
                apply_yourself_to_the_field_ministry: data.wheat,
                middle_song: data.songs[1],
                living_as_christians: data.sheep.slice(0, -1),
                congregation_bible_study: data.sheep[data.sheep.length - 1],
                closing_song: data.songs[2]
            }).reduce((a, [k, v]) => (v === null ? a : (a[k] = v, a)), {}));
        });

        sendResponse(meetings);
    }
});

function isTalk(str) {
    // @TODO: Find a better way of differentiating without the usage of static strings
    return ['Talk', 'Discurso'].includes(str);
}

function getText(element, base) {
    return getElement(element, base).textContent
}

function getElement(selector, base) {
    return (base || document).querySelector(selector);
}

function getDigit(string) {
    return +string.replace(/\D/g, '');
}

function getSong(string) {
    const n = getDigit(string);
    return n >= 1 && n <= 159 ? n : '-';
}