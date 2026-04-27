class MeetingExtractor {
    #MEETING_SECTIONS = {
        gem: 'dc-icon--gem',     // Treasures from God's Word
        wheat: 'dc-icon--wheat', // Apply Yourself to the Field Ministry
        sheep: 'dc-icon--sheep'  // Living as Christians
    };

    #MONTH_NAMES = {
        janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
        julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };

    constructor() {
        this.#setupMessageListener();
    }

    #setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'getSource') {
                const meetings = this.#extractAllMeetings();
                sendResponse(meetings);
            }
        });
    }

    #extractAllMeetings() {
        const meetingElements = document.querySelectorAll('article.pub-mwb:not(:has(> div#f1))');
        return Array.from(meetingElements).map(element => this.#extractSingleMeeting(element));
    }

    #extractSingleMeeting(meetingElement) {
        const meetingData = {
            week: this.#extractWeek(meetingElement),
            label: this.#getTextContent('[data-pid="1"]', meetingElement),
            theme: this.#getTextContent('[data-pid="2"]', meetingElement),
            songs: this.#extractSongs(meetingElement),
            gem: [],
            wheat: [],
            sheep: []
        };

        this.#parseMeetingParts(meetingElement, meetingData);

        return this.#buildMeetingStructure(meetingData);
    }

    #extractWeek(meetingElement) {
        const yearMatch = meetingElement.className.match(/\bpub-mwb(\d{2})\b/);
        const labelText = this.#getTextContent('[data-pid="1"]', meetingElement);
        if (!yearMatch || !labelText) return null;

        const dayMatch = labelText.match(/\d+/);
        const words = labelText.toLowerCase().match(/\p{L}+/gu) || [];
        const monthName = words.find(word => this.#MONTH_NAMES[word]);
        if (!dayMatch || !monthName) return null;

        const day = parseInt(dayMatch[0], 10);
        const month = this.#MONTH_NAMES[monthName];
        const year = 2000 + parseInt(yearMatch[1], 10);
        const startDate = new Date(Date.UTC(year, month - 1, day));

        return this.#formatWorkbookWeek(startDate);
    }

    #formatWorkbookWeek(startMonday) {
        // Week 1 is the week of the first Monday in the start date's calendar year.
        // This keeps cross-year meetings on the side of their starting year:
        // a Monday in late December stays in YYYY-52/53; January Mondays start at YYYY-01.
        const year = startMonday.getUTCFullYear();
        const jan1DayOfWeek = new Date(Date.UTC(year, 0, 1)).getUTCDay() || 7;
        const firstMondayDay = 1 + ((8 - jan1DayOfWeek) % 7);
        const firstMonday = new Date(Date.UTC(year, 0, firstMondayDay));

        const weekNumber = Math.floor((startMonday - firstMonday) / (7 * 86400000)) + 1;

        return `${year}-${String(weekNumber).padStart(2, '0')}`;
    }

    #extractSongs(meetingElement) {
        const songElements = meetingElement.querySelectorAll('.dc-icon--music strong:first-child');
        return Array.from(songElements).map(element => this.#parseSongNumber(element.textContent));
    }

    #parseMeetingParts(meetingElement, meetingData) {
        const bodyElements = meetingElement.querySelector('div.bodyTxt').querySelectorAll('div, h3');
        let currentSection = null;

        Array.from(bodyElements).forEach(element => {
            const sectionName = this.#findSectionFromElement(element);
            if (sectionName) {
                currentSection = sectionName;
                return;
            }

            if (currentSection && this.#isNumberedMeetingPart(element)) {
                const partData = this.#extractMeetingPart(element);
                if (partData) {
                    meetingData[currentSection].push(partData);
                }
            }
        });
    }

    #findSectionFromElement(element) {
        for (const [sectionName, iconClass] of Object.entries(this.#MEETING_SECTIONS)) {
            if (element.classList.contains(iconClass)) {
                return sectionName;
            }
        }
        return null;
    }

    #isNumberedMeetingPart(element) {
        const isHeading = element.tagName === 'H3';
        const isBaseDiv = element.tagName === 'DIV' && element.classList.contains('du-fontSize--base');
        // Match lines starting with digits followed by a dot (e.g., "1.", "10.")
        const hasNumberPrefix = /^\d+\./.test(element.textContent.trim());

        return (isHeading || isBaseDiv) && hasNumberPrefix;
    }

    #extractMeetingPart(element) {
        const titleText = element.textContent.trim();
        const descriptionElement = element.nextElementSibling;

        if (!descriptionElement) return null;

        const descriptionText = descriptionElement.textContent.trim();
        // Extract part number and title from "1. Title text"
        const titleMatch = titleText.match(/^(\d+)\.(.*)/);
        // Extract time and description from "(5 min) Additional info text"
        const descriptionMatch = descriptionText.match(/^\(([^()]*)\)\s*([^]*)/);

        if (!titleMatch || !descriptionMatch) return null;

        const partNumber = this.#extractDigits(titleMatch[1]);
        const partTitle = titleMatch[2].trim();
        const timeAllocation = this.#extractDigits(descriptionMatch[1]);
        const additionalInfo = descriptionMatch[2]?.trim() || '';

        const part = {
            number: partNumber,
            title: partTitle,
            time: timeAllocation
        };

        if (additionalInfo) {
            this.#addLessonAndAssignmentInfo(part, additionalInfo, partNumber);
        }

        return part;
    }

    #addLessonAndAssignmentInfo(part, additionalInfo, partNumber) {
        // Extract lesson reference from text ending with "(lmd p. 123)" or "(th study 15)"
        const lessonMatch = additionalInfo.match(/([^]*)\(((?:lmd|th).*)\)$/);
        if (!lessonMatch) return;

        part.lesson = lessonMatch[2].trim();
        const assignmentText = lessonMatch[1].trim();

        if (partNumber === 3) {
            part.assignment = assignmentText;
        } else {
            // Extract theme from talk format "Title. Context—Setting: Theme text"
            const talkMatch = assignmentText.match(/(^[^.]*).(?:.*)\—(?:[^]*)\: (.*)$/);
            if (this.#isTalkAssignment(part.title) || (talkMatch && this.#isTalkAssignment(talkMatch[1]))) {
                part.theme = talkMatch?.[2]?.trim();
            }
        }
    }

    #buildMeetingStructure(meetingData) {
        const structure = {
            week: meetingData.week,
            label: meetingData.label,
            theme: meetingData.theme,
            opening_song: meetingData.songs[0],
            opening_talk: meetingData.gem[0],
            spiritual_gems: meetingData.gem[1],
            bible_reading: meetingData.gem[2],
            apply_yourself_to_the_field_ministry: meetingData.wheat,
            middle_song: meetingData.songs[1],
            living_as_christians: meetingData.sheep.slice(0, -1),
            congregation_bible_study: meetingData.sheep[meetingData.sheep.length - 1],
            closing_song: meetingData.songs[2]
        };

        return this.#removeNullValues(structure);
    }

    #removeNullValues(obj) {
        return Object.entries(obj).reduce((result, [key, value]) => {
            if (value !== null) {
                result[key] = value;
            }
            return result;
        }, {});
    }

    #isTalkAssignment(title) {
        return ['Talk', 'Discurso'].includes(title);
    }

    #getTextContent(selector, baseElement) {
        return this.#getElement(selector, baseElement)?.textContent || '';
    }

    #getElement(selector, baseElement) {
        return (baseElement || document).querySelector(selector);
    }

    #extractDigits(text) {
        // Remove all non-digit characters and convert to number
        return +text.replace(/\D/g, '');
    }

    #parseSongNumber(text) {
        const songNumber = this.#extractDigits(text);
        return songNumber >= 1 && songNumber <= 161 ? songNumber : '-';
    }
}

// Initialize the meeting extractor when the content script loads
new MeetingExtractor();